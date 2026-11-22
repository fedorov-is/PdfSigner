import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase64, fromBase64 } from '../src/shared/lib/binary.js';

test('base64 round trips every byte, including NUL, high bytes and chunk boundaries', () => {
  const bytes = Uint8Array.from({ length: 25000 }, (_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.throws(() => fromBase64('not base64!'));
});
