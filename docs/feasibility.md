# Milestone 1: CryptoPro and PDF signing feasibility

Status as of 2026-11-10: **current feasibility version working; signing and validation confirmed by the user**. After adding the official `cadesplugin_api.js`, the user reported: "everything is working, signing is correct and pass the validation." This supersedes the initial session's missing-bridge and missing-certificate blockers. Exact browser, certificate algorithm, verifier/version and per-mode evidence were not supplied, so this result does not establish a broader supported matrix or a specific PAdES profile. Automated tests separately cover byte handling, adapter arguments and PDF serialization. The repository intentionally has no PDF library dependency yet.

## Run the experiment

1. Use Node.js 22 or newer. There are no npm dependencies to install.
2. The official bridge is now included at `vendor/cadesplugin_api.js`, with `JSModuleVersion` 2.4.5. When updating it, use [CryptoPro downloads](https://www.cryptopro.ru/products/cades/downloads) and retain any required companion files in `vendor/`. Record its version and `Get-FileHash vendor/cadesplugin_api.js -Algorithm SHA256` in your local report.
3. Install/enable the native Browser plug-in and browser extension following [CryptoPro's activation instructions](https://docs.cryptopro.ru/cades/plugin/plugin-activation). Check local-site access permissions. Use test certificates, never production keys for feasibility testing.
4. Run `npm.cmd test` and `npm.cmd run dev` on Windows (`npm test` and `npm run dev` on other systems). Open `http://127.0.0.1:5173`. The server binds only to loopback, serves local assets and disables caching. Production HTTPS hosting and its CSP remain later milestones.
5. Check CryptoPro, inspect the certificate details and select a certificate. Sign a small PDF in detached mode. Download **both** files. Signing and verification use the asynchronous native API with explicit binary/base64 encoding, detached mode and CAdES-BES. A changed-byte verification must be rejected before downloads appear.
6. Run the embedded fixture experiment. Download the signed PDF and the covered-byte/CMS diagnostic pair. The generated PDF uses a signature field, `/adbe.pkcs7.detached`, a fixed 32 KiB CMS reservation, a finalized `/ByteRange` and zero padding in `/Contents`. CMS overflow fails; increase the reservation and repeat preparation **and signing**. Never truncate a CMS signature or reuse one over different prepared bytes.
7. Verify both outputs independently as described below. Record exact tool versions, certificate algorithm OID, output hashes, integrity result and trust/revocation result separately. Do not commit documents, certificate metadata, signatures, private keys or PINs. Local reports/artifacts may go in ignored `artifacts/`.

Native calls can wait for user interaction. Only bridge initialization has a 20-second timeout; signing is not retried or timed out while a PIN/access dialog may remain open. No PIN entry or private key export exists in this application. Store access is closed in a `finally` block. Certificate eligibility checks are not chain validation, a license check or proof that a token is accessible. `VerifyCades` failure may involve trust or network problems; the harness reports failure without claiming to isolate those causes.

## Environment evidence

The user has confirmed successful signing and validation in their interactive setup. The inventory below was collected during the initial implementation session; individual installed browser versions were not identified as the browser used for that successful test. File versions alone are not compatibility results.

| Component | Observed | Actual signing result |
| --- | --- | --- |
| OS | Windows NT 10.0.26300.0, from Environment.OSVersion | Not tested |
| Node.js | 24.13.0 | Automated tests pass |
| Chrome executable | 156.0.8078.81 | Not tested |
| Edge executable | 157.0.4341.42 | Not tested |
| CSP csptest.exe | 5.0.17685.0 | Signing works in the user's setup; runtime version not separately recorded |
| Browser plug-in cades.dll | 2.0.13852.0 | Signing works in the user's setup; runtime version not separately recorded |
| Official JS bridge | Present; JSModuleVersion 2.4.5 | Working, user confirmed |
| Signing certificate/private key | Available in the user's interactive setup | Successful signing reported; algorithm not recorded |
| Signature validation | User reports validation passed | Verifier/version and per-mode results not recorded |

Do not promote this table into a supported-platform list. WMI OS edition inventory was denied; no elevation was attempted. Test at least one agreed browser with each required key algorithm below before choosing the initial support matrix.

| Certificate algorithm | OID | Test certificate/key | Detached, tamper, embedded, independent PDF verification |
| --- | --- | --- | --- |
| GOST R 34.10-2012, 256-bit | 1.2.643.7.1.1.1.1 | Algorithm of successful test not recorded | Per-algorithm evidence pending |
| GOST R 34.10-2012, 512-bit | 1.2.643.7.1.1.1.2 | Algorithm of successful test not recorded | Per-algorithm evidence pending |
| GOST R 34.10-2001, if required | 1.2.643.2.2.19 | Algorithm of successful test not recorded | Per-algorithm evidence pending; legacy support not promised |

For additional algorithm coverage, obtain test identities and their trust chain from the organization's test PKI or approved test CA; import the key with CryptoPro tooling outside the app. Provisioning requires issuer access and cannot be fabricated by a browser harness. Test expired certificates, missing keys, denied access, token removal and cancellation as well as the successful path.

## Extension fallback console error

The user observed `GET chrome-extension://invalid/ net::ERR_FAILED` at `load_js_script` while signing and validation continued to work. In the included bridge, Chrome/Chromium initialization first tries the Manifest V2 extension (`iifchhfnnmpdbibifmljnfjhpififfog`) and falls back on error to the Manifest V3 extension (`pfhgbfnnjiafkhfdkmpiflachepdcjod`). The failed older-extension probe is consistent with this successful fallback.

This console error is harmless in the confirmed working setup. Keep the official bridge unchanged. If readiness or signing also fails, investigate extension installation, enablement, site access and native plug-in availability rather than assuming the fallback succeeded.

## Output decisions

- Detached artifact: raw DER CMS bytes, filename `<original filename>.sig` (for example `report.pdf.sig`), paired with the unchanged `report.pdf`. The base64 string returned by CryptoPro is decoded before download. It is not a base64-text `.sig`, an attached CMS container or a renamed PDF.
- Initial cryptographic request: detached CAdES-BES, including the certificate chain through the plug-in's signer options; no timestamp service configured. The certificate determines the signing algorithm. The harness displays its public-key OID.
- Embedded candidate: the same detached CMS over concatenated PDF byte ranges, carried in a PDF signature dictionary. `/adbe.pkcs7.detached` is an interoperability hypothesis, **not a validated GOST/PAdES profile**. Do not claim PAdES, LTV, trusted signing time or production support from this experiment.
- Embedded subset: only the generated one-page, ASCII, unencrypted PDF fixture, one invisible signature, classic xref, no object streams or prior revisions. No arbitrary input PDF is parsed, rewritten or embedded-signed. Detached mode treats the input as opaque bytes after a `%PDF-` header check and a provisional 20 MiB limit; this is not PDF validity/security analysis. Detached signing does not modify existing signatures, encryption or certification permissions in those bytes.

## Independent verification protocol

Target PDF verifier: Adobe Acrobat/Reader with **CryptoPro PDF** installed and configured. CryptoPro documents the integration and signature verification in its [PDF FAQ](https://cryptopro.ru/products/other/pdf/faq) and [user guide](https://www.cryptopro.ru/sites/default/files/products/pdf/files/CryptoProPDF_UserGuide.pdf). Record actual reader and CryptoPro PDF versions and license conditions; ordinary browser PDF rendering is not GOST signature verification.

For detached outputs, use a separately configured GOST-capable CMS verifier (for example the installed CryptoPro CSP command-line verification tool, following that version's help). Supply raw DER `.sig` and the exact PDF as detached content. Do not upload sensitive files to online verification services. The harness's own `VerifyCades` is a useful cross-check but is not independent evidence. For the embedded PDF, the PDF verifier must discover the field, report valid byte-range integrity and display the expected signer. Verifying only `feasibility-covered.bin` plus its `.sig` does not validate the PDF packaging.

For each algorithm/browser pair:

1. Verify the unmodified detached pair and embedded PDF. Record integrity and certificate trust/revocation outcomes separately, including unavailable revocation services.
2. Change a byte in a detached PDF copy; verification must reject it with the original `.sig`.
3. Change a byte in the embedded PDF's covered page text without changing its length; the PDF verifier must reject its signature. Merely changing padding inside excluded `/Contents` does not test document coverage.
4. Confirm the PDF opens without repair and has exactly one signature covering the complete document except its own hex `/Contents` string.
5. Exercise cancellation and key/token failures; no download or success state should appear. Force a small reservation to test overflow; regenerate and request a new signature to recover.
6. Save reproducible outputs, SHA-256 hashes and verifier evidence locally. Repeat on the agreed supported environments.

## Dependency and packaging evaluation

| Candidate | License/source | Decision and remaining work |
| --- | --- | --- |
| Official CryptoPro bridge | [Vendor distribution](https://www.cryptopro.ru/products/cades/downloads), vendor terms | Included at `vendor/cadesplugin_api.js`, JSModuleVersion 2.4.5; user confirmed working. Retain version/hash and any companion scripts when updating. Confirm redistribution terms before release; native CSP/plug-in licensing is separate. |
| PDF.js | [Official project](https://mozilla.github.io/pdf.js/), Apache-2.0 | Rendering candidate for milestone 2. Not a signing serializer. Select a version, review browser support, package the worker locally and retain notices before adopting. |
| pdf-lib | [Official repository](https://github.com/Hopding/pdf-lib), MIT | Stamp/edit candidate only. Browser-capable; its documented encrypted-document limitations require rejection rather than `ignoreEncryption` as a workaround. Not selected to implement signature preservation or incremental signing. Pin and test a version after the embedded gate. |
| Minimal fixture serializer | Repository source; no third-party dependency | Used only to isolate CMS/PDF interoperability. Does not establish an arbitrary PDF editing solution. Production serializer remains undecided until independent verification. |
| Fonts | Fixture uses the standard PDF Helvetica name; no font binary redistributed | Cyrillic stamp font selection deferred. Review the exact font's embedding/redistribution license and package its license with the chosen asset; no external font requests. |
| Build/runtime | Native browser modules, Node built-ins for tests/server | No npm runtime dependencies or CDN assets. TypeScript/Vite, PDF renderer and worker belong to milestone 2; no versions selected or licenses claimed for uninstalled packages. |

The third-party dependency decision is deliberately deferred while the critical interoperability gate is open. Production assets must be version-pinned, locally packaged, have licenses/notices, and pass the actual supported-browser matrix. General-purpose PDF editing is not evidence of correct signing or preservation of previous signatures.

## Gate and next actions

- Implemented: local bridge experiment, certificate selection, exact-byte signing/verification, DER detached format, generated embedded fixture, byte-range tests and test protocol.
- Confirmed working by the user on 2026-11-10: the official bridge is installed, signing succeeds and signatures pass validation. The original bridge/key availability blockers are resolved for that setup.
- Follow-up evidence: record the exact tested browser, certificate algorithm, verifier/version and detached/embedded results, then expand the compatibility matrix. Confirm distribution/license terms before release.
- The current version is a working feasibility harness. Formal milestone acceptance still requires the detailed independent-verifier evidence described above; production embedded signing needs a separate arbitrary-PDF serialization and permission-preservation design.
