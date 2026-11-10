import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoPro } from '../src/cryptopro.js';

function nativeDouble({ deny = false } = {}) {
  const calls = [];
  const cert = {
    HasPrivateKey: async () => true,
    ValidFromDate: '2020-01-01',
    ValidToDate: '2100-01-01',
  };
  const collection = {
    Count: 1,
    Item: async () => cert,
    Find: async (...args) => {
      calls.push(['find', ...args]);
      return collection;
    },
  };
  const api = {
    CAPICOM_CURRENT_USER_STORE: 2,
    CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED: 2,
    CAPICOM_CERTIFICATE_FIND_SHA1_HASH: 0,
    CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN: 1,
    CADESCOM_BASE64_TO_BINARY: 1,
    CADESCOM_CADES_BES: 1,
    async CreateObjectAsync(name) {
      if (name === 'CAdESCOM.Store')
        return {
          Open: async () => calls.push(['open']),
          Certificates: collection,
          Close: async () => calls.push(['close']),
        };
      if (name === 'CAdESCOM.CPSigner')
        return {
          propset_Certificate: async (value) => assert.equal(value, cert),
          propset_Options: async () => {},
        };
      if (name === 'CAdESCOM.CadesSignedData')
        return {
          propset_ContentEncoding: async (value) =>
            calls.push(['encoding', value]),
          propset_Content: async (value) => calls.push(['content', value]),
          SignCades: async (_signer, profile, detached) => {
            calls.push(['sign', profile, detached]);
            if (deny) throw new Error('Access denied');
            return 'MAA=';
          },
          VerifyCades: async (...args) => calls.push(['verify', ...args]),
        };
      throw new Error(`Unexpected object ${name}`);
    },
  };
  return { adapter: new CryptoPro(api), calls };
}
test('adapter explicitly signs binary content as detached BES and verifies using the same convention', async () => {
  const { adapter, calls } = nativeDouble();
  const bytes = new Uint8Array([0, 128, 255, 10]);
  const signature = await adapter.sign(bytes, 'selected-thumbprint');
  await adapter.verify(bytes, signature);
  assert.deepEqual(calls, [
    ['open'],
    ['find', 0, 'selected-thumbprint'],
    ['encoding', 1],
    ['content', 'AID/Cg=='],
    ['sign', 1, true],
    ['close'],
    ['encoding', 1],
    ['content', 'AID/Cg=='],
    ['verify', 'MAA=', 1, true],
  ]);
});
test('native signing rejection propagates and closes the certificate store', async () => {
  const { adapter, calls } = nativeDouble({ deny: true });
  await assert.rejects(
    adapter.sign(new Uint8Array([0]), 'thumbprint'),
    /Access denied/,
  );
  assert.deepEqual(calls.at(-1), ['close']);
});
