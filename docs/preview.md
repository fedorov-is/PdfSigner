# Milestone 2: static shell and PDF preview

Implemented on 2026-11-10. The main page is a TypeScript/Vite static app; No hosted Site was created: this milestone targets the existing local repository and a deployable static build.

## Commands and hosting

Use Node.js 22.13+ (24 recommended), then `npm.cmd ci`, `npm.cmd run dev`.

- `npm.cmd run build`: TypeScript check and production output in `dist/`.
- `npm.cmd run preview`: serve the production output locally.
- `npm.cmd run lint`: ESLint for the TypeScript implementation and build configuration.
- `npm.cmd test`: existing binary/signing adapter/fixture unit tests.
- `npm.cmd run test:e2e`: production-build browser tests using installed Google Chrome. Run the build first. No CryptoPro installation or test key is needed for preview tests.

Upload the **contents** of `dist/` to static hosting over HTTPS. Relative asset paths support subdirectory hosting. Serve `.js` and `.mjs` as JavaScript and `.wasm` as `application/wasm`. Do not use `file://`. The CryptoPro bridge is intentionally a classic script; the build copies it unchanged into `dist/vendor/`.

PDF.js 6.5.438 is pinned in the lockfile. Its renderer, matching worker, CMaps, standard fonts, WASM resources and Apache-2.0 license are packaged locally. No PDF data is sent to a server. PDF.js reference: https://mozilla.github.io/pdf.js/getting_started/. The CryptoPro bridge loads only on an explicit readiness check on the main page. Certificate enumeration can request native access. Only the theme preference is stored; documents and certificate details are not persisted.

## Supported behavior and limits

Select or drop one PDF, navigate pages, choose fit-width or 50–200% zoom, and close or replace it. Page rendering is cancelled on replacement/navigation; loading tasks are destroyed on reset, replacement and page exit. Canvas buffers are cleared. File extension/MIME is advisory; the loader checks the PDF header and parses the bytes. Empty, oversized, malformed and password-protected inputs produce an error. Existing signatures can be previewed but are not verified or edited. XFA-specific rendering, interactive forms, text selection and a screen-reader text layer are outside this milestone; the canvas has a page label and the controls have accessible labels/focus states.

Initial resource policy: 20 MiB per file, 500 pages, one rendered page at a time, at most 8 million canvas pixels (about 32 MB RGBA). High-DPI scaling is capped at 2 and reduced further for large pages; extreme page dimensions may render below the requested zoom. The byte/page caps are conservative initial limits, not a promise that every document below them is inexpensive. Compressed PDFs may still require substantial parser/image memory.

Measurements using Chrome on this Windows development machine, against the production build:

| Generated fixture                              | Size          | Open through first-page render                 |
| ---------------------------------------------- | ------------- | ---------------------------------------------- |
| 500 simple text pages, alternating page widths | 158,933 bytes | 229–232 ms                                     |
| One text page padded with whitespace           | 20 MiB        | 2,942 ms (includes browser test file transfer) |

The 501-page and 20 MiB + 1 byte fixtures were rejected. These are synthetic boundary measurements, not representative scanned-document benchmarks. Keep the current caps until testing real scanned/image-heavy PDFs on the intended minimum hardware; lowering them remains appropriate if that testing exposes memory pressure.

## Verification

- TypeScript production build and ESLint pass.
- Six existing signing/binary unit tests pass.
- Two Chrome integration tests pass: local worker rendering, navigation, mixed page widths, zoom, theme persistence, mobile width, reset, malformed/header/size/page validation, replacement, and drag/drop.
- Mobile dark-theme screenshot inspected at 375 px; no horizontal document overflow.
- Runtime dependency audit reports zero vulnerabilities. The development-only TypeScript ESLint dependency tree currently reports seven moderate advisories through minimatch; these packages are not in the deployed output. Revisit when upstream publishes compatible patched dependency ranges.

Manual follow-up remains for real native CryptoPro readiness on the new shell, password-protected PDFs from target tools, image-heavy/rotated/Cyrillic PDF samples, additional browsers and assistive technology. Independent signing compatibility checks remain required.
