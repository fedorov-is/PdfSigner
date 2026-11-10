# Hardening and release

The static release candidate is prepared locally. Publication and real CryptoPro
acceptance are pending; automated signatures use a test adapter and do not prove
GOST interoperability. No PAdES profile or broad platform compatibility is claimed.

## Installation and validation

Use Node 22.13+ (24 recommended), then run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run preview
```

The automated browser suite uses installed Google Chrome. Native signing needs
CryptoPro CSP, CryptoPro ЭЦП Browser plug-in, its official browser extension,
and a time-valid certificate in the current user's My store with its private key.
Install native components from CryptoPro or your organization's approved source;
restart the browser and use **Check CryptoPro**. Allow site access when prompted.
Enter PINs only in the native dialog. Preview and stamp export need no native plug-in.

## Static deployment

Publish only `dist/` over HTTPS, including `vendor/`, `pdfjs/`, `fonts/`, and
`licenses/`. Relative asset paths support a subdirectory deployment. Never publish
the repository, test outputs, or a directory containing user documents. No backend,
analytics, service worker, or document cache is included.

The build embeds a CSP in both HTML entry points and writes `dist/_headers` for
hosts supporting that format. On other hosts translate that file into equivalent
HTTP response headers for every asset. `frame-ancestors` requires an HTTP header;
the HTML meta policy alone cannot prevent framing. Vite preview serves these
headers for local production testing; the development server is not a release host.
Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`.

The policy allows only local application connections and blob downloads. Script
exceptions identify the three Chrome extension probes in the unmodified official
bridge. PDF.js needs WASM compilation; dynamic geometry needs inline styles. Inline
scripts, general JavaScript eval, plugins, forms, and external app connections are
blocked. Validate the policy with the actual installed extension before publishing;
other browser integrations are untested. Native CryptoPro network activity for
certificate checks is outside the page's CSP and does not guarantee offline use.

Responses use `no-store`, `nosniff`, no referrer, and denied framing. Do not add
telemetry, request-body logging, client error payload capture, or a caching service
worker. Persisted settings are theme, output format, and the user-entered stamp
caption; PDFs, signatures, keys, PINs, and certificate metadata are not persisted.
Closing a document revokes result URLs, destroys its PDF.js worker and clears both
preview canvases. JavaScript garbage collection timing is controlled by the browser;
this is not a secure-memory-erasure guarantee.

## Recorded automated coverage

Node fixtures cover all binary byte values and chunk boundaries, exact detached
content, tamper rejection, byte-range coverage, CMS decoding and reservation overflow,
compressed existing signature fields, certification restrictions, XFA and malformed
input. Chrome tests cover both output modes with and without stamps, actual file
downloads, Cyrillic names/captions, missing native API, denied signing, cancellation,
keyboard controls, persisted themes, narrow layouts, rotated/cropped mixed-size
pages, reset, and file/page limits. Main and stamp canvases each have an 8-million
pixel rendering budget. This bounds canvas memory, not total PDF parser memory.

## Manual acceptance record (required before release)

Record exact versions and evidence; leave untested rows pending.

| Environment / check | Status / evidence |
| --- | --- |
| Automated Chrome on this Windows workspace | See test results recorded in README |
| OS, browser, CSP, native plug-in, extension versions | Pending real-environment record |
| GOST algorithm OID, certificate type, key/token model | Pending; never record a PIN or private key |
| Detached, unstamped and stamped: independent verifier accepts exact downloaded pair | Pending |
| Embedded, unstamped and stamped: independent GOST-capable reader accepts PDF | Pending |
| Change a covered byte: independent verifier rejects each mode | Pending |
| Expired certificate, denied access, removed token, unavailable key, native cancellation | Pending real-token checks |
| Password-encrypted PDF rejected, original remains intact | Pending real encrypted fixture |
| Keyboard-only file selection, navigation, stamp editing, signing, download, reset | Automated partial coverage; manual screen reader check pending |
| Light/dark contrast, focus visibility and 200% browser zoom | Automated text contrast; manual visual review pending |
| Repeated 20 MiB open/reset and stamp edits in browser memory profiler | Pending; worker/canvas cleanup is automated |
| Production HTTPS host headers, asset MIME types and real extension CSP compatibility | Pending deployment |
| Official bridge redistribution terms and approved asset review | Pending; local licenses ship for PDF.js, pdf-lib, fontkit and Noto Sans |

Use test documents and a test certificate. For every signing row record the output
mode, stamp choice, algorithm, verifier name/version, result, and date. Retain only
non-sensitive evidence. Plugin verification alone does not establish certificate
trust, revocation status, a trusted timestamp, or independent PDF-reader acceptance.

## Limits and troubleshooting

Inputs are limited to 20 MiB and 500 pages; encrypted PDFs, existing signature
fields and certification restrictions cannot be edited or signed. XFA embedded
signing is rejected. Embedded output uses `adbe.pkcs7.detached`, CAdES-BES and an
invisible field, with no timestamp, incremental signatures or long-term validation.

For readiness failures check native installation, extension enablement and site
access, then retry explicitly. A harmless older-extension probe may fail before
the current extension connects. Keep the official bridge unchanged.
For signature failure check certificate dates, key access and token connection.
Cancellation discards output but cannot dismiss a native operation already running.
For CSP errors check the served headers against the generated policy; do not add
blanket script or network permissions. For a blank preview check local worker,
font and WASM paths and MIME types. Details for each format are in
[detached](detached.md), [embedded](embedded.md), and [stamp](stamp.md) notes.
