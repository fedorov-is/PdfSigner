import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDetached, deadline } from '../src/detached.js';

test('detached output preserves binary bytes, decodes DER and rejects tampering', async () => {
  const bytes = new Uint8Array([37, 0, 128, 255]);
  let signed;
  const adapter = {
    sign: async (content) => {
      signed = content.slice();
      return 'MAA=';
    },
    verify: async (content) => {
      assert.deepEqual(content, signed);
    },
  };
  const result = await createDetached(adapter, bytes, 'certificate');
  assert.deepEqual(result.pdf, bytes);
  assert.notEqual(result.pdf, bytes);
  assert.deepEqual(result.signature, new Uint8Array([48, 0]));
});

test('failed verification, signing cancellation and accepted tampering produce no output', async () => {
  await assert.rejects(
    createDetached(
      {
        sign: async () => {
          throw new Error('Cancelled');
        },
      },
      new Uint8Array([1]),
      'cert',
    ),
    /Cancelled/,
  );
  await assert.rejects(
    createDetached(
      {
        sign: async () => 'MAA=',
        verify: async () => {
          throw new Error('Invalid');
        },
      },
      new Uint8Array([1]),
      'cert',
    ),
    /Invalid/,
  );
  await assert.rejects(
    createDetached(
      { sign: async () => 'MAA=', verify: async () => {} },
      new Uint8Array([1]),
      'cert',
    ),
    /accepted changed content/,
  );
});

test('unresponsive native operation times out', async () => {
  await assert.rejects(
    deadline(() => new Promise(() => {}), 5),
    /timed out/,
  );
});
