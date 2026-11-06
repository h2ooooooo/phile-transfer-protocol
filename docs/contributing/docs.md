# Work on the docs

The site uses VitePress 1.6.4, an SCSS theme, GitHub light/dark syntax themes, and local search. Production output is static and needs no Node.js process on the documentation host. The planned origin is `https://phile-transfer-protocol.jalsoedesign.net`; this workflow only prepares local output.

## Local preview

Install root and client dependencies, prepare the downloadable artifacts, then start the existing dev server:

```sh
npm ci
npm --prefix ptp-client ci
npm run release:build
npm run docs:dev
```

The default VitePress dev port remains 5173. Production preview remains 4173. Preserve any existing `--port` override when using a host-specific command; do not replace other running apps.

## Check and build

```sh
npm run docs:check
npm run release:check
npm run docs:build
npm run docs:preview
```

`docs:check` executes and type-checks all four complete HTTP example variants against a disposable loopback PHP server. `release:check` verifies the archives, a clean installed npm package, and Composer autoloading. `docs:build` rebuilds local release artifacts before building the site. It does not publish them. The build fails on broken internal page links; the docs checker additionally validates built local links, anchors and downloads when production output exists.

## Language tabs and examples

Complete examples live in `docs/examples`. The source snippets are imported into Markdown directly and copied into `docs/public/examples`, so downloadable files and displayed source agree. `LanguageTabs` shares one in-memory selection across source/command groups and SPA navigation. A full page load starts with TypeScript. Keep the order TypeScript, JavaScript, MJS, CommonJS.

Use tabs for actual language variants. YAML, PHP entry points and shell commands keep their appropriate languages. New HTTP examples should use the owning HTTP library directly instead of pretending PTP exports a JavaScript SDK.

## Hosting configuration

`DOCS_BASE` defaults to `/` for the planned subdomain. Set it to a leading/trailing-slash path before building if mounting under a subdirectory. The site keeps `.html` URLs to avoid requiring extensionless rewrites. Do not deploy or publish as part of documentation preparation.
