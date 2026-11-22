import { createStampPreview } from '../features/stamp/preview';
import { createDownloads } from '../shared/ui/downloads';
import { initializeStampInteraction } from '../features/stamp/interaction';
import { getElement as el } from '../shared/lib/dom';
import { createPreviewRenderer } from '../features/preview/renderer';
import { MAX_BYTES, MAX_PAGES } from '../features/preview/limits';
import { initializeTheme } from '../features/theme/theme';
import { readPreference, writePreference } from '../shared/lib/preferences';
import { ownerName as certificateOwnerName } from '../features/signing/certificate.js';
import { t, initLocalization, locale } from '../shared/i18n/index.js';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CryptoPro } from '../features/signing/cryptopro.js';
import { createDetached } from '../features/signing/detached.js';
import { deadline } from '../shared/lib/deadline.js';
import {
  assertUnsigned,
  createEmbedded,
} from '../features/signing/embedded.js';
import type { Stamp } from '../features/stamp/stamp';
import { enhanceDropdowns } from '../shared/ui/dropdown';

export function startApplication() {
  GlobalWorkerOptions.workerSrc = workerUrl;
  initLocalization();
  const ownerName = (subject: string) =>
    certificateOwnerName(subject, t('Owner name unavailable'));
  const fileInput = el<HTMLInputElement>('file');
  const pageInput = el<HTMLInputElement>('page');
  const zoom = el<HTMLSelectElement>('zoom');
  const canvas = el<HTMLCanvasElement>('preview');
  const container = el('canvas-container');
  const theme = el<HTMLInputElement>('theme');
  const previewRenderer = createPreviewRenderer(
    canvas,
    container,
    zoom,
    status,
    (scale) => {
      displayScale = scale;
      void previewStamp();
    },
  );
  let document: PDFDocumentProxy | undefined;
  let loading: PDFDocumentLoadingTask | undefined;
  let generation = 0;
  let page = 1;
  let source: { bytes: Uint8Array; name: string } | undefined;
  let adapter: CryptoPro | undefined;
  let signing = false;
  let connecting = false;
  let signingRun = 0;
  const downloads = createDownloads(el('downloads'));
  const discardResult = downloads.clear;
  function signingControls() {
    el<HTMLButtonElement>('sign').disabled =
      signing || !source || !adapter || certificates.disabled;
    el<HTMLButtonElement>('cancel-sign').hidden = !signing;
    el<HTMLButtonElement>('connect').disabled = signing || connecting;
    el<HTMLButtonElement>('export-stamp').disabled =
      signing || !source || !stampEnabled.checked;
  }
  function invalidateSigning() {
    signingRun++;
    signing = false;
    discardResult();
    el('signing-status').textContent = '';
    signingControls();
  }

  function status(message: string, error = false) {
    el('status').textContent = message;
    el('status').classList.toggle('error', error);
  }
  initializeTheme(theme);
  function controls() {
    pageInput.value = String(page);
    pageInput.max = String(document?.numPages ?? 1);
    el<HTMLButtonElement>('previous').disabled = !document || page <= 1;
    el<HTMLButtonElement>('next').disabled =
      !document || page >= document.numPages;
  }
  async function clear() {
    source = undefined;
    stampEnabled.checked = false;
    el('stamp-settings').hidden = true;
    el<HTMLFieldSetElement>('stamp-fields').disabled = true;
    overlay.hidden = true;
    stampInteraction.reset();
    stampPreview.reset();
    for (const [key, value] of Object.entries({
      page: '1',
      x: '24',
      y: '24',
      width: '280',
      height: '140',
    }))
      input(key).value = value;
    el('stamp-status').textContent = '';
    invalidateSigning();
    generation++;
    previewRenderer.cancel();
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
    if (document) await previewRenderer.draw(document, page);
  }
  async function open(file: File) {
    const clearing = clear();
    const id = generation;
    await clearing;
    if (id !== generation) return;
    status(t('Loading {0}…', file.name));
    try {
      if (!file.size || file.size > MAX_BYTES)
        throw new Error(t('Choose a non-empty PDF no larger than 20 MiB.'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (id !== generation) return;
      if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-'))
        throw new Error(t('This file does not have a PDF header.'));
      const assets = `${import.meta.env.BASE_URL}pdfjs/`;
      const task = getDocument({
        data: bytes.slice(),
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
      });
      loading = task;
      // Encrypted documents are deliberately unsupported in this milestone.
      task.onPassword = () => {
        if (id === generation) {
          void clear();
          status(
            t(
              'Password-protected PDFs are not supported. Open an unencrypted copy.',
            ),
            true,
          );
        }
      };
      const pdf = await task.promise;
      if (id !== generation) return;
      if (pdf.numPages > MAX_PAGES)
        throw new Error(t('This PDF exceeds the 500-page preview limit.'));
      const fields = await pdf.getFieldObjects();
      if (id !== generation) return;
      const signed = Object.values(fields ?? {})
        .flat()
        .some((field) => field.type === 'Sig');
      if (
        signed ||
        /\/ByteRange\s*\[|\/FT\s*\/Sig\b/.test(
          new TextDecoder('latin1').decode(bytes),
        )
      ) {
        el('signing-status').textContent = t(
          'Existing signature detected. Signing this PDF is not supported yet.',
        );
      } else {
        try {
          await assertUnsigned(bytes);
          if (id !== generation) return;
          source = { bytes, name: file.name };
        } catch (error) {
          if (id !== generation) return;
          el('signing-status').textContent = t(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      if (id !== generation) return;
      document = pdf;
      signingControls();
      el('filename').textContent = file.name;
      el('file-size').textContent = t(
        '{0} MiB',
        (file.size / 1024 / 1024).toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
      el('total-pages').textContent = String(pdf.numPages);
      el('page-count').textContent = t('of {0}', pdf.numPages);
      el('workspace').hidden = false;
      controls();
      await draw();
    } catch (error) {
      if (id !== generation) return;
      await clear();
      status(
        t(
          'Could not open PDF: {0}',
          t(error instanceof Error ? error.message : String(error)),
        ),
        true,
      );
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void open(file);
  });
  el('reset').addEventListener('click', () => {
    void clear();
    status(t('No document loaded.'));
    fileInput.focus();
  });
  function go(target: number) {
    if (!document) return;
    page = Math.max(
      1,
      Math.min(
        document.numPages,
        Number.isFinite(target) ? Math.trunc(target) : page,
      ),
    );
    controls();
    container.scrollTop = container.scrollLeft = 0;
    void draw();
  }
  el('previous').addEventListener('click', () => go(page - 1));
  el('next').addEventListener('click', () => go(page + 1));
  pageInput.addEventListener('change', () => go(Number(pageInput.value)));
  zoom.addEventListener('change', () => {
    void draw();
  });
  let resizeTimer: ReturnType<typeof setTimeout>;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (zoom.value === 'fit') void draw();
    }, 120);
  }).observe(container);
  const drop = el('drop-zone');
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('dragging');
    const files = event.dataTransfer?.files;
    if (files?.length === 1) void open(files[0]);
    else status(t('Drop one PDF at a time.'), true);
  });
  const certificates = el<HTMLSelectElement>('certificate');
  let available: {
    thumbprint: string;
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    serial: string;
    algorithm: string;
  }[] = [];
  certificates.addEventListener('change', () => {
    invalidateSigning();
    const cert = available.find(
      (item) => item.thumbprint === certificates.value,
    );
    el('certificate-details').textContent = cert
      ? t(
          '{0}. Valid: {1} – {2}.',
          ownerName(cert.subject),
          new Date(cert.validFrom).toLocaleDateString(locale),
          new Date(cert.validTo).toLocaleDateString(locale),
        )
      : '';
    void previewStamp();
  });
  async function checkCryptoPro() {
    if (connecting || signing) return;
    connecting = true;
    el('readiness').hidden = true;
    const button = el<HTMLButtonElement>('connect');
    button.disabled = true;
    invalidateSigning();
    adapter = undefined;
    available = [];
    certificates.replaceChildren();
    certificates.disabled = true;
    el('certificate-details').textContent = '';
    void previewStamp();
    el('readiness-status').textContent = t(
      'Checking bridge and native API… Complete any CryptoPro access dialogs.',
    );
    try {
      if (!window.document.querySelector('script[data-cryptopro]')) {
        await deadline(
          () =>
            new Promise<void>((resolve, reject) => {
              const script = window.document.createElement('script');
              script.dataset.cryptopro = 'true';
              script.src = `${import.meta.env.BASE_URL}vendor/cadesplugin_api.js`;
              script.onload = () => resolve();
              script.onerror = () => {
                script.remove();
                reject(
                  new Error(t('Could not load the local CryptoPro bridge')),
                );
              };
              window.document.head.append(script);
            }),
          20000,
        );
      }
      const connected = await CryptoPro.connect();
      adapter = connected;
      available = await connected.certificates();
      for (const cert of available)
        certificates.add(new Option(ownerName(cert.subject), cert.thumbprint));
      certificates.disabled = !available.length;
      certificates.dispatchEvent(new Event('change'));
      el('readiness-status').textContent = t(
        'Plug-in {0}; CSP {1}. {2} time-valid certificate(s) with private keys. Key access is confirmed only by signing.',
        connected.pluginVersion,
        connected.cspVersion,
        available.length,
      );
      if (!available.length)
        certificates.add(
          new Option(t('No time-valid certificates with private keys found')),
        );
      el('readiness').hidden = available.length > 0;
    } catch (error) {
      adapter = undefined;
      el('readiness').hidden = false;
      el('readiness-status').textContent = t(
        'CryptoPro unavailable: {0}. Check CSP, Browser plug-in and extension installation. Preview remains available.',
        t(error instanceof Error ? error.message : String(error)),
      );
      certificates.add(new Option(t('CryptoPro unavailable')));
    } finally {
      connecting = false;
      button.disabled = false;
      signingControls();
    }
  }
  el('connect').addEventListener('click', () => {
    void checkCryptoPro();
  });
  el('sign').addEventListener('click', async () => {
    if (!source || !adapter || signing) return;
    discardResult();
    const current = source,
      selected = certificates.value,
      active = adapter;
    const run = ++signingRun;
    signing = true;
    signingControls();
    el('signing-status').textContent = t(
      'Signing and verifying. Complete CryptoPro access or PIN dialogs.',
    );
    try {
      const prepared = await finalPdf(current);
      if (run !== signingRun) return;
      const embedded =
        el<HTMLSelectElement>('signing-mode').value === 'embedded';
      const result = await deadline(() =>
        embedded
          ? createEmbedded(
              active,
              prepared.bytes,
              selected,
              () => run === signingRun,
            )
          : createDetached(active, prepared.bytes, selected),
      );
      if (run !== signingRun) return;
      const artifacts: [Uint8Array, string, string][] = [
        [
          result.pdf,
          embedded
            ? prepared.name.replace(/\.pdf$/i, '') + '-signed.pdf'
            : prepared.name,
          'application/pdf',
        ],
      ];
      if ('signature' in result)
        artifacts.push([
          result.signature as Uint8Array,
          prepared.name + '.sig',
          'application/pkcs7-signature',
        ]);
      for (const [bytes, name, type] of artifacts)
        downloads.add(bytes, name, type);
      el('signing-status').textContent = embedded
        ? t(
            'Embedded CAdES-BES verified by CryptoPro from the final PDF; changed-byte check rejected. Reader compatibility requires independent verification. Certificate trust and revocation are not independently assessed. No trusted timestamp is included.',
          )
        : t(
            'Detached CAdES-BES verified by CryptoPro; changed-byte check rejected. Keep both files together. Certificate trust and revocation are not independently assessed. No trusted timestamp is included.',
          );
    } catch (error) {
      if (run !== signingRun) return;
      discardResult();
      el('signing-status').textContent =
        t('Signing failed: ') +
        t(error instanceof Error ? error.message : String(error)) +
        t(
          '. Check certificate validity, private-key access and token connection. If access was denied or cancelled, retry explicitly. No result is available.',
        );
    } finally {
      if (run === signingRun) {
        signingRun++;
        signing = false;
        signingControls();
      }
    }
  });
  const signingMode = el<HTMLSelectElement>('signing-mode');
  const savedMode = readPreference('pdf-signer-output-format');
  if (savedMode === 'detached' || savedMode === 'embedded')
    signingMode.value = savedMode;
  signingMode.addEventListener('change', () => {
    writePreference('pdf-signer-output-format', signingMode.value);
    invalidateSigning();
  });
  el('cancel-sign').addEventListener('click', () => {
    invalidateSigning();
    el('signing-status').textContent = t(
      'Cancelled. No result is available. Dismiss any CryptoPro dialog; the browser cannot cancel a native operation already in progress.',
    );
  });
  const stampEnabled = el<HTMLInputElement>('stamp-enabled');
  const overlay = el('stamp-overlay');
  let displayScale = 1;
  const input = (key: string) => el<HTMLInputElement>('stamp-' + key);
  const stampPreview = createStampPreview({
    getDocument: () => document,
    getScale: () => displayScale,
    getPage: () => page,
    hasSource: () => Boolean(source),
    stampEnabled,
    overlay,
    stampSettings,
  });
  const { validateStamp, positionStamp, previewStamp } = stampPreview;
  const caption = readPreference('pdf-signer-stamp-caption');
  if (caption !== null)
    input('caption').value = caption.slice(0, input('caption').maxLength);
  input('caption').addEventListener('input', () => {
    writePreference('pdf-signer-stamp-caption', input('caption').value);
  });
  function stampSettings(): Stamp {
    const cert = available.find((c) => c.thumbprint === certificates.value);
    return {
      page: Number(input('page').value),
      x: Number(input('x').value),
      y: Number(input('y').value),
      width: Number(input('width').value),
      height: Number(input('height').value),
      caption: input('caption').value,
      text: cert
        ? [
            ownerName(cert.subject),
            t('Serial: {0}', cert.serial),
            t(
              'Valid: {0} – {1}',
              new Date(cert.validFrom).toLocaleDateString(locale),
              new Date(cert.validTo).toLocaleDateString(locale),
            ),
          ].join('\n')
        : '',
    };
  }
  function stampChanged() {
    invalidateSigning();
    void previewStamp();
  }
  let stampAddition = 0;
  stampEnabled.addEventListener('change', async () => {
    const addition = ++stampAddition;
    if (!source) stampEnabled.checked = false;
    el('stamp-settings').hidden = !stampEnabled.checked;
    el<HTMLFieldSetElement>('stamp-fields').disabled = !stampEnabled.checked;
    invalidateSigning();
    const pdf = document;
    if (!stampEnabled.checked || !pdf) {
      void previewStamp();
      return;
    }
    try {
      const lastPage = pdf.numPages;
      const viewport = (await pdf.getPage(lastPage)).getViewport({ scale: 1 });
      if (
        addition !== stampAddition ||
        document !== pdf ||
        !stampEnabled.checked
      )
        return;
      const left = Math.min(24, viewport.width / 10),
        bottom = Math.min(24, viewport.height / 10);
      const width = Math.min(280, viewport.width - left * 2),
        height = Math.min(140, viewport.height - bottom * 2);
      for (const [key, value] of Object.entries({
        page: lastPage,
        x: left,
        y: viewport.height - bottom - height,
        width,
        height,
      }))
        input(key).value = String(value);
      go(lastPage);
    } catch (error) {
      if (addition === stampAddition && document === pdf)
        el('stamp-status').textContent = t(
          error instanceof Error ? error.message : String(error),
        );
    }
  });
  el('stamp-fields').addEventListener('input', stampChanged);
  input('page').addEventListener('change', () => {
    go(Number(input('page').value));
  });
  async function finalPdf(current: { bytes: Uint8Array; name: string }) {
    if (!stampEnabled.checked) return current;
    const stamp = stampSettings();
    const viewport = await validateStamp(stamp);
    const { applyStamp } = await import('../features/stamp/stamp');
    return {
      bytes: await applyStamp(current.bytes, stamp, viewport.transform),
      name: current.name.replace(/\.pdf$/i, '') + '-stamped.pdf',
    };
  }
  el('export-stamp').addEventListener('click', async () => {
    if (!source || signing) return;
    discardResult();
    const run = ++signingRun;
    signing = true;
    signingControls();
    try {
      const result = await finalPdf(source);
      if (run !== signingRun) return;
      downloads.add(result.bytes, result.name, 'application/pdf');
      el('signing-status').textContent = t(
        'Stamped PDF ready. No cryptographic signature was added.',
      );
    } catch (error) {
      if (run === signingRun)
        el('signing-status').textContent = t(
          'Export failed: {0}',
          t(error instanceof Error ? error.message : String(error)),
        );
    } finally {
      if (run === signingRun) {
        signing = false;
        signingControls();
      }
    }
  });
  const stampInteraction = initializeStampInteraction({
    overlay,
    canvas,
    getScale: () => displayScale,
    stampSettings,
    input,
    invalidateSigning,
    positionStamp,
    previewStamp,
  });
  window.addEventListener('pagehide', () => {
    void clear();
  });
  enhanceDropdowns();
  controls();
  void checkCryptoPro();
}
