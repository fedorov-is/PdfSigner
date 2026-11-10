# Detached signing

Open a supported unencrypted PDF in the main workspace, choose **Check CryptoPro**, inspect the certificate, then choose **Sign PDF**. Native CryptoPro dialogs handle key access and PIN entry. The app never collects a PIN.

After signing, CryptoPro verifies the detached CAdES-BES signature against the preserved input bytes. A changed-byte check must also reject the signature before download links appear. Download both the unchanged PDF and `<original filename>.sig`; the signature is binary DER CMS, not base64 text. The PDF.js worker receives a separate copy, so transferring preview data cannot detach the signing buffer.

Verification here uses CryptoPro and is not an independent verifier. It is not a separate assessment of chain trust, revocation, or signing time. No timestamp service is configured. CryptoPro may perform certificate validation and network access according to its local configuration; validation failures prevent downloads.

Only currently valid certificates reporting a private key are listed. Key access is tested when signing. Missing keys/tokens, denied access, cancellation and native failures produce no result. Bridge/native diagnostics have a timeout; signing and verification have a two-minute deadline. A timeout or browser cancellation discards late results but cannot stop an operation or dismiss a dialog already running in the native plug-in. Dismiss pending native dialogs before retrying.

Replacing or closing the document, changing the certificate, starting another signature or cancelling clears generated links and revokes their object URLs. PDF bytes, certificates and generated files are not persisted. Documents with detected signature fields or byte-range markers are conservatively blocked from signing; this is not a comprehensive signature-validation feature. Existing preview size, page and encryption restrictions apply.

## Validation

Automated tests cover binary preservation and DER decoding, verification failure, tamper rejection, native denial, deadlines, browser download bytes, cancellation and result clearing. Browser tests use a native-API double; they do not prove CMS interoperability.

For manual acceptance with real CryptoPro:

1. Sign a PDF from the main workspace and download both files. Compare the downloaded PDF byte for byte with the source.
2. Verify the pair with an independently configured GOST-capable CMS verifier following [the release verification checklist](release.md). Record verifier/version, algorithm, integrity and trust/revocation results separately.
3. Change one byte in a PDF copy and confirm that verification with the original `.sig` fails.
4. Repeat with native access denied, PIN cancellation, a removed token, an expired certificate and unavailable validation services. Confirm that no successful output appears.
5. Cancel or replace the document while a native dialog is pending, then finish that dialog. Confirm no late download links appear.

These real-environment acceptance checks remain pending for the main workspace.
