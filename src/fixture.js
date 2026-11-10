// Deliberately generates a known PDF; this is not a parser for arbitrary PDFs.
const encode = value => new TextEncoder().encode(value);
export function prepareFixture(capacity = 32768) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1048576) throw new Error('Invalid CMS reservation');
  const marker = '[0 0000000000 0000000000 0000000000]';
  const content = 'BT /F1 16 Tf 40 140 Td (CryptoPro embedded signing feasibility fixture) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] /SigFlags 3 >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encode(content).length} >>\nstream\n${content}endstream`,
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (FeasibilitySignature) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R /F 132 >>',
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange ${marker} /Contents <${'0'.repeat(capacity * 2)}> >>`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const start = pdf.indexOf('/Contents <') + '/Contents '.length;
  const end = start + capacity * 2 + 2;
  const range = [0, start, end, encode(pdf).length - end];
  const replacement = `[0 ${range.slice(1).map(n => String(n).padStart(10, '0')).join(' ')}]`;
  if (replacement.length !== marker.length) throw new Error('ByteRange overflow');
  pdf = pdf.replace(marker, replacement);
  const bytes = encode(pdf);
  return { bytes, range, capacity, covered: coveredBytes(bytes, range) };
}

export function coveredBytes(bytes, [zero, start, end, length]) {
  if (zero !== 0 || start < 0 || end <= start || end + length !== bytes.length) throw new Error('Invalid ByteRange');
  const result = new Uint8Array(start + length);
  result.set(bytes.subarray(0, start)); result.set(bytes.subarray(end), start);
  return result;
}

export function embedCms(prepared, cms) {
  if (!cms.length || cms.length > prepared.capacity) throw new Error('CMS exceeds reservation or is empty; regenerate with a larger reservation and sign again.');
  const output = prepared.bytes.slice();
  const hex = Array.from(cms, byte => byte.toString(16).padStart(2, '0')).join('');
  output.set(encode(hex), prepared.range[1] + 1);
  return output;
}
