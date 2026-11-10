import { fromBase64 } from './binary.js';

export function deadline(operation, milliseconds = 120000) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'CryptoPro timed out. Close any pending native dialog, check the token and retry.',
            ),
          ),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function createDetached(adapter, bytes, thumbprint) {
  const frozen = bytes.slice();
  const signature = await adapter.sign(frozen, thumbprint);
  await adapter.verify(frozen, signature);
  const changed = frozen.slice();
  changed[changed.length - 1] ^= 1;
  let rejected = false;
  try {
    await adapter.verify(changed, signature);
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error(
      'Verification accepted changed content. No downloads were created.',
    );
  return { pdf: frozen, signature: fromBase64(signature) };
}
