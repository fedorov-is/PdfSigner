import { t } from '../i18n/index.js';

export function createDownloads(container: HTMLElement) {
  const urls = new Set<string>();
  function clear() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    container.replaceChildren();
  }
  function add(bytes: Uint8Array, name: string, type: string) {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type }),
    );
    urls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.textContent = t('Download ') + name;
    container.append(link, document.createElement('br'));
  }
  return { add, clear };
}
