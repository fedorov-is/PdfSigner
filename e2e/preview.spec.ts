import { test, expect } from '@playwright/test';
import { PDFDocument, PDFHexString, degrees } from 'pdf-lib';

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

test('encrypted input is rejected and clears previous results', async ({ page }) => {
  const fixture = await PDFDocument.create();
  fixture.addPage();
  fixture.context.trailerInfo.Encrypt = fixture.context.register(fixture.context.obj({
    Filter: 'Standard', V: 1, R: 2, Length: 40, P: -4,
    O: PDFHexString.of('00'.repeat(32)), U: PDFHexString.of('00'.repeat(32)),
  }));
  await page.goto('/');
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#status')).toContainText('Preview ready');
  await page.locator('#file').setInputFiles(upload(1, Buffer.from(await fixture.save({ useObjectStreams: false }))));
  await expect(page.locator('#status')).toContainText('Password-protected PDFs are not supported');
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#downloads a')).toHaveCount(0);
});

test('normal text and primary buttons meet 4.5:1 contrast in both themes', async ({ page }) => {
  await page.goto('/');
  for (const dark of [false, true]) {
    await page.locator('#theme').setChecked(dark);
    const ratios = await page.evaluate(() => {
      const luminance = (color: string) => {
        const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
          const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
      };
      const ratio = (a: string, b: string) => {
        const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
      };
      const body = getComputedStyle(document.body), hint = getComputedStyle(document.querySelector('.hint')!);
      const button = getComputedStyle(document.querySelector('.file-button')!);
      return [ratio(body.color, body.backgroundColor), ratio(hint.color, body.backgroundColor), ratio(button.color, button.backgroundColor)];
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

async function chooseDropdown(page: import('@playwright/test').Page, id: string, name: string) {
  await page.locator(`#${id}-trigger`).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('custom dropdowns support keyboard, dismissal and certificate updates', async ({ page }) => {
  await mockCryptoPro(page);
  await page.goto('/');
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#status')).toContainText('Preview ready');
  await expect(page.getByRole('combobox', { name: /Available certificates/ })).toBeEnabled();
  const zoom = page.getByRole('combobox', { name: /Zoom/ });
  await zoom.click();
  await page.getByRole('option', { name: '150%', exact: true }).click();
  await expect(zoom).toHaveText('150%');
  await expect(page.locator('#zoom')).toHaveValue('1.5');
  await zoom.press('ArrowDown');
  await zoom.press('Home');
  await zoom.press('Enter');
  await expect(zoom).toHaveText('Fit width');
  await zoom.click();
  await zoom.press('Escape');
  await expect(zoom).toHaveAttribute('aria-expanded', 'false');
  const format = page.getByRole('combobox', { name: /Output format/ });
  await format.click();
  await format.press('End');
  await format.press('Enter');
  await expect(page.locator('#signing-mode')).toHaveValue('embedded');
  await page.reload();
  await page.locator('#file').setInputFiles(upload());
  await expect(format).toHaveText('Embedded signature (.pdf)');
  await format.click();
  await page.locator('h1').click();
  await expect(format).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#connect')).toBeEnabled();
  const certificate = page.getByRole('combobox', { name: /Available certificates/ });
  await expect(certificate).toBeEnabled();
  await expect(certificate).toHaveText('Test signer');
  await certificate.click();
  await expect(page.getByRole('option', { name: 'Test signer', exact: true })).toBeVisible();
});

test('local worker preview, navigation, zoom, reset, theme and mobile layout', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.locator('#theme').check(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#file').setInputFiles(upload(3));
  await expect(page.locator('#status')).toHaveText('Page 1 of 3. Preview ready.');
  expect(await page.locator('#preview').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('#status')).toHaveText('Page 2 of 3. Preview ready.');
  await page.locator('#page').fill('3'); await page.locator('#page').press('Tab');
  await expect(page.locator('#status')).toHaveText('Page 3 of 3. Preview ready.');
  await expect(page.locator('#next')).toBeDisabled();
  await chooseDropdown(page, 'zoom', '200%');
  await expect(page.locator('#status')).toHaveText('Page 3 of 3. Preview ready.');
  await page.setViewportSize({ width: 375, height: 812 });
  await chooseDropdown(page, 'zoom', 'Fit width');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/preview-mobile-dark.png', fullPage: true });
  await page.locator('#reset').click();
  await expect(page.locator('#workspace')).toBeHidden();
  expect(await page.locator('#preview').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(0);
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

async function mockCryptoPro(page: import('@playwright/test').Page, mode = 'success') {
  await page.route('**/vendor/cadesplugin_api.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    const cert = { HasPrivateKey: async () => true, ValidFromDate: '2020-01-01', ValidToDate: '2100-01-01', Thumbprint: 'test', SubjectName: 'Test signer', IssuerName: 'Test issuer', SerialNumber: '01', PublicKey: async () => ({ Algorithm: { Value: 'test-oid' } }) };
    const collection = { Count: '${mode}' === 'empty' ? 0 : 1, Item: async () => cert, Find: async () => collection };
    globalThis.cadesplugin = { CreateObjectAsync: async name => {
      if (name === 'CAdESCOM.About') return { PluginVersion: 'test', CSPVersion: async () => 'test' };
      if (name === 'CAdESCOM.Store') return { Open: async () => {}, Close: async () => {}, Certificates: collection };
      if (name === 'CAdESCOM.CPSigner') return { propset_Certificate: async () => {}, propset_Options: async () => {} };
      let content;
      return { propset_ContentEncoding: async () => {}, propset_Content: async value => { content = value; },
        SignCades: async () => { if ('${mode}' === 'failure') throw new Error('Access denied'); if ('${mode}' === 'pending') await new Promise(() => {}); if ('${mode}' === 'embedded') { const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(content), c => c.charCodeAt(0)))); return btoa(String.fromCharCode(48, 32, ...hash)); } return content; },
        VerifyCades: async signature => { if ('${mode}' === 'embedded') { const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(content), c => c.charCodeAt(0)))); if (signature !== btoa(String.fromCharCode(48, 32, ...hash))) throw new Error('Changed content'); return; } if (content !== signature) throw new Error('Changed content'); } };
    } };
  ` }));
}

test('automatic readiness shows missing certificates and hides after a successful retry', async ({ page }) => {
  await mockCryptoPro(page, 'empty');
  await page.goto('/');
  await expect(page.locator('#readiness')).toBeVisible();
  await expect(page.locator('#readiness-status')).toContainText('0 time-valid certificate(s)');
  await page.evaluate(() => {
    const plugin = (window as unknown as { cadesplugin: { CreateObjectAsync: (name: string) => Promise<unknown> } }).cadesplugin;
    const create = plugin.CreateObjectAsync;
    plugin.CreateObjectAsync = async name => {
      const result = await create(name);
      if (name === 'CAdESCOM.Store') (result as { Certificates: { Count: number } }).Certificates.Count = 1;
      return result;
    };
  });
  await page.locator('#connect').click();
  await expect(page.locator('#readiness')).toBeHidden();
  await expect(page.locator('#readiness-status')).toContainText('1 time-valid certificate(s)');
});

test('detached signing downloads exact PDF and decoded signature, then clears results', async ({ page }) => {
  await mockCryptoPro(page);
  await page.goto('/');
  await expect(page.locator('#connect')).toBeEnabled();
  await expect(page.locator('#readiness-status')).toContainText('Plug-in test');
  await expect(page.locator('#readiness')).toBeHidden();
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#sign')).toBeEnabled();
  await page.locator('#sign').click();
  await expect(page.locator('#signing-status')).toContainText('changed-byte check rejected');
  const links = page.locator('#downloads a');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const bytes = await link.evaluate(async (a: HTMLAnchorElement) => Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())));
    expect(Buffer.from(bytes)).toEqual(pdf());
  }
  await expect(links.nth(1)).toHaveAttribute('download', 'Preview.pdf.sig');
  await page.locator('#reset').click();
  await expect(links).toHaveCount(0);
});

test('release policy blocks external connections and permits local PDF downloads', async ({ page }) => {
  await mockCryptoPro(page);
  const response = await page.goto('/');
  expect(response?.headers()['cache-control']).toBe('no-store');
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(await page.evaluate(async () => {
    try { await fetch('https://example.com/document-upload', { method: 'POST', body: 'blocked' }); return false; }
    catch { return true; }
  })).toBe(true);
  await expect(page.locator('#connect')).toBeEnabled();
  await page.locator('#file').setInputFiles({ ...upload(), name: 'Документ.pdf' });
  await expect(page.locator('#sign')).toBeEnabled();
  await page.locator('#sign').click();
  const links = page.locator('#downloads a');
  await expect(links).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const downloading = page.waitForEvent('download');
    await links.nth(i).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(i ? 'Документ.pdf.sig' : 'Документ.pdf');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(pdf());
  }
  await page.locator('#stamp-enabled').check();
  await expect(page.locator('#stamp-status')).toContainText('Stamp on page');
  await page.locator('#reset').click();
  expect(await page.locator('#stamp-preview').evaluate((c: HTMLCanvasElement) => c.width * c.height)).toBe(0);
  await expect(links).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).every(key => ['pdf-signer-theme', 'pdf-signer-output-format', 'pdf-signer-stamp-caption'].includes(key)))).toBe(true);
});

test('missing native API keeps preview available and signing disabled', async ({ page }) => {
  await page.route('**/vendor/cadesplugin_api.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await expect(page.locator('#connect')).toBeEnabled();
  await expect(page.locator('#readiness-status')).toContainText('CryptoPro unavailable');
  await expect(page.locator('#readiness')).toBeVisible();
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#status')).toContainText('Preview ready');
  await expect(page.locator('#sign')).toBeDisabled();
});

for (const mode of ['failure', 'pending']) {
  test('detached signing ' + mode + ' exposes no downloads', async ({ page }) => {
    await mockCryptoPro(page, mode);
    await page.goto('/');
    await expect(page.locator('#connect')).toBeEnabled();
    await expect(page.locator('#readiness-status')).toContainText('Plug-in test');
  await expect(page.locator('#readiness')).toBeHidden();
    await page.locator('#file').setInputFiles(upload());
    await expect(page.locator('#sign')).toBeEnabled();
    await page.locator('#sign').click();
    if (mode === 'pending') await page.locator('#cancel-sign').click();
    await expect(page.locator('#signing-status')).toContainText(mode === 'pending' ? 'Cancelled' : 'Signing failed');
    await expect(page.locator('#downloads a')).toHaveCount(0);
  });
}

for (const rotation of [0, 90, 180, 270]) {
  test(`stamp export matches visible placement on cropped ${rotation}-degree page`, async ({ page }) => {
    const fixture = await PDFDocument.create();
    const sheet = fixture.addPage([700, 900]);
    sheet.setCropBox(40, 60, 500, 700); sheet.setRotation(degrees(rotation));
    fixture.addPage([300, 400]);
    await page.goto('/');
    await page.locator('#file').setInputFiles(upload(1, Buffer.from(await fixture.save())));
    await expect(page.locator('#status')).toContainText('Preview ready');
    await page.locator('#stamp-enabled').check();
    await expect(page.locator('#stamp-page')).toHaveValue('2');
    await expect(page.locator('#status')).toHaveText('Page 2 of 2. Preview ready.');
    await expect(page.locator('#stamp-x')).toHaveValue('24');
    await expect(page.locator('#stamp-y')).toHaveValue('236');
    await page.locator('#stamp-page').fill('1'); await page.locator('#stamp-page').press('Tab');
    await page.locator('#stamp-y').fill('24');
    await page.locator('#stamp-width').fill('280');
    await page.locator('#stamp-caption').fill('Подписано: Иван Иванов');
    await expect(page.locator('#stamp-overlay')).toBeVisible();
    await page.locator('#stamp-overlay').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#stamp-x')).toHaveValue('25');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('#stamp-height')).toHaveValue('141');
    await chooseDropdown(page, 'zoom', '100%');
    await expect.poll(() => page.locator('#stamp-overlay').evaluate(e => parseFloat(e.style.left))).toBe(25);
    await expect(page.locator('#stamp-status')).toHaveText('Stamp on page 1.');
    const previewPixels = await page.locator('#stamp-preview').evaluate((source: HTMLCanvasElement) => {
      const c = document.createElement('canvas'); c.width = 280; c.height = 141;
      c.getContext('2d')!.drawImage(source, 0, 0, 280, 141);
      return Array.from(c.getContext('2d')!.getImageData(0, 0, 280, 141).data);
    });
    await page.locator('#export-stamp').click();
    await expect(page.locator('#downloads a')).toHaveCount(1);
    const output = await page.locator('#downloads a').evaluate(async (a: HTMLAnchorElement) => Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())));
    const exported = await PDFDocument.load(new Uint8Array(output));
    expect(exported.getPage(0).getRotation().angle).toBe(rotation);
    expect(exported.getPage(0).getCropBox()).toEqual(sheet.getCropBox());
    await page.locator('#file').setInputFiles(upload(1, Buffer.from(output)));
    await expect(page.locator('#status')).toContainText('Preview ready');
    await chooseDropdown(page, 'zoom', '100%');
    // Border must appear at the same visible top-left, regardless of CropBox/Rotate.
    await expect.poll(() => page.locator('#preview').evaluate((c: HTMLCanvasElement) => {
      const ratio = c.width / parseFloat(c.style.width);
      const ctx = c.getContext('2d')!;
      const pixel = ctx.getImageData(Math.round(25 * ratio), Math.round(60 * ratio), 1, 1).data;
      return pixel[0] < 220 && pixel[2] < 240;
    })).toBe(true);
    const exportedPixels = await page.locator('#preview').evaluate((source: HTMLCanvasElement) => {
      const ratio = source.width / parseFloat(source.style.width);
      const c = document.createElement('canvas'); c.width = 280; c.height = 141;
      c.getContext('2d')!.drawImage(source, 25 * ratio, 24 * ratio, 280 * ratio, 141 * ratio, 0, 0, 280, 141);
      return Array.from(c.getContext('2d')!.getImageData(0, 0, 280, 141).data);
    });
    // Allow antialiasing differences between the 2x overlay and final-page render.
    const difference = exportedPixels.reduce((sum, value, i) => sum + Math.abs(value - previewPixels[i]), 0) / exportedPixels.length;
    expect(difference).toBeLessThan(8);
    await page.locator('#stamp-enabled').check();
    await page.locator('#stamp-page').fill('2'); await page.locator('#stamp-page').press('Tab');
    await expect(page.locator('#status')).toContainText('Page 2 of 2');
    await page.locator('#stamp-width').fill('999');
    await expect(page.locator('#stamp-status')).toContainText('must fit');
    await page.locator('#export-stamp').click();
    await expect(page.locator('#signing-status')).toContainText('Export failed');
    await expect(page.locator('#downloads a')).toHaveCount(0);
  });
}

test('undersized stamp stays editable and can be enlarged again', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#status')).toContainText('Preview ready');
  await page.locator('#stamp-enabled').check();
  await chooseDropdown(page, 'zoom', '100%');
  await expect(page.locator('#stamp-status')).toHaveText('Stamp on page 1.');
  const overlay = page.locator('#stamp-overlay');
  await overlay.scrollIntoViewIfNeeded();
  const bounds = (await overlay.boundingBox())!;
  const handle = (await page.locator('#stamp-resize').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + 20);
  await page.mouse.up();
  await expect(page.locator('#stamp-status')).toContainText('Text does not fit');
  await expect(overlay).toBeVisible();
  await expect(overlay).toBeFocused();
  const width = Number(await page.locator('#stamp-width').inputValue());
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#stamp-width')).toHaveValue(String(width + 1));
  await expect(overlay).toBeFocused();
  await page.locator('#export-stamp').click();
  await expect(page.locator('#signing-status')).toContainText('Text does not fit');
  await expect(page.locator('#downloads a')).toHaveCount(0);
  await overlay.scrollIntoViewIfNeeded();
  const smallBounds = (await overlay.boundingBox())!;
  const smallHandle = (await page.locator('#stamp-resize').boundingBox())!;
  await page.mouse.move(smallHandle.x + smallHandle.width / 2, smallHandle.y + smallHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(smallBounds.x + 280, smallBounds.y + 140);
  await page.mouse.up();
  await expect(page.locator('#stamp-status')).toHaveText('Stamp on page 1.');
  await expect(overlay).toBeVisible();
  await page.locator('#export-stamp').click();
  await expect(page.locator('#downloads a')).toHaveCount(1);
});

test('stamped detached output signs exported bytes and edits invalidate results', async ({ page }) => {
  await mockCryptoPro(page);
  await page.goto('/'); await expect(page.locator('#connect')).toBeEnabled();
  await expect(page.locator('#readiness-status')).toContainText('Plug-in test');
  await expect(page.locator('#readiness')).toBeHidden();
  await page.locator('#file').setInputFiles(upload());
  await expect(page.locator('#status')).toContainText('Preview ready');
  await page.locator('#stamp-enabled').check();
  await page.locator('#stamp-caption').fill('Документ подписан');
  await expect(page.locator('#stamp-overlay')).toBeVisible();
  await page.locator('#stamp-overlay').scrollIntoViewIfNeeded();
  const bounds = (await page.locator('#stamp-overlay').boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 20); await page.mouse.down();
  await page.mouse.move(bounds.x + 30, bounds.y + 30); await page.mouse.up();
  expect(Number(await page.locator('#stamp-x').inputValue())).toBeGreaterThan(24);
  await page.locator('#sign').click();
  await expect(page.locator('#signing-status')).toContainText('changed-byte check rejected');
  const links = page.locator('#downloads a');
  await expect(links).toHaveCount(2);
  const results = await links.evaluateAll(async elements => Promise.all(elements.map(async a => Array.from(new Uint8Array(await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer())))));
  expect(results[0]).toEqual(results[1]);
  expect(Buffer.from(results[0])).not.toEqual(pdf());
  await expect(links.nth(0)).toHaveAttribute('download', 'Preview-stamped.pdf');
  await expect(links.nth(1)).toHaveAttribute('download', 'Preview-stamped.pdf.sig');
  await page.locator('#stamp-caption').fill('Changed');
  await expect(links).toHaveCount(0);
});

for (const stamp of [false, true]) {
  test('embedded PDF download with stamp ' + stamp, async ({ page }) => {
    await mockCryptoPro(page, 'embedded');
    await page.goto('/'); await expect(page.locator('#connect')).toBeEnabled();
    await expect(page.locator('#readiness-status')).toContainText('Plug-in test');
  await expect(page.locator('#readiness')).toBeHidden();
    await page.locator('#file').setInputFiles(upload());
    await expect(page.locator('#sign')).toBeEnabled();
    if (stamp) {
      await page.locator('#stamp-enabled').check();
      await expect(page.locator('#stamp-status')).toContainText('Stamp on page');
    }
    await chooseDropdown(page, 'signing-mode', 'Embedded signature (.pdf)');
    await page.locator('#sign').click();
    await expect(page.locator('#signing-status')).toContainText('Embedded CAdES-BES verified');
    const links = page.locator('#downloads a');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('download', stamp ? 'Preview-stamped-signed.pdf' : 'Preview-signed.pdf');
    const output = await links.evaluate(async (a: HTMLAnchorElement) => Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())));
    const pdf = await PDFDocument.load(new Uint8Array(output));
    expect(pdf.getForm().getFields()).toHaveLength(1);
    await page.locator('#file').setInputFiles(upload(1, Buffer.from(output)));
    await expect(page.locator('#signing-status')).toContainText('Existing signature');
    await expect(page.locator('#sign')).toBeDisabled();
    await expect(links).toHaveCount(0);
  });
}
