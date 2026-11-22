import type { Stamp } from './stamp';
import { getElement as el } from '../../shared/lib/dom';

export function initializeStampInteraction({
  overlay,
  canvas,
  getScale,
  stampSettings,
  input,
  invalidateSigning,
  positionStamp,
  previewStamp,
}: {
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
  getScale: () => number;
  stampSettings: () => Stamp;
  input: (key: string) => HTMLInputElement;
  invalidateSigning: () => void;
  positionStamp: (stamp: Stamp) => void;
  previewStamp: () => Promise<void>;
}) {
  let gesture:
    | { id: number; x: number; y: number; stamp: Stamp; resize: boolean }
    | undefined;
  overlay.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    overlay.focus();
    overlay.setPointerCapture(event.pointerId);
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      stamp: stampSettings(),
      resize: event.target === el('stamp-resize'),
    };
  });
  function setGeometry(stamp: Stamp) {
    const width = canvas.width
      ? parseFloat(canvas.style.width) / getScale()
      : 0;
    const height = canvas.width
      ? parseFloat(canvas.style.height) / getScale()
      : 0;
    stamp.x = Math.max(0, Math.min(width - 1, stamp.x));
    stamp.y = Math.max(0, Math.min(height - 1, stamp.y));
    stamp.width = Math.max(1, Math.min(width - stamp.x, stamp.width));
    stamp.height = Math.max(1, Math.min(height - stamp.y, stamp.height));
    for (const key of ['x', 'y', 'width', 'height'] as const)
      input(key).value = String(Math.floor(stamp[key] * 100) / 100);
    invalidateSigning();
    positionStamp(stamp);
  }
  overlay.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const stamp = { ...gesture.stamp },
      dx = (event.clientX - gesture.x) / getScale(),
      dy = (event.clientY - gesture.y) / getScale();
    if (gesture.resize) {
      stamp.width += dx;
      stamp.height += dy;
    } else {
      stamp.x = Math.min(
        parseFloat(canvas.style.width) / getScale() - stamp.width,
        stamp.x + dx,
      );
      stamp.y = Math.min(
        parseFloat(canvas.style.height) / getScale() - stamp.height,
        stamp.y + dy,
      );
    }
    setGeometry(stamp);
  });
  function endGesture() {
    if (gesture) {
      gesture = undefined;
      void previewStamp();
    }
  }
  overlay.addEventListener('pointerup', endGesture);
  overlay.addEventListener('pointercancel', endGesture);
  overlay.addEventListener('keydown', (event) => {
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    event.preventDefault();
    const stamp = stampSettings(),
      dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0,
      dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (event.shiftKey) {
      stamp.width += dx;
      stamp.height += dy;
    } else {
      stamp.x = Math.min(
        parseFloat(canvas.style.width) / getScale() - stamp.width,
        stamp.x + dx,
      );
      stamp.y = Math.min(
        parseFloat(canvas.style.height) / getScale() - stamp.height,
        stamp.y + dy,
      );
    }
    setGeometry(stamp);
    void previewStamp();
  });

  return {
    reset: () => {
      gesture = undefined;
    },
  };
}
