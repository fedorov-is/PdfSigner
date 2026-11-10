import { test, expect } from '@playwright/test';

function pdf(pages = 1) {
  const objects = [ '<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>` ];
  for (let i = 0; i < pages; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${i % 2 ? 400 : 612} 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${4 + i * 2} 0 R >>`);
    const content = `BT /F1 18 Tf 40 700 Td (Page ${i + 1}) Tj ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let output = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(output.length); output += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
const upload = (pages = 1, buffer = pdf(pages)) => ({ name: 'Preview.pdf', mimeType: 'application/pdf', buffer });

test('local worker preview, navigation, zoom, reset, theme and mobile layout', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.locator('#theme').check(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#file').setInputFiles(upload(3));
  await expect(page.locator('#status')).toHaveText('Page 1 of 3. Preview ready.');
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('#status')).toHaveText('Page 2 of 3. Preview ready.');
  await page.locator('#page').fill('3'); await page.locator('#page').press('Tab');
  await expect(page.locator('#status')).toHaveText('Page 3 of 3. Preview ready.');
  await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#zoom').selectOption('2');
  await expect(page.locator('#status')).toHaveText('Page 3 of 3. Preview ready.');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#zoom').selectOption('fit');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/preview-mobile-dark.png', fullPage: true });
  await page.locator('#reset').click();
  await expect(page.locator('#workspace')).toBeHidden();
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(0);
  expect(failures).toEqual([]);
});

test('validation, page limit, replacement and drop', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles(upload(1, Buffer.from('not a pdf')));
  await expect(page.locator('#status')).toContainText('does not have a PDF header');
  await page.locator('#file').setInputFiles(upload(1, Buffer.from('%PDF-1.7\nbroken')));
  await expect(page.locator('#status')).toContainText('Could not open PDF');
  const started = Date.now();
  await page.locator('#file').setInputFiles(upload(500));
  await expect(page.locator('#status')).toHaveText('Page 1 of 500. Preview ready.');
  console.log(`500-page fixture open/render: ${Date.now() - started} ms; ${pdf(500).length} bytes`);
  const large = Buffer.alloc(20 * 1024 * 1024, 32); pdf().copy(large);
  const largeStarted = Date.now();
  await page.locator('#file').setInputFiles(upload(1, large));
  await expect(page.locator('#status')).toHaveText('Page 1 of 1. Preview ready.');
  console.log(`20 MiB padded fixture open/render: ${Date.now() - largeStarted} ms`);
  await page.locator('#file').setInputFiles(upload(501));
  await expect(page.locator('#status')).toContainText('500-page preview limit');
  await page.locator('#file').setInputFiles(upload(1, Buffer.alloc(20 * 1024 * 1024 + 1)));
  await expect(page.locator('#status')).toContainText('no larger than 20 MiB');
  const bytes = Array.from(pdf(2));
  await page.locator('#drop-zone').evaluate((zone, bytes) => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], 'Dropped.pdf', { type: 'application/pdf' }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
  }, bytes);
  await expect(page.locator('#status')).toHaveText('Page 1 of 2. Preview ready.');
  await expect(page.locator('#filename')).toHaveText('Dropped.pdf');
  await page.locator('#file').setInputFiles(upload(3));
  await page.locator('#file').setInputFiles(upload(1));
  await expect(page.locator('#status')).toHaveText('Page 1 of 1. Preview ready.');
});
