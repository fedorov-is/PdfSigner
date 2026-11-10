export function toBase64(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}

export function fromBase64(value) {
  const clean = value.replace(/\s/g, '');
  if (!clean || clean.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Invalid CMS base64');
  return Uint8Array.from(atob(clean), char => char.charCodeAt(0));
}
