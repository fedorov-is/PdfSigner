import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  prepareEmbedded,
  createEmbedded,
  extractEmbedded,
  assertUnsigned,
} from '../src/embedded.js';
import { embedCms, coveredBytes } from '../src/pdf-signature.js';
import { fromBase64, toBase64 } from '../src/binary.js';

async function input() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 500]).drawText('Original content');
  pdf.addPage([500, 300]);
  return pdf.save(); // compressed object streams exercise parsed detection
}
const digest = (bytes) => createHash('sha256').update(bytes).digest();
function adapter(padding = 0) {
  return {
    calls: 0,
    async sign(bytes) {
      this.calls++;
      const payload = new Uint8Array(32 + padding);
      payload.set(digest(bytes));
      const size = payload.length;
      return toBase64(
        Uint8Array.from([
          0x30,
          0x83,
          size >>> 16,
          (size >>> 8) & 255,
          size & 255,
          ...payload,
        ]),
      );
    },
    async verify(bytes, signature) {
      assert.deepEqual(
        fromBase64(signature).slice(5, 37),
        new Uint8Array(digest(bytes)),
      );
    },
  };
}
test('uploaded PDF keeps pages and content; final ranges and extracted CMS verify', async () => {
  const original = await input(),
    mock = adapter();
  const result = await createEmbedded(mock, original, 'key');
  const parsed = await PDFDocument.load(result.pdf);
  assert.equal(parsed.getPageCount(), 2);
  assert.deepEqual(parsed.getPage(0).getSize(), { width: 300, height: 500 });
  const extracted = await extractEmbedded(result.pdf);
  await mock.verify(extracted.covered, toBase64(extracted.cms));
  const changed = result.pdf.slice();
  changed[10] ^= 1;
  await assert.rejects(
    mock.verify(
      coveredBytes(changed, extracted.range),
      toBase64(extracted.cms),
    ),
  );
  await assert.rejects(assertUnsigned(result.pdf), /Existing signature/);
});
test('overflow prepares new ranges and signs again; cancellation prevents retry', async () => {
  const mock = adapter(40000);
  await createEmbedded(mock, await input(), 'key');
  assert.equal(mock.calls, 2);
  const cancelled = adapter(40000);
  await assert.rejects(
    createEmbedded(
      cancelled,
      await input(),
      'key',
      () => cancelled.calls === 0,
    ),
    /cancelled/,
  );
  assert.equal(cancelled.calls, 1);
});
test('invalid CMS, failed verification, and non-checking verifier produce no result', async () => {
  const bytes = await input();
  await assert.rejects(
    createEmbedded({ sign: async () => 'bad!' }, bytes, 'key'),
    /base64/,
  );
  await assert.rejects(
    createEmbedded(
      { sign: async () => toBase64(new Uint8Array([1, 2])) },
      bytes,
      'key',
    ),
    /CMS/,
  );
  const mock = adapter();
  mock.verify = async () => {};
  await assert.rejects(createEmbedded(mock, bytes, 'key'), /changed content/);
  const broken = adapter();
  broken.verify = async () => {
    throw new Error('verification failed');
  };
  await assert.rejects(
    createEmbedded(broken, bytes, 'key'),
    /verification failed/,
  );
});
test('reservation stays fixed; malformed lengths and nonzero padding are rejected', async () => {
  const prepared = await prepareEmbedded(await input(), 16);
  assert.throws(() => embedCms(prepared, new Uint8Array(17)), /reservation/);
  await assert.rejects(
    extractEmbedded(embedCms(prepared, new Uint8Array([0x30, 0x82, 1, 0]))),
    /length/,
  );
  await assert.rejects(
    extractEmbedded(embedCms(prepared, new Uint8Array([0x30, 1, 5, 7]))),
    /padding/,
  );
});
test('compressed signature fields, nested certification dictionaries, XFA and malformed input fail safely', async () => {
  for (const entry of [
    { FT: 'Sig' },
    { Perms: { DocMDP: PDFString.of('restricted') } },
  ]) {
    const pdf = await PDFDocument.load(await input());
    pdf.catalog.set(
      PDFName.of('AcroForm'),
      pdf.context.obj({ Fields: [entry] }),
    );
    await assert.rejects(
      assertUnsigned(await pdf.save()),
      /Existing signature/,
    );
  }
  const pdf = await PDFDocument.load(await input());
  pdf.catalog.set(
    PDFName.of('AcroForm'),
    pdf.context.obj({ XFA: PDFString.of('form') }),
  );
  await assert.rejects(prepareEmbedded(await pdf.save()), /XFA/);
  await assert.rejects(prepareEmbedded(new Uint8Array([1, 2, 3])));
});
