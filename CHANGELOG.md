## [Unreleased]

### Added

- **Test coverage:** handler-invocation tests for `HuduToolHandler` (all 39
  registered tools) and `HuduResourceHandler`, plus lifecycle tests for
  `HuduService` (missing-credential guard, lazy client construction,
  `updateCredentials`, `testConnection`). Previously, coverage stopped at the
  MCP transport/tool-surface layer (`tools/list`, a single `tools/call` smoke
  test) — no test invoked an individual tool handler against a mocked Hudu
  API client, so per-domain request shaping (e.g. splitting `id` out of an
  update body, stripping a stray `id` on create) and response mapping were
  unverified. The underlying `@wyre-technology/node-hudu` client is now
  mocked at the module boundary so each handler runs for real against it.

### Changed

- **npm package:** the package is now scoped to `@wyre-technology/hudu-mcp` and is
  published to the **GitHub Packages** npm registry (`https://npm.pkg.github.com`)
  on each release. The previous unscoped name (`hudu-mcp`) was never published. The
  `hudu-mcp` CLI/bin command name is unchanged.

### Fixed

- **`hudu_test_connection` error reporting:** the tool now surfaces the real
  error from the Hudu API (e.g. `Authentication failed - invalid API key`,
  a DNS/network failure, or a malformed URL) instead of collapsing every
  failure into a generic "check HUDU_BASE_URL and HUDU_API_KEY" message.
  `HuduService.testConnection()` previously caught and discarded the
  underlying error, returning a bare boolean, which made it impossible to
  tell an auth failure from a bad base URL or a network problem — reported by
  a community user unable to determine which of a re-generated Hudu API key
  or their `*.huducloud.com` base URL (tried with and without the `https://`
  scheme) was the actual problem.
- **Deploy buttons:** one-click "Deploy to Cloudflare Workers" and "Deploy to
  DigitalOcean" builds no longer fail with `npm error 401 Unauthorized` from
  `npm.pkg.github.com`. The `.npmrc` now reads a `read:packages` token from
  `NODE_AUTH_TOKEN`, and the README documents how operators supply their own
  GitHub PAT as a build-time variable for each target.

## [1.1.8](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.7...v1.1.8) (2026-02-26)


### Bug Fixes

* **ci:** remove unused discord-release.yml ([78ea883](https://github.com/wyre-technology/hudu-mcp/commit/78ea8833f7582fd272b46550f6130cd7687b0930))

## [1.1.7](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.6...v1.1.7) (2026-02-24)


### Bug Fixes

* **deps:** update node-hudu SDK to fix response body double-read ([4f6b679](https://github.com/wyre-technology/hudu-mcp/commit/4f6b679707301e435a8ddbbbe8ff0a98dbb131b7))

## [1.1.6](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.5...v1.1.6) (2026-02-24)


### Bug Fixes

* use per-request Server+Transport for stateless HTTP mode ([c0193d4](https://github.com/wyre-technology/hudu-mcp/commit/c0193d45f6f3753d8cb5815843e402643fefbd81))

## [1.1.5](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.4...v1.1.5) (2026-02-24)


### Bug Fixes

* use stateless HTTP transport for multi-client gateway support ([d73a635](https://github.com/wyre-technology/hudu-mcp/commit/d73a63558a017ad8a61a1232dff3e701654bdaf8))

## [1.1.4](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.3...v1.1.4) (2026-02-24)


### Bug Fixes

* update node-hudu to 1.0.1 with corrected exports map ([da657e0](https://github.com/wyre-technology/hudu-mcp/commit/da657e06a851e82f6029549c52bf4ba388144f92))

## [1.1.3](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.2...v1.1.3) (2026-02-24)


### Bug Fixes

* **docker:** prune dev deps in builder stage to preserve GitHub Packages deps ([7ee202b](https://github.com/wyre-technology/hudu-mcp/commit/7ee202bb65b1410d203b067f6d47b6c3caafa551))

## [1.1.2](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.1...v1.1.2) (2026-02-24)


### Performance Improvements

* **docker:** remove npm upgrade to speed up multi-platform builds ([cdc882f](https://github.com/wyre-technology/hudu-mcp/commit/cdc882fc554765d174deb632115057212709c9e5))

## [1.1.1](https://github.com/wyre-technology/hudu-mcp/compare/v1.1.0...v1.1.1) (2026-02-24)


### Bug Fixes

* **docker:** add NODE_AUTH_TOKEN for GitHub Packages auth in Docker build ([742e371](https://github.com/wyre-technology/hudu-mcp/commit/742e371b315436faa22fd95a38fb8c64e8027fc9))

# [1.1.0](https://github.com/wyre-technology/hudu-mcp/compare/v1.0.0...v1.1.0) (2026-02-24)


### Features

* add gateway authentication mode and Dockerfile ([5111615](https://github.com/wyre-technology/hudu-mcp/commit/511161537e02773166b49b8ee639439c8398f9a8))

# 1.0.0 (2026-02-24)


### Bug Fixes

* add semantic-release branch configuration ([0ba664a](https://github.com/wyre-technology/hudu-mcp/commit/0ba664ad48ef42f1c2abd2b066a3f25ae9df4912))


### Features

* initial hudu-mcp server with 39 tools ([9951ad6](https://github.com/wyre-technology/hudu-mcp/commit/9951ad606c5f7a35c76bcb38b3c3af2f341f349f))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Gateway authentication mode (`AUTH_MODE=gateway`) for MCP Gateway integration at mcp.wyretechnology.com
- Per-request credential extraction from `X-Hudu-Base-URL` and `X-Hudu-API-Key` HTTP headers
- `parseCredentialsFromHeaders()` utility for header-based credential parsing
- `HuduService.updateCredentials()` method for runtime client reinitialization
- Dockerfile with multi-stage build (node:22-alpine), non-root `hudu` user, and health check
- Docker build and push job in CI workflow (GHCR, multi-platform linux/amd64 + linux/arm64)
- Auth mode reporting in `/health` endpoint response

## [1.0.0] - 2026-02-23

### Added

- Initial release of Hudu MCP server
- 39 tools covering Companies, Assets, Asset Layouts, Asset Passwords, Articles, Websites, Folders, Procedures, Activity Logs, Relations, and Magic Dash
- MCP resources for companies, assets, and articles
- Dual transport support: stdio (default) and HTTP Streamable
- Lazy SDK initialization on first tool call
- Winston logger with all output to stderr
- Connection test tool
