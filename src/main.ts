import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CryptoPro } from './cryptopro.js';
import { createDetached, deadline } from './detached.js';

GlobalWorkerOptions.workerSrc = workerUrl;
const el = <T extends HTMLElement>(id: string) => window.document.getElementById(id) as T;
const fileInput = el<HTMLInputElement>('file');
const pageInput = el<HTMLInputElement>('page');
const zoom = el<HTMLSelectElement>('zoom');
const canvas = el<HTMLCanvasElement>('preview');
const container = el('canvas-container');
const theme = el<HTMLInputElement>('theme');
let document: PDFDocumentProxy | undefined;
let loading: PDFDocumentLoadingTask | undefined;
let render: RenderTask | undefined;
let generation = 0;
let rendering = 0;
let page = 1;
let source: { bytes: Uint8Array; name: string } | undefined;
let adapter: CryptoPro | undefined;
let signing = false;
let signingRun = 0;
const downloads: string[] = [];
function discardResult() {
  downloads.forEach(url => URL.revokeObjectURL(url));
  downloads.length = 0;
  el('downloads').replaceChildren();
}
function signingControls() {
  el<HTMLButtonElement>('sign').disabled = signing || !source || !adapter || certificates.disabled;
  el<HTMLButtonElement>('cancel-sign').hidden = !signing;
  el<HTMLButtonElement>('connect').disabled = signing;
}
function invalidateSigning() {
  signingRun++;
  signing = false;
  discardResult();
  el('signing-status').textContent = '';
  signingControls();
}
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 500;
const MAX_PIXELS = 8_000_000;

