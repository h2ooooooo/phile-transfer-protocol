# Work on the docs

The site uses VitePress 1.6.4, an SCSS theme, GitHub light/dark syntax themes, and local search. Production output is static and needs no Node.js process on the documentation host. The public documentation URL is [h2ooooooo.github.io/phile-transfer-protocol](https://h2ooooooo.github.io/phile-transfer-protocol/).

## Local preview

Install root and client dependencies, prepare the downloadable artifacts, then start the existing dev server:

```sh
npm ci
npm --prefix ptp-client ci
npm run release:build
npm run docs:dev
```

The default VitePress dev port remains 5173. Production preview remains 4173. Preserve any existing `--port` override when using a host-specific command; do not replace other running apps. Release archives and runnable examples require PHP 8.2+ with JSON, OpenSSL, mbstring, and ZipArchive available to the build host.

## Check and build

```sh
npm run test:docs
npm run docs:build
npm run docs:check
npm run release:check
npm run docs:preview
```

`test:docs` checks root/subpath links and release URL handling. `docs:check` executes and type-checks all four complete HTTP example variants against a disposable loopback PHP server, then validates rendered pages, anchors, assets, downloads, and the acceptable-use page. It also checks relative README links. `release:check` verifies archives, a clean installed npm package, and Composer autoloading. `docs:build` rebuilds release artifacts before building the site. Local commands prepare files; the GitHub Actions deployment job publishes the checked site.

## Language tabs and examples

Complete examples live in `docs/examples`. Source snippets are imported into Markdown directly and copied into `docs/public/examples`, so downloadable files and displayed source agree. `LanguageTabs` shares one in-memory selection across source/command groups and SPA navigation. A full page load starts with TypeScript. Keep the order TypeScript, JavaScript, MJS, CommonJS.

Use tabs for actual language variants. YAML, PHP entry points and shell commands keep their appropriate languages. GitHub-style alerts such as `> [!CAUTION]` render in both VitePress and GitHub Markdown. New HTTP examples should use the owning HTTP library directly instead of pretending PTP exports a JavaScript SDK.

## GitHub Pages

The source repository stays at [github.com/h2ooooooo/phile-transfer-protocol](https://github.com/h2ooooooo/phile-transfer-protocol). GitHub Pages serves the built docs at [h2ooooooo.github.io/phile-transfer-protocol](https://h2ooooooo.github.io/phile-transfer-protocol/). The README links to the site and keeps normal GitHub tables, code blocks, alerts, and the workflow status badge. The hosted site links back to GitHub.

To enable deployment:

1. Open the repository's **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. No branch or `/docs` publishing folder is needed for this workflow.
3. Put `.github/workflows/docs.yml` on `main`. A push to `main` starts the **Documentation** workflow. You can also select **Actions > Documentation > Run workflow** on `main` after it is present.
4. If repository action restrictions are enabled, allow the actions pinned in the workflow, including `shivammathur/setup-php`. The built-in `GITHUB_TOKEN` handles deployment; no personal access token or deployment secret is required.
5. Optionally restrict the `github-pages` environment to `main` in **Settings > Environments**.
6. In the repository's **About** section, edit **Website** to the Pages URL so visitors can open the documentation from the repository header.

The workflow installs locked Node dependencies, sets up PHP 8.2, builds the release archives and VitePress site, runs the docs checks, and uploads only `docs/.vitepress/dist`. The deployment job runs after the build succeeds. The source tree stays on `main`; compiled files do not need a `gh-pages` branch.

See [GitHub's publishing-source setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Base paths and custom domains

`DOCS_BASE` defaults to `/` for local development. GitHub Pages project sites need `/phile-transfer-protocol/`. The workflow reads the actual path from `actions/configure-pages` and passes it to both the build and rendered-link checker. The site keeps `.html` URLs to avoid requiring extensionless rewrites.

`DOCS_URL` overrides the absolute documentation/download URL used in release manifests. The workflow sets it from the configured Pages URL. Without an override, release builds use `release.json.baseUrl`. If using a custom domain later, configure it in **Settings > Pages**; the workflow will pick up its origin and base path on the next build. Update the README, package homepages, `release.json`, and the desktop download allowlist together when changing the public URL.
