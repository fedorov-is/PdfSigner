import {
  getDocument as loadPdf,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
} from 'pdfjs-dist';
import type { Stamp } from './stamp';
import { t } from '../../shared/i18n/index.js';
import { getElement as el } from '../../shared/lib/dom';
import { MAX_PIXELS } from '../preview/limits';

export function createStampPreview({
  getDocument,
  getScale,
  getPage,
  hasSource,
  stampEnabled,
  overlay,
  stampSettings,
}: {
  getDocument: () => PDFDocumentProxy | undefined;
  getScale: () => number;
  getPage: () => number;
  hasSource: () => boolean;
  stampEnabled: HTMLInputElement;
  overlay: HTMLElement;
  stampSettings: () => Stamp;
}) {
  let stampRevision = 0;
  async function validateStamp(stamp: Stamp) {
    const pdf = getDocument();
    if (
      !pdf ||
      !Number.isInteger(stamp.page) ||
      stamp.page < 1 ||
      stamp.page > pdf.numPages
    )
      throw new Error(t('Choose a valid stamp page.'));
    const viewport = (await pdf.getPage(stamp.page)).getViewport({
      scale: 1,
    });
    if (
      ![stamp.x, stamp.y, stamp.width, stamp.height].every(Number.isFinite) ||
      stamp.x < 0 ||
      stamp.y < 0 ||
      stamp.width < 1 ||
      stamp.height < 1 ||
      stamp.x + stamp.width > viewport.width + 0.001 ||
      stamp.y + stamp.height > viewport.height + 0.001
    )
      throw new Error(
        t(
          'Stamp must fit inside the selected visible page. Adjust position or size in points.',
        ),
      );
    return viewport;
  }
  function positionStamp(stamp: Stamp) {
    Object.assign(overlay.style, {
      left: `${stamp.x * getScale()}px`,
      top: `${stamp.y * getScale()}px`,
      width: `${stamp.width * getScale()}px`,
      height: `${stamp.height * getScale()}px`,
      borderRadius: `${Math.min(8, stamp.width / 2, stamp.height / 2) * getScale()}px`,
    });
  }
  async function previewStamp() {
    const revision = ++stampRevision;
    el('stamp-status').textContent = '';
    if (!stampEnabled.checked || !hasSource()) {
      overlay.hidden = true;
      return;
    }
    const stamp = stampSettings();
    if (stamp.page !== getPage()) overlay.hidden = true;
    let task: PDFDocumentLoadingTask | undefined;
    let validGeometry = false;
    try {
      await validateStamp(stamp);
      if (revision !== stampRevision) return;
      validGeometry = true;
      positionStamp(stamp);
      overlay.hidden = stamp.page !== getPage();
      const { stampPdf } = await import('./stamp');
      const bytes = await stampPdf(stamp);
      if (revision !== stampRevision) return;
      task = loadPdf({ data: bytes });
      const pdf = await task.promise;
      const stampPage = await pdf.getPage(1);
      const scale = Math.min(
        getScale() * 2,
        Math.sqrt(MAX_PIXELS / (stamp.width * stamp.height)),
      );
      const viewport = stampPage.getViewport({ scale });
      const temporary = window.document.createElement('canvas');
      temporary.width = Math.ceil(viewport.width);
      temporary.height = Math.ceil(viewport.height);
      await stampPage.render({
        canvas: temporary,
        viewport,
        background: 'rgba(0,0,0,0)',
      }).promise;
      if (revision !== stampRevision) return;
      const target = el<HTMLCanvasElement>('stamp-preview');
      target.width = temporary.width;
      target.height = temporary.height;
      target.getContext('2d')!.drawImage(temporary, 0, 0);
      positionStamp(stamp);
      overlay.hidden = stamp.page !== getPage();
      el('stamp-status').textContent = t('Stamp on page {0}.', stamp.page);
    } catch (error) {
      if (revision === stampRevision) {
        // Text layout errors must leave the frame and resize handle editable.
        overlay.hidden = !validGeometry || stamp.page !== getPage();
        const preview = el<HTMLCanvasElement>('stamp-preview');
        preview
          .getContext('2d')
          ?.clearRect(0, 0, preview.width, preview.height);
        el('stamp-status').textContent = t(
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      await task?.destroy();
    }
  }

  function reset() {
    stampRevision++;
    overlay.hidden = true;
    const canvas = el<HTMLCanvasElement>('stamp-preview');
    canvas.width = canvas.height = 0;
    el('stamp-status').textContent = '';
  }
  return { validateStamp, positionStamp, previewStamp, reset };
}
