# hudu-mcp

[![CI](https://github.com/WYRE-AI/hudu-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/WYRE-AI/hudu-mcp/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

MCP (Model Context Protocol) server for [Hudu](https://www.huduapp.com/) IT documentation platform. Provides 39 tools and 6 resources for managing companies, assets, articles, passwords, websites, and more through any MCP-compatible client.

## Features

- **39 MCP tools** covering all major Hudu resources
- **6 MCP resources** for direct data access
- **Dual auth mode**: classic `HUDU_API_KEY` REST access, or `oauth` — a thin,
  authenticated proxy to a newer Hudu instance's own native MCP server
- **Dual transport** support: stdio (default) and HTTP Streamable
- **Lazy initialization** - SDK client created on first tool call
- **Connection testing** built-in
- **All logging to stderr** to avoid polluting MCP stdio transport

## One-Click Deployment

> [!IMPORTANT]
> **Before you click:** this server depends on `@wyre-technology/node-hudu`,
> which is hosted on the **GitHub Packages** npm registry. GitHub Packages has no
> anonymous access — even though the package is public, every `npm install` needs a
> token. The cloud builder runs `npm install` for you, so you must give it one, or
> the build fails with `npm error 401 Unauthorized ... npm.pkg.github.com`.
>
> 1. Create a GitHub **Personal Access Token** with the `read:packages` scope
>    ([classic token](https://github.com/settings/tokens/new?scopes=read:packages&description=hudu-mcp%20deploy)).
>    Any GitHub account works — you do **not** need to be a member of the
>    `wyre-technology` org to read its public packages.
> 2. Add it as a build variable when prompted by the deploy flow:
>    - **DigitalOcean App Platform** → set an encrypted env var named **`NODE_AUTH_TOKEN`**
>      with scope **Build Time** to your PAT (the `Dockerfile` reads it via
>      `ARG NODE_AUTH_TOKEN` to authenticate `npm ci`).
>    - **Cloudflare Workers** → set a build variable named **`NODE_AUTH_TOKEN`** to your PAT
>      (Workers → Settings → Build → Variables and Secrets).

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/WYRE-AI/hudu-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WYRE-AI/hudu-mcp)

> [!NOTE]
> The DigitalOcean target builds the full Docker image and runs the complete MCP
> server over HTTP — this is the recommended path for operators. This repo does not
> ship a `wrangler.json`/Workers entrypoint, so for a self-hosted server prefer
> DigitalOcean or the prebuilt container image (`ghcr.io/wyre-ai/hudu-mcp`).

## Installation

This project depends on `@wyre-technology/node-hudu`, published to the **GitHub
Packages** npm registry, which requires a token even for public packages.
Authenticate npm once before installing:

```bash
git clone https://github.com/WYRE-AI/hudu-mcp.git
cd hudu-mcp

# Authenticate npm to GitHub Packages (token needs the read:packages scope)
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages

npm install
npm run build
```

The repo's `.npmrc` already points the `@wyre-technology` scope at GitHub Packages and
reads the token from `NODE_AUTH_TOKEN`, so no further config is needed.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `HUDU_BASE_URL` | Yes | - | Your Hudu instance URL (e.g., `https://docs.example.com`) |
| `HUDU_API_KEY` | No | - | Your Hudu API key. Setting this selects **api_key** auth mode (see below); omitting it defaults to **oauth** mode. |
| `HUDU_AUTH_MODE` | No | auto-detected | Explicitly force `api_key` or `oauth`. Overrides the auto-detection below. |
| `MCP_TRANSPORT` | No | `stdio` | Transport type: `stdio` or `http` |
| `AUTH_MODE` | No | `env` | `env` reads `HUDU_*` from the environment. `gateway` requires `X-Hudu-Base-URL` and `X-Hudu-API-Key` on each `/mcp` request and does not fall back to those variables. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | - | Service-to-service secret. HTTP logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `secret`, `replace-me`, `your-s2s-secret`, and the other example values). Generate one with `openssl rand -hex 32`. Never commit a real value. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | No | - | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` is ignored and the override is logged. A known placeholder secret still refuses to start. |
| `MCP_HTTP_PORT` | No | `8080` | HTTP server port (when using `http` transport) |
| `MCP_HTTP_HOST` | No | `127.0.0.1` | Bind address when a real `CONDUIT_S2S_SECRET` is set. The container image sets `0.0.0.0`. Without a real secret the listener is forced to `127.0.0.1`. |
| `MCP_SERVER_NAME` | No | `hudu-mcp` | Server name reported to MCP clients |
| `MCP_SERVER_VERSION` | No | `1.0.0` | Server version reported to MCP clients |
| `LOG_LEVEL` | No | `info` | Log level: `error`, `warn`, `info`, `debug` |
| `LOG_FORMAT` | No | `simple` | Log format: `json` or `simple` |

### Authentication modes

This server talks to Hudu in one of two ways. **`HUDU_AUTH_MODE`** picks between
them; if it's unset, the mode is **auto-detected** from whether `HUDU_API_KEY`
is set:

- **`api_key`** (auto-selected when `HUDU_API_KEY` is set) — the classic mode.
  This server calls Hudu's REST API directly via `@wyre-technology/node-hudu` and
  implements all 39 tools itself, exactly as before. This is the mode every
  existing deployment already uses, and it is 100% unchanged and unaffected by
  everything below.

- **`oauth`** (auto-selected when `HUDU_API_KEY` is **not** set) — for newer Hudu
  instances that expose their own native MCP server (Hudu Admin -> External Apps
  -> MCP), protected by interactive OAuth rather than a static API key. In this
  mode `hudu-mcp` does not reimplement any tools; it acts as a thin, authenticated
  proxy that forwards MCP requests straight through to `{HUDU_BASE_URL}/mcp` and
  relays the responses back, so you automatically get whatever tool surface that
  Hudu instance exposes.

  The OAuth flow (RFC 9728/8414 discovery, RFC 7591 Dynamic Client Registration,
  PKCE `authorization_code`, no client secret — this is a public client) runs the
  first time a request needs a token:

  1. `hudu-mcp` discovers the instance's OAuth metadata from
     `{HUDU_BASE_URL}/.well-known/oauth-protected-resource/mcp` and
     `{HUDU_BASE_URL}/.well-known/oauth-authorization-server`.
  2. It registers itself as a public OAuth client via Dynamic Client
     Registration (once per Hudu instance — the issued `client_id` is cached).
  3. It prints an authorization URL to **stderr**. Open it in a browser and
     approve access.
  4. A short-lived local server on `http://127.0.0.1:<ephemeral-port>/callback`
     catches the redirect and exchanges the code for tokens.
  5. Tokens are cached at `~/.hudu-mcp/credentials-<hash-of-base-url>.json`
     (file mode `0600`), and transparently refreshed on later runs — you should
     only see the browser prompt again if the refresh token itself expires or
     is revoked.

  Because this flow needs a browser that can reach a callback server bound to
  `127.0.0.1` on the machine running `hudu-mcp`, it works for `stdio` (always
  local to the calling MCP client) and for a self-hosted `http` transport
  **running on the same machine you're browsing from** — e.g. local testing on
  `localhost:8080`. It does not work for an `http` transport deployed to a
  remote host you don't have browser-level access to (a cloud VM, a
  container, etc.): your browser can't reach that machine's own loopback
  interface to complete the redirect, so the first-run authorization would
  hang. This is unrelated to gateway mode (`AUTH_MODE=gateway`), which is a
  stateless multi-tenant proxy with credentials injected per request via
  headers and has no single user to run a browser flow for at all — setting
  `HUDU_AUTH_MODE=oauth` together with `AUTH_MODE=gateway` is a startup error.

  HTTP transport (both `api_key` and `oauth`) also requires `CONDUIT_S2S_SECRET`
  or `MCP_ALLOW_INSECURE_DEV=1`. The dev flag binds `127.0.0.1` only. See
  [HTTP authentication](#http-authentication). The stdio transport does not
  use `CONDUIT_S2S_SECRET`.

## Usage

### Claude Desktop (stdio)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hudu": {
      "command": "node",
      "args": ["/path/to/hudu-mcp/dist/entry.js"],
      "env": {
        "HUDU_BASE_URL": "https://docs.example.com",
        "HUDU_API_KEY": "your-api-key"
      }
    }
  }
}
```

For a newer Hudu instance with its own native MCP server (see
[Authentication modes](#authentication-modes)), omit `HUDU_API_KEY` and only set
`HUDU_BASE_URL` — `hudu-mcp` will print an authorization URL to the terminal the
first time it's launched:

```json
{
  "mcpServers": {
    "hudu": {
      "command": "node",
      "args": ["/path/to/hudu-mcp/dist/entry.js"],
      "env": {
        "HUDU_BASE_URL": "https://docs.example.com"
      }
    }
  }
}
```

### HTTP Transport

`/health` stays unauthenticated and does not read credentials.

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
HUDU_BASE_URL=https://docs.example.com \
HUDU_API_KEY=your-api-key \
MCP_TRANSPORT=http \
MCP_HTTP_PORT=8080 \
npm start
```

