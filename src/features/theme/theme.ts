import { readPreference, writePreference } from '../../shared/lib/preferences';
export function initializeTheme(theme: HTMLInputElement) {
  function applyTheme(dark: boolean) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    theme.checked = dark;
  }
  const stored = readPreference('pdf-signer-theme');
  applyTheme(
    stored
      ? stored === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches,
  );
  theme.addEventListener('change', () => {
    applyTheme(theme.checked);
    writePreference('pdf-signer-theme', theme.checked ? 'dark' : 'light');
  });
}
