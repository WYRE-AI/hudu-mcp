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
| `MCP_HTTP_PORT` | No | `8080` | HTTP server port (when using `http` transport) |
| `MCP_HTTP_HOST` | No | `0.0.0.0` | HTTP server host |
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

  Because this flow needs a browser and a local callback port, it applies to the
  `stdio` and self-hosted `http` transports — not to gateway mode (`AUTH_MODE=gateway`),
  which is a stateless multi-tenant proxy with credentials injected per request
  via headers and has no single user to run a browser flow for. Setting
  `HUDU_AUTH_MODE=oauth` together with `AUTH_MODE=gateway` is a startup error.

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

```bash
HUDU_BASE_URL=https://docs.example.com \
HUDU_API_KEY=your-api-key \
MCP_TRANSPORT=http \
MCP_HTTP_PORT=8080 \
npm start
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
