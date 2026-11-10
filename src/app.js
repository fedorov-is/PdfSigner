import { t, initLocalization } from './i18n.js';
import { CryptoPro } from './cryptopro.js';
import { fromBase64 } from './binary.js';
import { prepareFixture, embedCms, coveredBytes } from './fixture.js';

initLocalization();
const $ = id => document.getElementById(id);
let adapter, certificates = [], busy = false;
const urls = [];
function clearDownloads() { urls.splice(0).forEach(URL.revokeObjectURL); $('downloads').replaceChildren(); }
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })); urls.push(url);
  const link = document.createElement('a'); link.href = url; link.download = name; link.textContent = t("Download {0}", name); $('downloads').append(link);
}
function controls() {
  $('connect').disabled = busy; $('file').disabled = busy;
  $('certificate').disabled = busy || !certificates.length;
  $('detached').disabled = busy || !adapter || !certificates.length || !$('file').files.length;
  $('embedded').disabled = busy || !adapter || !certificates.length;
}
async function run(action) {
  if (busy) return;
  busy = true; clearDownloads(); controls(); $('status').textContent = t("Working… Complete any native CryptoPro dialogs.");
  try { await action(); } catch (error) { clearDownloads(); $('status').textContent = t("Operation failed or cancelled: {0}. No output available.", t(error?.message ?? String(error))); }
  finally { busy = false; controls(); }
}
$('file').addEventListener('change', () => { clearDownloads(); controls(); });
$('certificate').addEventListener('change', () => {
  clearDownloads();
  const cert = certificates.find(c => c.thumbprint === $('certificate').value);
  $('details').textContent = cert ? t("Issuer: {0}; valid until: {1}; public key OID: {2}; thumbprint: {3}", cert.issuer, cert.validTo, cert.algorithm, cert.thumbprint) : '';
});
$('connect').addEventListener('click', () => run(async () => {
  adapter = undefined; certificates = []; $('certificate').replaceChildren(); $('details').textContent = ''; $('environment').textContent = t("Checking…");
  const connected = await CryptoPro.connect();
  $('environment').textContent = t("Bridge and native API responded\nPlug-in: {0}\nCSP (provider type 80): {1}\nBrowser: {2}\nPrivate-key usability is only established by a successful signature.", connected.pluginVersion, connected.cspVersion, navigator.userAgent);
  certificates = await connected.certificates();
  for (const cert of certificates) { const option = document.createElement('option'); option.value = cert.thumbprint; option.textContent = `${cert.subject} — ${cert.algorithm}`; $('certificate').append(option); }
  adapter = connected; $('certificate').dispatchEvent(new Event('change'));
  $('status').textContent = certificates.length ? t("{0} certificate(s) available. Select a certificate before signing.", certificates.length) : t("No time-valid certificates with a private key found in CurrentUser/My.");
}));
async function verifiedSign(bytes) {
  const signature = await adapter.sign(bytes, $('certificate').value);
  await adapter.verify(bytes, signature);
  const changed = bytes.slice(); changed[0] ^= 1;
  let rejected = false;
  try { await adapter.verify(changed, signature); } catch { rejected = true; }
  if (!rejected) throw new Error(t("Tamper check failed: changed bytes were accepted"));
  return { signature, cms: fromBase64(signature) };
}
$('detached').addEventListener('click', () => run(async () => {
  const file = $('file').files[0];
  if (!file || file.size > 20 * 1024 * 1024) throw new Error(t("Select a PDF no larger than 20 MiB"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error(t("Missing PDF header"));
  const { cms } = await verifiedSign(bytes);
  download(bytes, file.name, 'application/pdf'); download(cms, `${file.name}.sig`, 'application/pkcs7-signature');
  $('status').textContent = t("Detached CAdES-BES created; plug-in verification passed and changed-byte verification was rejected. Keep both files together. Independent verification pending.");
}));
$('embedded').addEventListener('click', () => run(async () => {
  const prepared = prepareFixture();
  const { signature, cms } = await verifiedSign(prepared.covered);
  const output = embedCms(prepared, cms);
  await adapter.verify(coveredBytes(output, prepared.range), signature);
  download(output, 'feasibility-signed.pdf', 'application/pdf');
  download(cms, 'feasibility-covered.sig', 'application/pkcs7-signature');
  download(prepared.covered, 'feasibility-covered.bin', 'application/octet-stream');
  $('status').textContent = t("Experimental PDF assembled; covered bytes verified through CryptoPro and changed-byte verification was rejected. Check the PDF in an independent GOST-capable PDF verifier before accepting feasibility.");
}));
window.addEventListener('pagehide', clearDownloads);
controls();
