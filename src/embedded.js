import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFString,
  PDFHexString,
} from 'pdf-lib';
import { fromBase64, toBase64 } from './binary.js';
import { coveredBytes, embedCms } from './pdf-signature.js';

const name = PDFName.of;
const marker = '0'.repeat(48);
const encode = (value) => new TextEncoder().encode(value);

// Inspect parsed objects, including compressed objects and escaped PDF names.
export async function assertUnsigned(bytes) {
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  if (pdf.isEncrypted) throw new Error('Encrypted PDFs are not supported.');
  const seen = new Set();
  function inspect(object) {
    if (seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) {
      object.asArray().forEach(inspect);
      return;
    }
    if (!(object instanceof PDFDict)) return;
    if (
      object.has(name('ByteRange')) ||
      object.get(name('FT')) === name('Sig') ||
      object.get(name('Type')) === name('Sig') ||
      object.has(name('Perms')) ||
      object.has(name('DocMDP')) ||
      object.has(name('UR3'))
    ) {
      throw new Error(
        'Existing signature field or certification restrictions detected. Signing or editing this PDF is not supported.',
      );
    }
    object.values().forEach(inspect);
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects())
    inspect(object);
  return pdf;
}

export async function prepareEmbedded(input, capacity = 32768) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1048576)
    throw new Error('Invalid CMS reservation');
  const pdf = await assertUnsigned(input);
  if (!pdf.getPageCount()) throw new Error('PDF has no pages.');
  const context = pdf.context,
    page = pdf.getPage(0);
  const signature = context.register(
    context.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: PDFString.of(marker),
      Contents: PDFHexString.of('0'.repeat(capacity * 2)),
    }),
  );
  const field = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of('PDFSignerSignature'),
      Rect: [0, 0, 0, 0],
      P: page.ref,
      V: signature,
      F: 132,
    }),
  );
  page.node.addAnnot(field);
  let form = pdf.catalog.lookupMaybe(name('AcroForm'), PDFDict);
  if (!form) {
    form = context.obj({ Fields: [] });
    pdf.catalog.set(name('AcroForm'), context.register(form));
  }
  if (form.has(name('XFA'))) throw new Error('XFA forms are not supported.');
  let fields = form.lookupMaybe(name('Fields'), PDFArray);
  if (!fields) {
    fields = context.obj([]);
    form.set(name('Fields'), fields);
  }
  fields.push(field);
  form.set(name('SigFlags'), context.obj(3));
  const bytes = await pdf.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  });
  const text = new TextDecoder('latin1').decode(bytes);
  const objectStart = text.indexOf(`${signature.objectNumber} 0 obj\n`);
  const objectEnd = text.indexOf('endobj', objectStart);
  const rangeStart = text.indexOf(`(${marker})`, objectStart);
  const start = text.indexOf('/Contents <', objectStart) + '/Contents '.length;
  const end = start + capacity * 2 + 2;
  if (
    objectStart < 0 ||
    rangeStart < objectStart ||
    rangeStart > objectEnd ||
    start < objectStart ||
    end > objectEnd ||
    text[end - 1] !== '>'
  )
    throw new Error('Could not locate PDF signature reservation.');
  const range = [0, start, end, bytes.length - end];
  const replacement = `[${range.join(' ')}${' '.repeat(50 - range.join(' ').length - 2)}]`;
  bytes.set(encode(replacement), rangeStart);
  return { bytes, range, capacity, covered: coveredBytes(bytes, range) };
}

// Read the signature back from the assembled PDF, rather than verifying only
// the CMS returned by the provider before insertion.
export async function extractEmbedded(bytes) {
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  const signatures = pdf.context
    .enumerateIndirectObjects()
    .map(([, value]) => value)
    .filter(
      (value) =>
        value instanceof PDFDict && value.get(name('Type')) === name('Sig'),
    );
  if (signatures.length !== 1)
    throw new Error('Expected exactly one embedded signature.');
  const signature = signatures[0];
  const range = signature
    .lookup(name('ByteRange'), PDFArray)
    .asArray()
    .map((value) => Number(value.toString()));
  if (
    range.length !== 4 ||
    !range.every(Number.isSafeInteger) ||
    range[1] < 1 ||
    range[2] <= range[1] ||
    range[3] < 0 ||
    bytes[range[1]] !== 60 ||
    bytes[range[2] - 1] !== 62
  )
    throw new Error('Invalid embedded ByteRange.');
  const reserved = signature.lookup(name('Contents'), PDFHexString).asBytes();
  // CMS ContentInfo uses an ASN.1 SEQUENCE with a definite DER length.
  if (reserved[0] !== 0x30) throw new Error('Invalid CMS sequence.');
  let size = reserved[1],
    header = 2;
  if (size & 0x80) {
    const count = size & 0x7f;
    if (!count || count > 4 || count + 2 > reserved.length)
      throw new Error('Invalid CMS length.');
    size = 0;
    header += count;
    for (let i = 0; i < count; i++) size = size * 256 + reserved[2 + i];
  }
  const end = header + size;
  if (
    end > reserved.length ||
    end < 2 ||
    reserved.subarray(end).some((byte) => byte !== 0)
  )
    throw new Error('Invalid CMS padding or length.');
  return {
    covered: coveredBytes(bytes, range),
    cms: reserved.slice(0, end),
    range,
  };
}

export async function createEmbedded(
  adapter,
  bytes,
  thumbprint,
  isCurrent = () => true,
) {
  const frozen = bytes.slice();
  for (let capacity = 32768; capacity <= 1048576; capacity *= 2) {
    if (!isCurrent()) throw new Error('Signing cancelled.');
    const prepared = await prepareEmbedded(frozen, capacity);
    if (!isCurrent()) throw new Error('Signing cancelled.');
    const cms = fromBase64(await adapter.sign(prepared.covered, thumbprint));
    if (!isCurrent()) throw new Error('Signing cancelled.');
    if (cms.length > capacity) continue;
    const output = embedCms(prepared, cms);
    const extracted = await extractEmbedded(output);
    await adapter.verify(extracted.covered, toBase64(extracted.cms));
    const changed = extracted.covered.slice();
    changed[0] ^= 1;
    let rejected = false;
    try {
      await adapter.verify(changed, toBase64(extracted.cms));
    } catch {
      rejected = true;
    }
    if (!rejected)
      throw new Error(
        'Verification accepted changed content. No downloads were created.',
      );
    return { pdf: output };
  }
  throw new Error(
    'CMS exceeds the maximum 1 MiB reservation. No result was created.',
  );
}
