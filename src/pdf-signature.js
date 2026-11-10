const encode = (value) => new TextEncoder().encode(value);

export function coveredBytes(bytes, [zero, start, end, length]) {
  if (zero !== 0 || start < 0 || end <= start || end + length !== bytes.length)
    throw new Error('Invalid ByteRange');
  const result = new Uint8Array(start + length);
  result.set(bytes.subarray(0, start));
  result.set(bytes.subarray(end), start);
  return result;
}

export function embedCms(prepared, cms) {
  if (!cms.length || cms.length > prepared.capacity)
    throw new Error(
      'CMS exceeds reservation or is empty; regenerate with a larger reservation and sign again.',
    );
  const output = prepared.bytes.slice();
  const hex = Array.from(cms, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  output.set(encode(hex), prepared.range[1] + 1);
  return output;
}
