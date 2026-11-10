import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase64, fromBase64 } from '../src/binary.js';
import { prepareFixture, embedCms, coveredBytes } from '../src/fixture.js';

test('base64 round trips every byte, including NUL, high bytes and chunk boundaries', () => {
  const bytes = Uint8Array.from({ length: 25000 }, (_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.throws(() => fromBase64('not base64!'));
});
test('PDF byte ranges exclude precisely the Contents hex string including delimiters', () => {
  const p = prepareFixture(1024), text = new TextDecoder().decode(p.bytes);
  assert.equal(text[p.range[1]], '<'); assert.equal(text[p.range[2] - 1], '>');
  assert.equal(p.range[2] - p.range[1], 2050);
  assert.deepEqual(text.match(/\/ByteRange \[(.*?)\]/)[1].split(' ').map(Number), p.range);
  assert.equal(p.covered.length, p.bytes.length - 2050);
  const output = embedCms(p, new Uint8Array([0x30, 0x02, 0x00, 0xff]));
  assert.equal(output.length, p.bytes.length);
  assert.deepEqual(coveredBytes(output, p.range), p.covered);
  assert.equal(new TextDecoder().decode(output.subarray(p.range[1] + 1, p.range[1] + 9)), '300200ff');
  assert.deepEqual(p.bytes.subarray(p.range[1] + 1, p.range[1] + 5), new TextEncoder().encode('0000'));
});
test('xref points to all objects and startxref points to xref', () => {
  const text = new TextDecoder().decode(prepareFixture().bytes);
  const offset = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(text.slice(offset, offset + 4), 'xref');
  const lines = text.slice(offset).split('\n');
  for (let i = 1; i <= 7; i++) assert.ok(text.slice(Number(lines[i + 2].slice(0, 10))).startsWith(`${i} 0 obj\n`));
});
test('overflow and empty signatures fail without modifying prepared bytes', () => {
  const p = prepareFixture(2), original = p.bytes.slice();
  assert.throws(() => embedCms(p, new Uint8Array(3)), /reservation/);
  assert.throws(() => embedCms(p, new Uint8Array(0)), /empty/);
  assert.deepEqual(p.bytes, original);
});
