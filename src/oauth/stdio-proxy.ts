/**
 * OAuth-mode stdio transport: a thin, transport-to-transport pipe between
 * the local MCP client (Claude Desktop, etc., over stdio) and the Hudu
 * instance's own native MCP server (over Streamable HTTP).
 *
 * Deliberately does not run an SDK `Server`/`Client` on either side — the
 * Hudu MCP tool surface is proxied through as-is, not reimplemented, so raw
 * JSON-RPC messages are relayed unmodified in both directions. Session
 * bookkeeping and SSE parsing for the HTTP leg are handled by the SDK's own
 * `StreamableHTTPClientTransport`; `createAuthenticatedFetch` layers the
 * Hudu bearer token (and 401 refresh-and-retry) underneath it.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Logger } from '../utils/logger.js';
import { huduMcpUrl } from './discovery.js';
import { createAuthenticatedFetch } from './authenticated-fetch.js';

export async function startOAuthStdioProxy(baseUrl: string, logger: Logger): Promise<void> {
  const local = new StdioServerTransport();
  const remote = new StreamableHTTPClientTransport(new URL(huduMcpUrl(baseUrl)), {
    fetch: createAuthenticatedFetch(baseUrl, logger),
  });

  local.onmessage = (message) => {
    remote.send(message).catch((error) => logger.error('Failed to forward message to Hudu MCP server:', error));
  };
  remote.onmessage = (message) => {
    local.send(message).catch((error) => logger.error('Failed to relay Hudu MCP response over stdio:', error));
  };

  local.onerror = (error) => logger.error('stdio transport error:', error);
  remote.onerror = (error) => logger.error('Hudu MCP HTTP transport error:', error);

  local.onclose = () => {
    remote.close().catch(() => {});
  };
  remote.onclose = () => {
    local.close().catch(() => {});
  };

  await remote.start();
  await local.start();
  logger.info('Hudu MCP OAuth proxy connected (stdio <-> Hudu native MCP over HTTP)', { baseUrl });
}