function status(message: string, error = false) {
  el('status').textContent = message;
  el('status').classList.toggle('error', error);
}
function applyTheme(dark: boolean) {
  window.document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  theme.checked = dark;
}
let stored: string | null = null;
try { stored = localStorage.getItem('pdf-signer-theme'); } catch { /* Storage is optional. */ }
applyTheme(stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
theme.addEventListener('change', () => {
  applyTheme(theme.checked);
  try { localStorage.setItem('pdf-signer-theme', theme.checked ? 'dark' : 'light'); } catch { /* Storage is optional. */ }
});
function controls() {
  pageInput.value = String(page);
  pageInput.max = String(document?.numPages ?? 1);
  el<HTMLButtonElement>('previous').disabled = !document || page <= 1;
  el<HTMLButtonElement>('next').disabled = !document || page >= document.numPages;
}
async function clear() {
  source = undefined;
  invalidateSigning();
  generation++;
  rendering++;
  render?.cancel();
  render = undefined;
  const old = loading;
  loading = undefined;
  document = undefined;
  canvas.width = canvas.height = 0;
  el('workspace').hidden = true;
  container.setAttribute('aria-busy', 'false');
  el('filename').textContent = '';
  el('file-size').textContent = '';
  el('total-pages').textContent = '';
  fileInput.value = '';
  page = 1;
  zoom.value = 'fit';
  controls();
  if (old) await old.destroy().catch(() => {});
}
async function draw() {
  const pdf = document;
  if (!pdf) return;
  const id = ++rendering;
  const previous = render;
  previous?.cancel();
  container.setAttribute('aria-busy', 'true');
  status(`Rendering page ${page} of ${pdf.numPages}…`);
  try {
    if (previous) await previous.promise.catch(() => {});
    const current = await pdf.getPage(page);
    if (id !== rendering) return;
    const base = current.getViewport({ scale: 1 });
    const requested = zoom.value === 'fit' ? Math.max(0.1, (container.clientWidth - 32) / base.width) : Number(zoom.value);
    const viewport = current.getViewport({ scale: Math.min(requested, Math.sqrt(MAX_PIXELS / (base.width * base.height))) });
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `Page ${page} of ${pdf.numPages}. Visual preview.`);
    render = current.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
    await render.promise;
    if (id === rendering) status(`Page ${page} of ${pdf.numPages}. Preview ready.`);
  } catch (error) {
    if (id === rendering) {
      canvas.width = canvas.height = 0;
      status(`Unable to render this page: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  } finally { if (id === rendering) container.setAttribute('aria-busy', 'false'); }
}
async function open(file: File) {
  const clearing = clear();
  const id = generation;
  await clearing;
  if (id !== generation) return;
  status(`Loading ${file.name}…`);
  try {
    if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a non-empty PDF no larger than 20 MiB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (id !== generation) return;
    if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('This file does not have a PDF header.');
    const assets = `${import.meta.env.BASE_URL}pdfjs/`;
    const task = getDocument({ data: bytes.slice(), cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
    loading = task;
    // Encrypted documents are deliberately unsupported in this milestone.
    task.onPassword = () => { if (id === generation) { void clear(); status('Password-protected PDFs are not supported. Open an unencrypted copy.', true); } };
    const pdf = await task.promise;
    if (id !== generation) return;
    if (pdf.numPages > MAX_PAGES) throw new Error('This PDF exceeds the 500-page preview limit.');
    const fields = await pdf.getFieldObjects();
    if (id !== generation) return;
    const signed = Object.values(fields ?? {}).flat().some(field => field.type === 'Sig');
    if (signed || /\/ByteRange\s*\[|\/FT\s*\/Sig\b/.test(new TextDecoder('latin1').decode(bytes))) {
      el('signing-status').textContent = 'Existing signature detected. Signing this PDF is not supported yet.';
    } else source = { bytes, name: file.name };
    document = pdf;
    signingControls();
    el('filename').textContent = file.name;
    el('file-size').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MiB`;
    el('total-pages').textContent = String(pdf.numPages);
    el('page-count').textContent = `of ${pdf.numPages}`;
    el('workspace').hidden = false;
    controls();
    await draw();
  } catch (error) {
    if (id !== generation) return;
    await clear();
    status(`Could not open PDF: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void open(file); });
el('reset').addEventListener('click', () => { void clear(); status('No document loaded.'); fileInput.focus(); });
function go(target: number) {
  if (!document) return;
  page = Math.max(1, Math.min(document.numPages, Number.isFinite(target) ? Math.trunc(target) : page));
  controls();
  container.scrollTop = container.scrollLeft = 0;
  void draw();
}
el('previous').addEventListener('click', () => go(page - 1));
el('next').addEventListener('click', () => go(page + 1));
pageInput.addEventListener('change', () => go(Number(pageInput.value)));
zoom.addEventListener('change', () => { void draw(); });
let resizeTimer: ReturnType<typeof setTimeout>;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (zoom.value === 'fit') void draw(); }, 120); }).observe(container);
const drop = el('drop-zone');
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => {
  event.preventDefault(); drop.classList.remove('dragging');
  const files = event.dataTransfer?.files;
  if (files?.length === 1) void open(files[0]);
  else status('Drop one PDF at a time.', true);
});
const certificates = el<HTMLSelectElement>('certificate');
let available: { thumbprint: string; subject: string; issuer: string; validFrom: string; validTo: string; serial: string; algorithm: string }[] = [];
certificates.addEventListener('change', () => {
  invalidateSigning();
  const cert = available.find(item => item.thumbprint === certificates.value);
  el('certificate-details').textContent = cert ? `Issuer: ${cert.issuer}. Serial: ${cert.serial}. Valid from ${new Date(cert.validFrom).toLocaleDateString()} until ${new Date(cert.validTo).toLocaleDateString()}. Key algorithm: ${cert.algorithm}.` : '';
});
el('connect').addEventListener('click', async () => {
  const button = el<HTMLButtonElement>('connect');
  button.disabled = true;
  invalidateSigning();
  adapter = undefined;
  available = []; certificates.replaceChildren(); certificates.disabled = true;
  el('certificate-details').textContent = '';
  el('readiness-status').textContent = 'Checking bridge and native API… Complete any CryptoPro access dialogs.';
  try {
    if (!window.document.querySelector('script[data-cryptopro]')) {
      await deadline(() => new Promise<void>((resolve, reject) => {
        const script = window.document.createElement('script');
        script.dataset.cryptopro = 'true';
        script.src = `${import.meta.env.BASE_URL}vendor/cadesplugin_api.js`;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('Could not load the local CryptoPro bridge')); };
        window.document.head.append(script);
      }), 20000);
    }
    const connected = await CryptoPro.connect();
    adapter = connected;
    available = await connected.certificates();
    for (const cert of available) certificates.add(new Option(cert.subject, cert.thumbprint));
    certificates.disabled = !available.length;
    certificates.dispatchEvent(new Event('change'));
    el('readiness-status').textContent = `Plug-in ${connected.pluginVersion}; CSP ${connected.cspVersion}. ${available.length} time-valid certificate(s) with private keys. Key access is confirmed only by signing.`;
    if (!available.length) certificates.add(new Option('No time-valid certificates with private keys found'));
  } catch (error) {
    el('readiness-status').textContent = `CryptoPro unavailable: ${error instanceof Error ? error.message : String(error)}. Check CSP, Browser plug-in and extension installation. Preview remains available.`;
    certificates.add(new Option('CryptoPro unavailable'));
  } finally { button.disabled = false; signingControls(); }
});
el('sign').addEventListener('click', async () => {
  if (!source || !adapter || signing) return;
  discardResult();
  const current = source, selected = certificates.value, active = adapter;
  const run = ++signingRun;
  signing = true;
  signingControls();
  el('signing-status').textContent = 'Signing and verifying. Complete CryptoPro access or PIN dialogs.';
  try {
    const result = await deadline(() => createDetached(active, current.bytes, selected));
    if (run !== signingRun) return;
    for (const [bytes, name, type] of [[result.pdf, current.name, 'application/pdf'], [result.signature, current.name + '.sig', 'application/pkcs7-signature']] as const) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
      downloads.push(url);
      const link = window.document.createElement('a');
      link.href = url; link.download = name; link.textContent = 'Download ' + name;
      el('downloads').append(link, window.document.createElement('br'));
    }
    el('signing-status').textContent = 'Detached CAdES-BES verified by CryptoPro; changed-byte check rejected. Keep both files together. Certificate trust and revocation are not independently assessed. No trusted timestamp is included.';
  } catch (error) {
    if (run !== signingRun) return;
    discardResult();
    el('signing-status').textContent = 'Signing failed: ' + (error instanceof Error ? error.message : String(error)) + '. Check certificate validity, private-key access and token connection. If access was denied or cancelled, retry explicitly. No result is available.';
  } finally { if (run === signingRun) { signing = false; signingControls(); } }
});
el('cancel-sign').addEventListener('click', () => {
  invalidateSigning();
  el('signing-status').textContent = 'Cancelled. No result is available. Dismiss any CryptoPro dialog; the browser cannot cancel a native operation already in progress.';
});
window.addEventListener('pagehide', () => { void clear(); });
controls();
