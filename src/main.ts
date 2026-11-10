import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CryptoPro } from './cryptopro.js';

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
    const task = getDocument({ data: bytes, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
    loading = task;
    // Encrypted documents are deliberately unsupported in this milestone.
    task.onPassword = () => { if (id === generation) { void clear(); status('Password-protected PDFs are not supported. Open an unencrypted copy.', true); } };
    const pdf = await task.promise;
    if (id !== generation) return;
    if (pdf.numPages > MAX_PAGES) throw new Error('This PDF exceeds the 500-page preview limit.');
    document = pdf;
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
let available: { thumbprint: string; subject: string; issuer: string; validTo: string; algorithm: string }[] = [];
certificates.addEventListener('change', () => {
  const cert = available.find(item => item.thumbprint === certificates.value);
  el('certificate-details').textContent = cert ? `Issuer: ${cert.issuer}. Valid until ${new Date(cert.validTo).toLocaleDateString()}. Key algorithm: ${cert.algorithm}.` : '';
});
el('connect').addEventListener('click', async () => {
  const button = el<HTMLButtonElement>('connect');
  button.disabled = true;
  available = []; certificates.replaceChildren(); certificates.disabled = true;
  el('certificate-details').textContent = '';
  el('readiness-status').textContent = 'Checking bridge and native API… Complete any CryptoPro access dialogs.';
  try {
    if (!window.document.querySelector('script[data-cryptopro]')) {
      await new Promise<void>((resolve, reject) => {
        const script = window.document.createElement('script');
        script.dataset.cryptopro = 'true';
        script.src = `${import.meta.env.BASE_URL}vendor/cadesplugin_api.js`;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('Could not load the local CryptoPro bridge')); };
        window.document.head.append(script);
      });
    }
    const adapter = await CryptoPro.connect();
    available = await adapter.certificates();
    for (const cert of available) certificates.add(new Option(cert.subject, cert.thumbprint));
    certificates.disabled = !available.length;
    certificates.dispatchEvent(new Event('change'));
    el('readiness-status').textContent = `Plug-in ${adapter.pluginVersion}; CSP ${adapter.cspVersion}. ${available.length} time-valid certificate(s) with private keys. Key access is confirmed only by signing.`;
    if (!available.length) certificates.add(new Option('No eligible certificates found'));
  } catch (error) {
    el('readiness-status').textContent = `CryptoPro unavailable: ${error instanceof Error ? error.message : String(error)}. Check CSP, Browser plug-in and extension installation. Preview remains available.`;
    certificates.add(new Option('CryptoPro unavailable'));
  } finally { button.disabled = false; }
});
window.addEventListener('pagehide', () => { void clear(); });
controls();
