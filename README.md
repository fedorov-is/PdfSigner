# PDF Signer

A planned static web application for signing PDF files in the browser using **CryptoPro CSP and CryptoPro ЭЦП Browser plug-in**. Users will be able to create a separate signature file, embed a digital signature into a PDF, and place a visible stamp on a document before signing.

**Status:** planning. This repository currently contains the project description and implementation roadmap; the application has not been implemented yet.

## Goals

- Process PDF files locally in the browser without an application backend or document uploads.
- Let users inspect a PDF, select a signing certificate, choose an output format, and download the result.
- Provide clear installation diagnostics and actionable CryptoPro errors.
- Reuse the visual style of the sibling project [ShareFolderAsSite](../ShareFolderAsSite).

## Signing modes

| Mode | Output | Behavior |
| --- | --- | --- |
| Separate signature | PDF plus a detached CMS/CAdES signature, initially `.sig` | Sign the exact bytes of the final PDF. The PDF and signature must be kept together for verification. |
| Embedded signature | A signed `.pdf` | Store a cryptographic signature in the PDF signature structure, covering its declared byte ranges. Target a documented PDF/CAdES profile after interoperability testing. |
| Visible stamp | A PDF containing a stamp | Add a visible representation of signing information. A stamp alone is not a cryptographic signature. It can be used with either signing mode or exported on its own. |

An attached CAdES container holding a PDF is a different output format from a signature embedded in the PDF structure. The embedded-signature feature must produce an actual signed PDF.

### Visible stamp

The planned stamp editor will support:

- Selecting a page, dragging the stamp, and resizing it within page boundaries.
- Displaying the certificate holder, issuer, serial number, and a signing-time label, with an optional organization or custom caption.
- Previewing and exporting text and a border as PDF content with embedded fonts, including Cyrillic support.
- Correct placement across zoom levels, rotated pages, and different page sizes and crop boxes.
- A text-based position and size alternative to dragging for keyboard users.

The stamp must be finalized **before** the signature is calculated. For detached signing, the exported stamped PDF is the document paired with the signature. For embedded signing, the stamp and signature field are prepared before calculating the PDF byte-range digest. The displayed time is informational unless backed by a verified timestamp service.

## Intended user flow

1. Open the application and view CryptoPro readiness: bridge, native plug-in, provider, and available certificates.
2. Select or drop a local PDF, then inspect its pages and any detected existing signatures.
3. Optionally add and position a stamp. Stamp-only export should work without CryptoPro.
4. Choose separate or embedded signing and select a certificate. Show subject, issuer, validity dates, and available key information.
5. Review the final document and output mode, then explicitly start signing. CryptoPro may request access or a token PIN through its native UI.
6. Verify the generated result where supported, then download it. Detached mode offers both the exact PDF that was signed and its signature.

Cancellation, unavailable keys, unsupported PDFs, and failed verification must leave the original file intact and must not produce a success message.

## Runtime requirements and privacy

The planned signing environment requires a supported browser/OS combination, CryptoPro CSP, the native CryptoPro Browser plug-in and its browser extension where required, and access to a signing certificate with its private key. Installation, licensing, supported algorithms, and browser compatibility must be documented against the versions tested during implementation.

The application will be served as static assets over HTTPS, with a local development server for development. Static hosting does not remove the need for the locally installed CryptoPro components.

PDF bytes and generated artifacts should stay in browser memory. The application must not export private keys, collect PINs, log document contents, or persist PDFs or certificate details in browser storage. Only non-sensitive preferences such as the theme should be stored. Certificate validation or optional timestamping may require network requests from CryptoPro or the client; these dependencies must be described before such features are enabled. Fully offline operation is not an initial guarantee.

## Visual design

Use `C:\Development\Personal\js\ShareFolderAsSite\styles.css` and `index.html` as the styling reference. Adapt its design tokens and reusable patterns into this repository so deployment does not depend on a sibling directory.

