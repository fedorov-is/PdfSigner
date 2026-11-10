# Visible stamp editor

Enable **Add visible stamp** after opening an unsigned, unencrypted PDF. New stamps
start at the bottom-left of the last page with a 24-point margin, and the preview
automatically opens that page. On small pages the size and margins shrink to fit. Select
the stamp page and add a caption or organization. The caption is bold and centered,
with an 8-point gap before the details. Selecting a CryptoPro certificate adds only
the owner name, serial number and certificate validity interval beneath it.
Stamp-only export works without CryptoPro.

Drag the stamp to move it, or drag its orange corner to resize it. With the stamp
focused, arrow keys move by one point and Shift + arrow keys resize it. Numeric
fields provide the same operations without a pointer. Coordinates are measured
from the visible page's top-left at PDF.js scale 1. Page rotation, visible crop
box and user-unit scaling are included in the inverse viewport transform used
for export. Out-of-bounds numeric settings block export; pointer and keyboard
operations stay inside the current page.

The preview renders the same temporary PDF that supplies the exported stamp's
rounded vector border, white background and searchable text. Text grows or shrinks
to the largest size that fits the stamp dimensions, wrapping where needed, with
a minimum 5-point font; content that still does not fit is rejected.
Unsupported font characters also produce an explicit error. Noto Sans Regular and Bold
is packaged locally, supports Cyrillic, and is subset-embedded in the PDF. Its
SIL Open Font License is included at `public/fonts/OFL.txt`; the source font is
from the Noto project's `notofonts.github.io/fonts/NotoSans/hinted/ttf/` archive.
PDF editing uses pdf-lib (MIT) and @pdf-lib/fontkit (MIT), pinned in the lockfile.

**Export stamped PDF** creates `<name>-stamped.pdf`. **Sign PDF** prepares that
same stamp before asking CryptoPro to sign; the resulting PDF and detached
`.sig` cover exactly the same bytes. Settings and certificate changes discard
downloads and invalidate pending results. Preparation takes a snapshot of the
stamp text, geometry, page and certificate information before signing. PDF and
certificate data stay in memory. The theme preference and user-entered caption
are saved in localStorage. Caption edits, including an empty caption, are restored
after reload and retained when switching or closing documents.

A visible stamp is not a cryptographic signature. The validity interval describes the certificate, not the signing time. Editing PDFs with detected existing
signatures remains blocked, since pdf-lib rewrites the document. Embedded
cryptographic PDF signatures remain milestone 5.

Automated Chrome checks cover Cyrillic stamps, crop offsets at rotations
0/90/180/270, mixed page sizes, zoom, keyboard move/resize, dragging, invalid
bounds, export, exact stamped-byte detached signing with a mock adapter, and
download invalidation. Independent verification of a stamped PDF/signature pair
using real CryptoPro and the chosen GOST verifier remains a manual acceptance
check; no independent-verifier compatibility claim is made by these tests.
