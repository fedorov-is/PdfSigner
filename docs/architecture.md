# Source architecture

PDF Signer uses Vite, TypeScript, and browser DOM APIs. It does not require a UI framework or application server. Features own domain behavior; the application composes them with the page markup.

```text
src/
  main.ts                     Browser entry point
  index.html                  Accessible page markup
  app/
    application.ts            Document workflow and feature composition
    styles.css                Design tokens, layout, and component styles
  features/
    preview/                  PDF.js rendering, cancellation, resource limits
    signing/                  CryptoPro adapter, certificate parsing, signature formats
    stamp/                    Stamp generation, validation, preview, and interactions
    theme/                    Theme selection
  shared/
    i18n/                     Localization and Russian messages
    lib/                      Binary conversion, deadlines, DOM lookup, preferences
    ui/                       Dropdown enhancement and managed download links
scripts/                      Node-only tooling and deployment security policy
test/                         Node unit tests and Playwright browser tests
```

## Dependency rules

- `app` composes features and shared code. Features must not import application code.
- Features expose focused functions and receive live state through typed callbacks when needed. This keeps asynchronous operations from retaining outdated document state.
- `shared` contains domain-independent code and must not import features.
- Keep PDF processing and native signing separate from DOM rendering. Existing JavaScript signing modules remain directly executable by Node's unit test runner; new browser modules use strict TypeScript.
- Static runtime assets belong in `public`. Node tooling belongs in `scripts`, outside the browser source tree.

## State and resource ownership

The application owns the open document, selected page, certificate selection, and signing workflow. PDF rendering owns its render task and cancellation counter. Stamp preview owns its revision counter, and stamp interaction owns its active pointer gesture. Downloads own all object URLs and revoke them when results are invalidated or the page closes.

Preserve generation and revision checks around asynchronous work: opening a different document, changing stamp settings, or cancelling signing must prevent stale results from reaching the interface. A browser timeout or cancellation cannot dismiss a native CryptoPro dialog.

## Development checks

Use Node.js 22.13 or newer, run `npm ci`, then:

```sh
npm run format:check
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use the installed Chrome channel and the production build. Run `npm run build` before them. Generated deployment output remains in `src/build/dist` to preserve the existing hosting configuration.

Automated tests use a CryptoPro substitute. Real certificates, tokens, and independent PDF reader acceptance still require the manual checks in [release.md](release.md).
