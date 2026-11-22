import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { t } from '../../shared/i18n/index.js';
import { MAX_PIXELS } from './limits';

export function createPreviewRenderer(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  zoom: HTMLSelectElement,
  status: (message: string, error?: boolean) => void,
  onRendered: (scale: number) => void,
) {
  let render: RenderTask | undefined;
  let rendering = 0;
  async function draw(pdf: PDFDocumentProxy, page: number) {
    const id = ++rendering;
    const previous = render;
    previous?.cancel();
    container.setAttribute('aria-busy', 'true');
    status(t('Rendering page {0} of {1}…', page, pdf.numPages));
    try {
      if (previous) await previous.promise.catch(() => {});
      const current = await pdf.getPage(page);
      if (id !== rendering) return;
      const base = current.getViewport({ scale: 1 });
      const requested =
        zoom.value === 'fit'
          ? Math.max(0.1, (container.clientWidth - 32) / base.width)
          : Number(zoom.value);
      const viewport = current.getViewport({
        scale: Math.min(
          requested,
          Math.sqrt(MAX_PIXELS / (base.width * base.height)),
        ),
      });
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)),
      );
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute(
        'aria-label',
        t('Page {0} of {1}. Visual preview.', page, pdf.numPages),
      );
      render = current.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      if (id === rendering) {
        status(t('Page {0} of {1}. Preview ready.', page, pdf.numPages));
        onRendered(viewport.scale);
      }
    } catch (error) {
      if (id === rendering) {
        canvas.width = canvas.height = 0;
        status(
          t(
            'Unable to render this page: {0}',
            t(error instanceof Error ? error.message : String(error)),
          ),
          true,
        );
      }
    } finally {
      if (id === rendering) container.setAttribute('aria-busy', 'false');
    }
  }

  function cancel() {
    rendering++;
    render?.cancel();
    render = undefined;
  }
  return { draw, cancel };
}