Local HTTP without a service-to-service secret is development-only. It binds `127.0.0.1` and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm start
```

#### HTTP authentication

With `MCP_TRANSPORT=http` and a real `CONDUIT_S2S_SECRET`, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/mcp/s2s-verify.ts`](src/mcp/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header is HTTP 401, before Hudu credentials are read.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H "X-Hudu-Base-URL: $HUDU_BASE_URL" \
  -H "X-Hudu-API-Key: $HUDU_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Hudu-Base-URL` and `X-Hudu-API-Key`. Those headers are the only credential source for that request. A missing header is HTTP 401 and does not fall back to `HUDU_BASE_URL` or `HUDU_API_KEY` in the environment.

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset. The gateway service sets `AUTH_MODE=gateway`, does not inject `HUDU_BASE_URL` or `HUDU_API_KEY`, and publishes `127.0.0.1:8080:8080`:

```bash
CONDUIT_S2S_SECRET=your-s2s-secret docker compose up
```

The image listens on `0.0.0.0` inside the container and still refuses to start without a real secret. Publish the port on loopback:

```bash
docker run \
  -e CONDUIT_S2S_SECRET=your-s2s-secret \
  -e AUTH_MODE=gateway \
  -p 127.0.0.1:8080:8080 \
  ghcr.io/wyre-ai/hudu-mcp
```

## Tools (39)

### Companies (8 tools)

| Tool | Description |
|---|---|
| `hudu_list_companies` | List companies with optional filters |
| `hudu_get_company` | Get a company by ID |
| `hudu_create_company` | Create a new company |
| `hudu_update_company` | Update an existing company |
| `hudu_delete_company` | Delete a company |
| `hudu_archive_company` | Archive a company |
| `hudu_unarchive_company` | Unarchive a company |
| `hudu_test_connection` | Test the connection to Hudu API |

### Assets (6 tools)

| Tool | Description |
|---|---|
| `hudu_list_assets` | List assets with optional filters |
| `hudu_get_asset` | Get an asset by ID |
| `hudu_create_asset` | Create a new asset |
| `hudu_update_asset` | Update an existing asset |
| `hudu_delete_asset` | Delete an asset |
| `hudu_archive_asset` | Archive an asset |

### Asset Layouts (4 tools)

| Tool | Description |
|---|---|
| `hudu_list_asset_layouts` | List asset layouts |
| `hudu_get_asset_layout` | Get an asset layout by ID |
| `hudu_create_asset_layout` | Create a new asset layout |
| `hudu_update_asset_layout` | Update an existing asset layout |

### Asset Passwords (5 tools)

| Tool | Description |
|---|---|
| `hudu_list_asset_passwords` | List asset passwords |
| `hudu_get_asset_password` | Get an asset password by ID |
| `hudu_create_asset_password` | Create a new asset password |
| `hudu_update_asset_password` | Update an existing asset password |
| `hudu_delete_asset_password` | Delete an asset password |

### Articles (6 tools)

| Tool | Description |
|---|---|
| `hudu_list_articles` | List knowledge base articles |
| `hudu_get_article` | Get an article by ID |
| `hudu_create_article` | Create a new article |
| `hudu_update_article` | Update an existing article |
| `hudu_delete_article` | Delete an article |
| `hudu_archive_article` | Archive an article |

### Websites (5 tools)

| Tool | Description |
|---|---|
| `hudu_list_websites` | List monitored websites |
| `hudu_get_website` | Get a website by ID |
| `hudu_create_website` | Create a new website |
| `hudu_update_website` | Update an existing website |
| `hudu_delete_website` | Delete a website |

### Other Resources (5 tools)

| Tool | Description |
|---|---|
| `hudu_list_folders` | List folders |
| `hudu_list_procedures` | List procedures |
| `hudu_list_activity_logs` | List activity logs |
| `hudu_list_relations` | List relations |
| `hudu_list_magic_dash` | List Magic Dash items |

## Resources

| URI | Description |
|---|---|
| `hudu://companies` | List of all companies |
| `hudu://companies/{id}` | Company details by ID |
| `hudu://assets` | List of all assets |
| `hudu://assets/{id}` | Asset details by ID |
| `hudu://articles` | List of all articles |
| `hudu://articles/{id}` | Article details by ID |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Clean build output
npm run clean
```

## License

[Apache-2.0](LICENSE)
