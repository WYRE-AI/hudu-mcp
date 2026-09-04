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

// MCP tool calls/responses are small JSON payloads in practice; this is
// generous headroom, not a tuned limit. Enforced regardless of
// Content-Length (which a client can omit or lie about) so a request
// can't force unbounded buffering in memory.
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new RequestBodyTooLargeError(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} byte limit`);
    }
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
  let body: Buffer;
  try {
    body = await readRequestBody(req);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      req.destroy();
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Request body too large' },
          id: null,
        }),
      );
      return;
    }
    throw error;
  }
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
  let clientDisconnected = false;
  const onClientClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  };
  res.on('close', onClientClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || clientDisconnected) break;
      // res.write() buffers internally and returns false once past its
      // highWaterMark — without waiting for 'drain' here, a slow client
      // lets us keep pumping upstream data into that buffer unbounded.
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
  } finally {
    res.off('close', onClientClose);
    res.end();
  }
}
