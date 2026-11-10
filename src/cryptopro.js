import { toBase64 } from './binary.js';
import { deadline } from './detached.js';

export class CryptoPro {
  constructor(api) {
    this.api = api; this.pluginVersion = ''; this.cspVersion = '';
    for (const name of ['certificates', 'sign', 'verify']) {
      const operation = this[name].bind(this);
      this[name] = (...args) => deadline(() => operation(...args));
    }
  }
  static async connect() {
    if (!globalThis.cadesplugin) throw new Error('Official bridge missing. Check vendor/cadesplugin_api.js and the installation instructions in README.md.');
    let timer;
    try {
      await Promise.race([globalThis.cadesplugin, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Bridge timed out. Check native plug-in, browser extension and site access.')), 20000); })]);
    } finally { clearTimeout(timer); }
    const adapter = new CryptoPro(globalThis.cadesplugin);
    return deadline(async () => {
    const about = await adapter.api.CreateObjectAsync('CAdESCOM.About');
    const pluginVersion = await about.PluginVersion;
    adapter.pluginVersion = await pluginVersion.toString();
    const cspVersion = await about.CSPVersion('', 80);
    adapter.cspVersion = await cspVersion.toString();
    return adapter;
    }, 20000);
  }
  async withStore(action) {
    const store = await this.api.CreateObjectAsync('CAdESCOM.Store');
    await store.Open(this.api.CAPICOM_CURRENT_USER_STORE, 'My', this.api.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED);
    try { return await action(await store.Certificates); } finally { await store.Close(); }
  }
  async certificates() {
    return this.withStore(async collection => {
      const result = [];
      for (let i = 1; i <= await collection.Count; i++) {
        const cert = await collection.Item(i);
        const from = new Date(await cert.ValidFromDate), to = new Date(await cert.ValidToDate);
        if (!await cert.HasPrivateKey() || from > new Date() || to < new Date()) continue;
        const key = await cert.PublicKey();
        const algorithm = await key.Algorithm;
        result.push({ thumbprint: await cert.Thumbprint, subject: await cert.SubjectName, issuer: await cert.IssuerName, validFrom: from.toISOString(), validTo: to.toISOString(), serial: await cert.SerialNumber, algorithm: await algorithm.Value });
      }
      return result;
    });
  }
  async signedData(bytes) {
    const data = await this.api.CreateObjectAsync('CAdESCOM.CadesSignedData');
    await data.propset_ContentEncoding(this.api.CADESCOM_BASE64_TO_BINARY);
    await data.propset_Content(toBase64(bytes));
    return data;
  }
  async sign(bytes, thumbprint) {
    return this.withStore(async collection => {
      const matches = await collection.Find(this.api.CAPICOM_CERTIFICATE_FIND_SHA1_HASH, thumbprint);
      if (await matches.Count !== 1) throw new Error('Selected certificate no longer available');
      const cert = await matches.Item(1);
      const now = new Date();
      if (!await cert.HasPrivateKey() || new Date(await cert.ValidFromDate) > now || new Date(await cert.ValidToDate) < now) throw new Error('Certificate expired, not yet valid, or has no private key');
      const signer = await this.api.CreateObjectAsync('CAdESCOM.CPSigner');
      await signer.propset_Certificate(cert);
      await signer.propset_Options(this.api.CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN);
      const data = await this.signedData(bytes);
      return data.SignCades(signer, this.api.CADESCOM_CADES_BES, true);
    });
  }
  async verify(bytes, signature) {
    const data = await this.signedData(bytes);
    await data.VerifyCades(signature, this.api.CADESCOM_CADES_BES, true);
  }
}
