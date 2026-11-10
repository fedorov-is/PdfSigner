// Local assets, PDF.js WASM, in-memory downloads, and the official bridge's
// three Chrome extension probes. No application network destination is allowed.
export const csp =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' chrome-extension://epebfcehmdedogndhlcacafjaacknbcm chrome-extension://iifchhfnnmpdbibifmljnfjhpififfog chrome-extension://pfhgbfnnjiafkhfdkmpiflachepdcjod; worker-src 'self' blob:; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const securityHeaders = {
  'Content-Security-Policy': csp + "; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
