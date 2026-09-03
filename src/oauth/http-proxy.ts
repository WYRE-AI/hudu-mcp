/**
 * OAuth-mode HTTP transport: reverse-proxies a single `/mcp` POST straight
 * through to the Hudu instance's own native MCP server, byte for byte.
 *
 * This mirrors the existing Node HTTP transport's stateless-per-request
 * design (see `HuduMcpServer.startHttpTransport`) — no session state is
 * held across requests here either, so a raw pass-through (including
 * streaming an `text/event-stream` response back untouched) is enough;
 * there's no JSON-RPC framing to parse on this leg.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '../utils/logger.js';
import { huduMcpUrl } from './discovery.js';
import { createAuthenticatedFetch } from './authenticated-fetch.js';

function forwardableRequestHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': (req.headers['content-type'] as string) || 'application/json',
    Accept: (req.headers['accept'] as string) || 'application/json, text/event-stream',
  };
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string') headers['Mcp-Session-Id'] = sessionId;
  const protocolVersion = req.headers['mcp-protocol-version'];
  if (typeof protocolVersion === 'string') headers['MCP-Protocol-Version'] = protocolVersion;
  return headers;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function proxyHttpMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  baseUrl: string,
  logger: Logger,
): Promise<void> {
  const body = await readRequestBody(req);
  const authenticatedFetch = createAuthenticatedFetch(baseUrl, logger);

  let upstream: Response;
  try {
    upstream = await authenticatedFetch(huduMcpUrl(baseUrl), {
      method: 'POST',
      headers: forwardableRequestHeaders(req),
      body,
    });
  } catch (error) {
    logger.error('Failed to reach Hudu native MCP server:', error);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Failed to reach Hudu native MCP server' },
        id: null,
      }),
    );
    return;
  }

  const responseHeaders: Record<string, string> = {};
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders['Content-Type'] = contentType;
  const upstreamSessionId = upstream.headers.get('mcp-session-id');
  if (upstreamSessionId) responseHeaders['Mcp-Session-Id'] = upstreamSessionId;

  res.writeHead(upstream.status, responseHeaders);

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