- System font stack, 15px body text, compact headings, and a centered 960px content area.
- Light theme: background `#f7f7f8`, text `#1d1d1f`, white cards, border `#e2e2e6`.
- Dark theme: background `#18181b`, text `#ececf0`, cards `#222226`, border `#34343a`.
- Orange accent `#fc3f1d`, 8px button/card corners, and 12px viewer corners.
- Compact top bar, bordered panels, tab navigation, muted hints, status messages, and a footer theme switch.
- Responsive PDF preview with a settings panel that stacks on narrow screens; visible keyboard focus and accessible form labels.

Keep the first screen focused on opening a PDF and checking CryptoPro readiness. Show certificate and stamp controls when a document is loaded.

## Proposed architecture

Use TypeScript with a lightweight static build, provisionally Vite and native DOM components. No server-side signing endpoint is planned. Final dependencies and versions will be selected in the feasibility milestone, including license and browser compatibility review.

| Component | Responsibility |
| --- | --- |
| Application state and UI | Document workflow, status, theme, progress, and downloads |
| CryptoPro adapter | Load the official bridge, detect readiness, enumerate certificates, sign and verify binary content through asynchronous APIs |
| PDF preview | Render pages with PDF.js and map preview coordinates to PDF coordinates |
| Stamp editor | Configure stamp content, position, dimensions, and font embedding |
| PDF preparation | Apply stamps and prepare signature fields, placeholders, byte ranges, and serialization |
| Signing orchestration | Freeze prepared bytes, request a CMS signature, assemble output, verify, and expose downloads |

PDF.js is a rendering candidate; a PDF editing library such as pdf-lib is a candidate for stamp-only document preparation. PDF signature serialization and incremental updates require a separate capability evaluation: a general-purpose editor is not assumed to preserve existing signatures or implement PDF signing correctly.

### Binary and PDF signing rules

- Keep document bytes as `ArrayBuffer`/`Uint8Array`; use the official plug-in's binary/base64 conventions explicitly. Do not sign a filename, a text-decoded PDF, or base64 text accidentally.
- Detached signing uses the exact final PDF bytes and an explicitly selected CAdES profile, initially targeting CAdES-BES.
- Embedded signing prepares a signature dictionary, fixed-size `/Contents` reservation, and finalized `/ByteRange`. Sign precisely the covered bytes and fill the reservation without changing offsets or covered content afterward.
- If the CMS signature exceeds the reservation, regenerate the prepared PDF and sign it again; never truncate it.
- Validate the selected `/SubFilter`, CMS attributes, digest algorithm, and certificate compatibility with independent target verifiers before claiming a specific PAdES profile.
- Initially block editing or signing PDFs with existing signatures unless preservation is demonstrated. Later support requires incremental updates and respect for certification permissions; preserving earlier bytes alone is insufficient.
- Define explicit handling for encrypted, malformed, and unsupported PDFs. Do not silently flatten documents or remove signatures.

## Implementation roadmap

Each milestone has an acceptance gate. Embedded signing remains a required project feature even if the first usable release ships detached signing earlier.

### 1. Validate CryptoPro and PDF signing feasibility

- [ ] Record a tested OS/browser/CSP/plug-in matrix and obtain suitable test certificates, including supported GOST variants.
- [ ] Build a minimal bridge experiment: readiness, certificate selection, signing exact binary data, and verification.
- [ ] Choose the detached encoding, filename convention, and initial signature profile.
- [ ] Prove browser-only embedded signing on a small fixture: prepare byte ranges, create CMS through CryptoPro, embed it, and verify with an independent GOST-capable PDF verifier.
- [ ] Evaluate PDF rendering/editing/signing dependencies, licenses, bridge distribution terms, font licenses, and static asset packaging.
- [ ] Record the supported PDF subset and target verifiers. Resolve technical blockers before committing to a PDF library.

**Acceptance:** reproducible detached and embedded proof-of-concept outputs validate independently; remaining compatibility restrictions are documented.

### 2. Build the static shell and PDF preview

- [ ] Set up TypeScript, the build, linting, and local development commands.
- [ ] Adapt ShareFolderAsSite tokens, panels, buttons, status styling, and persisted light/dark theme.
- [ ] Add local file selection, drag and drop, file validation, page navigation, zoom, and document reset.
- [ ] Package the PDF renderer and worker locally; establish file-size/page-count limits from measurements.
- [ ] Add accessible controls and clear loading, empty, and error states.

