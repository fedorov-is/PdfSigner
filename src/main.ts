import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CryptoPro } from './cryptopro.js';
import { createDetached, deadline } from './detached.js';
import { assertUnsigned, createEmbedded } from './embedded.js';
import { applyStamp, stampPdf, type Stamp } from './stamp';
import { enhanceDropdowns } from './dropdown';

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
  el<HTMLButtonElement>('export-stamp').disabled = signing || !source || !stampEnabled.checked;
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
  stampEnabled.checked = false;
  el('stamp-settings').hidden = true;
  el<HTMLFieldSetElement>('stamp-fields').disabled = true;
  overlay.hidden = true;
  stampRevision++;
  for (const [key, value] of Object.entries({ page: '1', x: '24', y: '24', width: '280', height: '140' })) input(key).value = value;
  el('stamp-status').textContent = '';
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
  zoom.dispatchEvent(new Event('change'));
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
    displayScale = viewport.scale;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `Page ${page} of ${pdf.numPages}. Visual preview.`);
    render = current.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
    await render.promise;
    if (id === rendering) { status(`Page ${page} of ${pdf.numPages}. Preview ready.`); void previewStamp(); }
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
    } else {
      try { await assertUnsigned(bytes); source = { bytes, name: file.name }; }
      catch (error) { el('signing-status').textContent = error instanceof Error ? error.message : String(error); }
    }
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
  el('certificate-details').textContent = cert ? `${ownerName(cert.subject)}. Valid: ${new Date(cert.validFrom).toLocaleDateString()} – ${new Date(cert.validTo).toLocaleDateString()}.` : '';
  void previewStamp();
});
el('connect').addEventListener('click', async () => {
  const button = el<HTMLButtonElement>('connect');
  button.disabled = true;
  invalidateSigning();
  adapter = undefined;
  available = []; certificates.replaceChildren(); certificates.disabled = true;
  el('certificate-details').textContent = '';
  void previewStamp();
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
    for (const cert of available) certificates.add(new Option(ownerName(cert.subject), cert.thumbprint));
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
    const prepared = await finalPdf(current);
    if (run !== signingRun) return;
    const embedded = el<HTMLSelectElement>('signing-mode').value === 'embedded';
    const result = await deadline(() => embedded ? createEmbedded(active, prepared.bytes, selected, () => run === signingRun) : createDetached(active, prepared.bytes, selected));
    if (run !== signingRun) return;
    const artifacts: [Uint8Array, string, string][] = [[result.pdf, embedded ? prepared.name.replace(/\.pdf$/i, '') + '-signed.pdf' : prepared.name, 'application/pdf']];
    if ('signature' in result) artifacts.push([result.signature as Uint8Array, prepared.name + '.sig', 'application/pkcs7-signature']);
    for (const [bytes, name, type] of artifacts) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
      downloads.push(url);
      const link = window.document.createElement('a');
      link.href = url; link.download = name; link.textContent = 'Download ' + name;
      el('downloads').append(link, window.document.createElement('br'));
    }
    el('signing-status').textContent = embedded ? 'Embedded CAdES-BES verified by CryptoPro from the final PDF; changed-byte check rejected. Reader compatibility requires independent verification. Certificate trust and revocation are not independently assessed. No trusted timestamp is included.' : 'Detached CAdES-BES verified by CryptoPro; changed-byte check rejected. Keep both files together. Certificate trust and revocation are not independently assessed. No trusted timestamp is included.';
  } catch (error) {
    if (run !== signingRun) return;
    discardResult();
    el('signing-status').textContent = 'Signing failed: ' + (error instanceof Error ? error.message : String(error)) + '. Check certificate validity, private-key access and token connection. If access was denied or cancelled, retry explicitly. No result is available.';
  } finally { if (run === signingRun) { signingRun++; signing = false; signingControls(); } }
});
const signingMode = el<HTMLSelectElement>('signing-mode');
try {
  const savedMode = localStorage.getItem('pdf-signer-output-format');
  if (savedMode === 'detached' || savedMode === 'embedded') signingMode.value = savedMode;
} catch { /* Storage is optional. */ }
signingMode.addEventListener('change', () => {
  try { localStorage.setItem('pdf-signer-output-format', signingMode.value); } catch { /* Storage is optional. */ }
  invalidateSigning();
});
el('cancel-sign').addEventListener('click', () => {
  invalidateSigning();
  el('signing-status').textContent = 'Cancelled. No result is available. Dismiss any CryptoPro dialog; the browser cannot cancel a native operation already in progress.';
});
const stampEnabled = el<HTMLInputElement>('stamp-enabled');
const overlay = el('stamp-overlay');
let displayScale = 1, stampRevision = 0;
const input = (key: string) => el<HTMLInputElement>('stamp-' + key);
try {
  const caption = localStorage.getItem('pdf-signer-stamp-caption');
  if (caption !== null) input('caption').value = caption.slice(0, input('caption').maxLength);
} catch { /* Storage is optional. */ }
input('caption').addEventListener('input', () => {
  try { localStorage.setItem('pdf-signer-stamp-caption', input('caption').value); } catch { /* Storage is optional. */ }
});
function ownerName(subject: string) {
  const attributes = new Map<string, string>();
  for (const match of subject.matchAll(/(?:^|,\s*)([\w.]+)\s*=\s*("(?:[^"]|"")*"|(?:\\.|[^,])*)/g)) {
    attributes.set(match[1].toUpperCase(), match[2].trim().replace(/^"|"$/g, '').replace(/""/g, '"').replace(/\\(.)/g, '$1'));
  }
  const personal = [attributes.get('SN') ?? attributes.get('SURNAME'), attributes.get('G') ?? attributes.get('GIVENNAME')].filter(Boolean).join(' ');
  return personal || attributes.get('CN') || (attributes.size ? 'Owner name unavailable' : subject);
}
function stampSettings(): Stamp {
  const cert = available.find(c => c.thumbprint === certificates.value);
  return { page: Number(input('page').value), x: Number(input('x').value), y: Number(input('y').value), width: Number(input('width').value), height: Number(input('height').value), caption: input('caption').value, text: cert ? [ownerName(cert.subject), `Serial: ${cert.serial}`, `Valid: ${new Date(cert.validFrom).toLocaleDateString()} – ${new Date(cert.validTo).toLocaleDateString()}`].join('\n') : '' };
}
async function validateStamp(stamp: Stamp) {
  if (!document || !Number.isInteger(stamp.page) || stamp.page < 1 || stamp.page > document.numPages) throw new Error('Choose a valid stamp page.');
  const viewport = (await document.getPage(stamp.page)).getViewport({ scale: 1 });
  if (![stamp.x,stamp.y,stamp.width,stamp.height].every(Number.isFinite) || stamp.x < 0 || stamp.y < 0 || stamp.width < 1 || stamp.height < 1 || stamp.x + stamp.width > viewport.width + .001 || stamp.y + stamp.height > viewport.height + .001) throw new Error('Stamp must fit inside the selected visible page. Adjust position or size in points.');
  return viewport;
}
function positionStamp(stamp: Stamp) {
  Object.assign(overlay.style, { left: `${stamp.x * displayScale}px`, top: `${stamp.y * displayScale}px`, width: `${stamp.width * displayScale}px`, height: `${stamp.height * displayScale}px`, borderRadius: `${Math.min(8, stamp.width / 2, stamp.height / 2) * displayScale}px` });
}
async function previewStamp() {
  const revision = ++stampRevision;
  el('stamp-status').textContent = '';
  if (!stampEnabled.checked || !source) { overlay.hidden = true; return; }
  const stamp = stampSettings();
  if (stamp.page !== page) overlay.hidden = true;
  let task: PDFDocumentLoadingTask | undefined;
  let validGeometry = false;
  try {
    await validateStamp(stamp);
    if (revision !== stampRevision) return;
    validGeometry = true;
    positionStamp(stamp);
    overlay.hidden = stamp.page !== page;
    const bytes = await stampPdf(stamp);
    if (revision !== stampRevision) return;
    task = getDocument({ data: bytes });
    const pdf = await task.promise;
    const stampPage = await pdf.getPage(1);
    const viewport = stampPage.getViewport({ scale: displayScale * 2 });
    const temporary = window.document.createElement('canvas');
    temporary.width = Math.ceil(viewport.width); temporary.height = Math.ceil(viewport.height);
    await stampPage.render({ canvas: temporary, viewport, background: 'rgba(0,0,0,0)' }).promise;
    if (revision !== stampRevision) return;
    const target = el<HTMLCanvasElement>('stamp-preview');
    target.width = temporary.width; target.height = temporary.height;
    target.getContext('2d')!.drawImage(temporary, 0, 0);
    positionStamp(stamp);
    overlay.hidden = stamp.page !== page;
    el('stamp-status').textContent = `Stamp on page ${stamp.page}.`;
  } catch (error) {
    if (revision === stampRevision) {
      // Text layout errors must leave the frame and resize handle editable.
      overlay.hidden = !validGeometry || stamp.page !== page;
      const preview = el<HTMLCanvasElement>('stamp-preview');
      preview.getContext('2d')?.clearRect(0, 0, preview.width, preview.height);
      el('stamp-status').textContent = error instanceof Error ? error.message : String(error);
    }
  } finally { await task?.destroy(); }
}
function stampChanged() { invalidateSigning(); void previewStamp(); }
let stampAddition = 0;
stampEnabled.addEventListener('change', async () => {
  const addition = ++stampAddition;
  if (!source) stampEnabled.checked = false;
  el('stamp-settings').hidden = !stampEnabled.checked;
  el<HTMLFieldSetElement>('stamp-fields').disabled = !stampEnabled.checked;
  invalidateSigning();
  const pdf = document;
  if (!stampEnabled.checked || !pdf) { void previewStamp(); return; }
  try {
    const lastPage = pdf.numPages;
    const viewport = (await pdf.getPage(lastPage)).getViewport({ scale: 1 });
    if (addition !== stampAddition || document !== pdf || !stampEnabled.checked) return;
    const left = Math.min(24, viewport.width / 10), bottom = Math.min(24, viewport.height / 10);
    const width = Math.min(280, viewport.width - left * 2), height = Math.min(140, viewport.height - bottom * 2);
    for (const [key, value] of Object.entries({ page: lastPage, x: left, y: viewport.height - bottom - height, width, height })) input(key).value = String(value);
    go(lastPage);
  } catch (error) {
    if (addition === stampAddition && document === pdf) el('stamp-status').textContent = error instanceof Error ? error.message : String(error);
  }
});
el('stamp-fields').addEventListener('input', stampChanged);
input('page').addEventListener('change', () => { go(Number(input('page').value)); });
async function finalPdf(current: { bytes: Uint8Array; name: string }) {
  if (!stampEnabled.checked) return current;
  const stamp = stampSettings();
  const viewport = await validateStamp(stamp);
  return { bytes: await applyStamp(current.bytes, stamp, viewport.transform), name: current.name.replace(/\.pdf$/i, '') + '-stamped.pdf' };
}
el('export-stamp').addEventListener('click', async () => {
  if (!source || signing) return;
  discardResult();
  const run = ++signingRun;
  signing = true; signingControls();
  try {
    const result = await finalPdf(source);
    if (run !== signingRun) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }));
    downloads.push(url);
    const link = window.document.createElement('a'); link.href = url; link.download = result.name; link.textContent = 'Download ' + result.name;
    el('downloads').append(link);
    el('signing-status').textContent = 'Stamped PDF ready. No cryptographic signature was added.';
  } catch (error) {
    if (run === signingRun) el('signing-status').textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally { if (run === signingRun) { signing = false; signingControls(); } }
});
let gesture: { id: number; x: number; y: number; stamp: Stamp; resize: boolean } | undefined;
overlay.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); overlay.focus(); overlay.setPointerCapture(event.pointerId);
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, stamp: stampSettings(), resize: event.target === el('stamp-resize') };
});
function setGeometry(stamp: Stamp) {
  const width = canvas.width ? parseFloat(canvas.style.width) / displayScale : 0;
  const height = canvas.width ? parseFloat(canvas.style.height) / displayScale : 0;
  stamp.x = Math.max(0, Math.min(width - 1, stamp.x)); stamp.y = Math.max(0, Math.min(height - 1, stamp.y));
  stamp.width = Math.max(1, Math.min(width - stamp.x, stamp.width)); stamp.height = Math.max(1, Math.min(height - stamp.y, stamp.height));
  for (const key of ['x','y','width','height'] as const) input(key).value = String(Math.floor(stamp[key] * 100) / 100);
  invalidateSigning(); positionStamp(stamp);
}
overlay.addEventListener('pointermove', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const stamp = { ...gesture.stamp }, dx = (event.clientX - gesture.x) / displayScale, dy = (event.clientY - gesture.y) / displayScale;
  if (gesture.resize) { stamp.width += dx; stamp.height += dy; }
  else { stamp.x = Math.min(parseFloat(canvas.style.width) / displayScale - stamp.width, stamp.x + dx); stamp.y = Math.min(parseFloat(canvas.style.height) / displayScale - stamp.height, stamp.y + dy); }
  setGeometry(stamp);
});
function endGesture() { if (gesture) { gesture = undefined; void previewStamp(); } }
overlay.addEventListener('pointerup', endGesture); overlay.addEventListener('pointercancel', endGesture);
overlay.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const stamp = stampSettings(), dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (event.shiftKey) { stamp.width += dx; stamp.height += dy; } else { stamp.x = Math.min(parseFloat(canvas.style.width) / displayScale - stamp.width, stamp.x + dx); stamp.y = Math.min(parseFloat(canvas.style.height) / displayScale - stamp.height, stamp.y + dy); }
  setGeometry(stamp); void previewStamp();
});
window.addEventListener('pagehide', () => { void clear(); });
enhanceDropdowns();
controls();
