import ru from './ru.json';

export function resolveLanguage(saved, languages = []) {
  return saved === 'en' || saved === 'ru'
    ? saved
    : languages.some((value) => /^ru(?:-|$)/i.test(value))
      ? 'ru'
      : 'en';
}
let saved;
try {
  saved = globalThis.localStorage?.getItem('pdf-signer-language');
} catch {
  /* Storage is optional. */
}
export const locale = resolveLanguage(
  globalThis.location
    ? (new URL(globalThis.location.href).searchParams.get('lang') ?? saved)
    : saved,
  globalThis.navigator?.languages,
);

export function t(key, ...values) {
  const message = locale === 'ru' ? (ru[key] ?? key) : key;
  return message.replace(/\{(\d+)\}/g, (_, index) =>
    String(values[Number(index)] ?? `{${index}}`),
  );
}

export function initLocalization() {
  document.documentElement.lang = locale;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script, style, code')) continue;
    const text = node.textContent.trim();
    const key = text.replace(/\s+/g, ' ');
    if (key in ru) node.textContent = node.textContent.replace(text, t(key));
  }
  for (const element of document.querySelectorAll('[aria-label]')) {
    element.setAttribute('aria-label', t(element.getAttribute('aria-label')));
  }
  const caption = document.getElementById('stamp-caption');
  if (caption) caption.value = t(caption.value);
  const selector = document.getElementById('language');
  selector.value = locale;
  selector.addEventListener('change', () => {
    try {
      localStorage.setItem('pdf-signer-language', selector.value);
    } catch {
      /* Storage is optional. */
    }
    // Preserve the explicit choice even when storage is unavailable.
    const url = new URL(location.href);
    url.searchParams.set('lang', selector.value);
    location.assign(url.href);
  });
}