**Acceptance:** the production build runs from static hosting, previews supported PDFs, and works in both themes and narrow layouts.

### 3. Deliver detached signing

- [ ] Implement the CryptoPro adapter, timeout handling, readiness diagnostics, and certificate details.
- [ ] Handle missing plug-in, denied access, expired certificates, inaccessible private keys, token removal, cancellation, and signing failures.
- [ ] Generate and download a detached signature together with the exact PDF it covers.
- [ ] Verify generated signatures and distinguish cryptographic integrity from certificate trust/revocation status.

**Acceptance:** an independent verifier accepts the downloaded pair; changing one PDF byte makes integrity verification fail; cancelled operations produce no success state.

### 4. Add the visible stamp editor

- [ ] Implement page selection, dragging, resizing, keyboard controls, and preview-to-PDF coordinate conversion.
- [ ] Add certificate-based text, custom captions, embedded Cyrillic fonts, and bounds validation.
- [ ] Export stamp-only PDFs and connect stamped output to detached signing.
- [ ] Freeze the final stamp before signing and invalidate prepared output when its settings change.

**Acceptance:** the downloaded stamp matches the preview on rotated and mixed-size pages; its detached signature validates against the exported PDF.

### 5. Deliver embedded PDF signatures

- [ ] Productionize the proven byte-range and placeholder implementation with a visible or invisible signature field.
- [ ] Include the optional stamp in the prepared revision before signing.
- [ ] Handle placeholder sizing, CMS decoding, algorithm selection, and final output verification.
- [ ] Detect existing signatures and certification restrictions; reject unsupported cases with an explanation.
- [ ] Document the exact embedded signature profile and verified reader compatibility.

**Acceptance:** supported PDFs open and verify in the agreed independent GOST-capable tools; tampering is detected; oversized signatures and unsupported inputs fail safely.

### 6. Harden and release

- [ ] Test binary conversions, coordinate transforms, byte-range coverage, placeholder overflow, and downloaded-file integrity with meaningful fixtures.
- [ ] Run browser integration tests with a mocked adapter for UI failures and manual tests with real CryptoPro and a test key/token.
- [ ] Cover Cyrillic names, large files, rotated/cropped pages, malformed PDFs, encrypted PDFs, and already signed documents.
- [ ] Test keyboard operation, theme contrast, memory use, and clearing document state on reset.
- [ ] Pin dependencies, package approved assets locally, configure a compatible content security policy, and exclude document data from telemetry and caches.
- [ ] Document installation, supported environments, troubleshooting, build commands, static deployment, limitations, and verification instructions.

**Acceptance:** the published static build passes the recorded compatibility matrix and end-to-end signing checks for both output modes, with and without a stamp.

### Later enhancements

- [ ] Multiple signatures through incremental PDF updates, with permission and prior-signature validation.
- [ ] Timestamping and longer-term validation profiles after evaluating service access, CORS, trust material, and offline limitations.
- [ ] Batch detached signing with explicit document review and cancellation behavior.
- [ ] Reusable stamp presets, localization, and optional user-supplied stamp artwork.
- [ ] Verification of externally supplied PDF/signature pairs and embedded signatures beyond generated-output checks.

## Technical references

- [CryptoPro Browser plug-in usage](https://docs.cryptopro.ru/cades/plugin/plugin-usage)
- [CryptoPro plug-in methods and constants](https://docs.cryptopro.ru/cades/plugin/plugin-methods)
- [CryptoPro binary content encoding](https://docs.cryptopro.ru/cades/plugin/content-encoding)
- [CryptoPro File API signing example](https://docs.cryptopro.ru/cades/plugin/plugin-samples/plugin-samples-fileapi)
- [PDF.js project and documentation](https://mozilla.github.io/pdf.js/)
- [pdf-lib documentation](https://pdf-lib.js.org/)

These references guide implementation; library selection and signature-profile compatibility remain subject to the feasibility checks above.
