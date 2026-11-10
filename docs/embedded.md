# Embedded PDF signatures

Select **Embedded signature (.pdf)** to download `<name>-signed.pdf` (or
`<name>-stamped-signed.pdf`). All preparation and assembly take place in browser
memory. The source file stays unchanged.

The optional stamp is applied first. pdf-lib then serializes the supported
unsigned PDF with an invisible zero-area AcroForm signature widget on page 1,
`/SigFlags 3`, `/Filter /Adobe.PPKLite`, and
`/SubFilter /adbe.pkcs7.detached`. This is a detached CAdES-BES CMS container
inside a PDF signature dictionary, not an attached container holding a PDF.
No PAdES conformance, trusted timestamp, long-term validation, or independent
certificate trust/revocation assessment is claimed.

The existing CryptoPro adapter requests binary detached CAdES-BES using
`SignCades(..., CADESCOM_CADES_BES, true)`. CryptoPro selects the digest/signature
algorithm from the selected certificate and provider; the app does not force
SHA-256 for GOST keys. The certificate panel shows the public-key algorithm OID.
Unsupported certificate/provider combinations fail through CryptoPro.
See [CryptoPro SignCades](https://docs.cryptopro.ru/cades/reference/cadescom/cadescom_interface/icpsigneddata2signcades).

The PDF is saved without object streams, with fixed-width ByteRange space and
a 32 KiB hex Contents reservation. ByteRange excludes only the Contents string,
including its delimiters. Oversized CMS causes preparation and signing again
with doubled space, up to 1 MiB; this may repeat native authorization dialogs.
Nothing is truncated. The final PDF is parsed again, its CMS DER sequence length
and zero padding checked, and its declared covered bytes verified by CryptoPro.
A changed-byte verification must fail before a download appears.

Supported inputs are unencrypted PDFs accepted by PDF.js and pdf-lib within the
20 MiB / 500-page UI limits. Parsed objects, including compressed objects and
nested dictionaries, are inspected for signature fields, ByteRange, signature
dictionaries and certification/usage permissions. These documents are rejected,
including empty signature fields. XFA is rejected during embedded preparation.
Malformed objects, invalid CMS encoding, native failures and cancellation produce
no download. This rewrites unsigned PDFs; incremental updates and preserving
existing signatures are not supported. CMS must use a definite outer DER length.

pdf-lib supplies low-level PDF serialization, not a signing API; byte-range
preparation and CMS assembly are implemented here. See its
[signature API limitations](https://pdf-lib.js.org/docs/api/classes/pdfsignature).

## Verification status

Automated checks cover multi-page compressed inputs, fixed ranges, parsed output,
tampering, reservation growth, cancellation, invalid CMS, unsafe inputs and browser
downloads with and without stamps. Mock signatures establish orchestration and
byte integrity, not GOST interoperability.

No independent PDF reader/version has yet been recorded as verified for this
implementation. Milestone 5's independent acceptance gate remains open. With a
real test certificate, create both stamped and unstamped outputs, open them in
the agreed GOST-capable PDF verifier (for example a configured CryptoPro PDF
installation), record OS/browser/CSP/plug-in/reader versions and certificate OID,
and confirm document integrity and signer identity. Change a covered byte and
confirm rejection. Also check denied access, token removal, and a large chain.
Record the actual results before claiming reader compatibility or PAdES support.
