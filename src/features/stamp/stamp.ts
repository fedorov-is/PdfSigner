import { t } from '../../shared/i18n/index.js';
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type Stamp = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  caption: string;
  text: string;
};
const fontBytes = new Map<string, Promise<ArrayBuffer>>();
async function font(name: string) {
  if (!fontBytes.has(name))
    fontBytes.set(
      name,
      fetch(`${import.meta.env.BASE_URL}fonts/${name}.ttf`)
        .then((r) => {
          if (!r.ok) throw new Error(t('Could not load the local stamp font'));
          return r.arrayBuffer();
        })
        .catch((error) => {
          fontBytes.delete(name);
          throw error;
        }),
    );
  return fontBytes.get(name)!;
}
export async function stampPdf(stamp: Stamp) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const face = await pdf.embedFont(await font('NotoSans'), { subset: true });
  const bold = await pdf.embedFont(await font('NotoSans-Bold'), {
    subset: true,
  });
  const supported = new Set(face.getCharacterSet());
  if (
    [...(stamp.caption + stamp.text)].some(
      (c) => c !== '\n' && !supported.has(c.codePointAt(0)!),
    )
  )
    throw new Error(t('Stamp contains characters unavailable in Noto Sans'));
  const wrap = (text: string, font: typeof face, size: number) =>
    text
      ? text.split('\n').flatMap((paragraph) => {
          const result: string[] = [];
          let line = '';
          for (const char of paragraph) {
            if (font.widthOfTextAtSize(line + char, size) > stamp.width - 16) {
              result.push(line);
              line = '';
            }
            line += char;
          }
          return [...result, line];
        })
      : [];
  const gap = stamp.caption && stamp.text ? 8 : 0;
  const fits = (size: number) => {
    if (
      [...(stamp.caption + stamp.text)].some(
        (c) =>
          c !== '\n' &&
          Math.max(
            face.widthOfTextAtSize(c, size),
            bold.widthOfTextAtSize(c, size),
          ) >
            stamp.width - 16,
      )
    )
      return false;
    return (
      (wrap(stamp.caption, bold, size).length +
        wrap(stamp.text, face, size).length) *
        size *
        1.4 +
        gap <=
      stamp.height - 16
    );
  };
  if (!fits(5))
    throw new Error(
      t('Text does not fit. Enlarge the stamp or shorten its text.'),
    );
  // Find the largest font that fits both dimensions, including wrapped lines.
  let low = 5,
    high = Math.max(5, (stamp.height - 16 - gap) / 1.4);
  for (let i = 0; i < 16; i++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  const size = Math.floor(low * 4) / 4;
  const caption = wrap(stamp.caption, bold, size),
    lines = wrap(stamp.text, face, size);
  const page = pdf.addPage([stamp.width, stamp.height]);
  const left = 0.5,
    top = 0.5,
    right = stamp.width - 0.5,
    bottom = stamp.height - 0.5;
  const radius = Math.min(8, (right - left) / 2, (bottom - top) / 2),
    k = radius * 0.5522847498;
  page.drawSvgPath(
    `M ${left + radius} ${top} L ${right - radius} ${top}
    C ${right - radius + k} ${top} ${right} ${top + radius - k} ${right} ${top + radius}
    L ${right} ${bottom - radius} C ${right} ${bottom - radius + k} ${right - radius + k} ${bottom} ${right - radius} ${bottom}
    L ${left + radius} ${bottom} C ${left + radius - k} ${bottom} ${left} ${bottom - radius + k} ${left} ${bottom - radius}
    L ${left} ${top + radius} C ${left} ${top + radius - k} ${left + radius - k} ${top} ${left + radius} ${top} Z`,
    {
      x: 0,
      y: stamp.height,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      color: rgb(1, 1, 1),
    },
  );
  caption.forEach((line, i) =>
    page.drawText(line, {
      x: (stamp.width - bold.widthOfTextAtSize(line, size)) / 2,
      y: stamp.height - 8 - size - i * size * 1.4,
      size,
      font: bold,
      color: rgb(0.12, 0.2, 0.35),
    }),
  );
  lines.forEach((line, i) =>
    page.drawText(line, {
      x: 8,
      y: stamp.height - 8 - size - (caption.length + i) * size * 1.4 - gap,
      size,
      font: face,
      color: rgb(0.12, 0.2, 0.35),
    }),
  );
  return pdf.save();
}

// Invert PDF.js's scale-1 viewport. Local stamp coordinates have their origin
// at bottom-left; editor coordinates have their origin at the visible top-left.
export async function applyStamp(
  bytes: Uint8Array,
  stamp: Stamp,
  transform: number[],
) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const [embedded] = await pdf.embedPdf(await stampPdf(stamp));
  const [a, b, c, d, e, f] = transform,
    det = a * d - b * c;
  if (!Number.isFinite(det) || !det)
    throw new Error('Unsupported page transform');
  const x = stamp.x,
    y = stamp.y + stamp.height;
  const page = pdf.getPage(stamp.page - 1);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      d / det,
      -b / det,
      c / det,
      -a / det,
      (d * (x - e) - c * (y - f)) / det,
      (-b * (x - e) + a * (y - f)) / det,
    ),
  );
  page.drawPage(embedded);
  page.pushOperators(popGraphicsState());
  return pdf.save();
}
