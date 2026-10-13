import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { HuduService } from '../services/hudu.service.js';
import { Logger } from '../utils/logger.js';
import { McpServerConfig } from '../types/mcp.js';
import { EnvironmentConfig, GatewayCredentials, shouldUseOAuthProxy } from '../utils/config.js';
import { HuduResourceHandler } from '../handlers/resource.handler.js';
import { HuduToolHandler } from '../handlers/tool.handler.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';
import { startOAuthStdioProxy, OAuthStdioProxy } from '../oauth/stdio-proxy.js';
import { proxyHttpMcpRequest } from '../oauth/http-proxy.js';

/**
 * Public example values. A copied placeholder must not verify as a real
 * secret. Matched case-insensitively after trim. Never log the value.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-real-secret',
  'your-s2s-secret',
  'your-secret',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'example',
  'replace-me',
  's2s-secret',
]);

const LOOPBACK_HOST = '127.0.0.1';

const MISSING_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. ' +
  'Set CONDUIT_S2S_SECRET to the gateway-provisioned secret (openssl rand -hex 32), ' +
  'or set MCP_ALLOW_INSECURE_DEV=1 for local development only.';

const PLACEHOLDER_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. ' +
  'Generate a secret with openssl rand -hex 32 and set CONDUIT_S2S_SECRET to that value.';

const INSECURE_DEV_WARNING =
  'SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. ' +
  'HTTP /mcp is not enforcing X-Gateway-S2S and is bound to 127.0.0.1 only. ' +
  'Do not use this outside local development.';

/** 127.0.0.0/8, localhost, ::1, and IPv4-mapped forms of those. */
function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.+)\]$/, '$1');
  if (normalized === 'localhost' || normalized === '::1') return true;
  const bare = normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;
  const parts = bare.split('.');
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  return parts[0] === '127';
}

function refuseHttpStart(logger: Logger, message: string): never {
  logger.error(message);
  process.exit(1);
}

/**
 * Secret for X-Gateway-S2S on /mcp. Read at HTTP startup, not per request.
 * Empty is fail-closed unless MCP_ALLOW_INSECURE_DEV=1. A known placeholder
 * always refuses to start, including when that flag is set. The secret
 * value is never written to logs.
 */
function resolveHttpS2sSecret(logger: Logger): { secret: string; insecureDev: boolean } {
  const raw = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (raw && KNOWN_PLACEHOLDER_SECRETS.has(raw.toLowerCase())) {
    refuseHttpStart(logger, PLACEHOLDER_S2S_SECRET_ERROR);
  }
  if (raw) return { secret: raw, insecureDev: false };
  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    logger.error(INSECURE_DEV_WARNING);
    return { secret: '', insecureDev: true };
  }
  refuseHttpStart(logger, MISSING_S2S_SECRET_ERROR);
}

/**
 * With a real secret, honor MCP_HTTP_HOST (default 127.0.0.1 when unset).
 * Without a secret the insecure-dev bypass forces 127.0.0.1, including when
 * MCP_HTTP_HOST is a wider address such as 0.0.0.0.
 */
function resolveBindHost(hasRealSecret: boolean, logger: Logger): string {
  const configured = (process.env.MCP_HTTP_HOST ?? '').trim();
  if (hasRealSecret) return configured || LOOPBACK_HOST;
  if (configured && !isLoopbackHost(configured)) {
    logger.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        'MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET forces the listener to 127.0.0.1 only.',
    );
  }
  return LOOPBACK_HOST;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class HuduMcpServer {
  private server: Server;
  private config: McpServerConfig;
  private huduService: HuduService;
  private resourceHandler: HuduResourceHandler;
  private toolHandler: HuduToolHandler;
  private logger: Logger;
  private envConfig: EnvironmentConfig | undefined;
  private httpServer?: HttpServer;
  private oauthStdioProxy?: OAuthStdioProxy;

  constructor(config: McpServerConfig, logger: Logger, envConfig?: EnvironmentConfig) {
    this.logger = logger;
    this.config = config;
    this.envConfig = envConfig;

    this.huduService = new HuduService(config, logger);
    this.resourceHandler = new HuduResourceHandler(this.huduService, logger);
    this.toolHandler = new HuduToolHandler(this.huduService, logger);

    // Create default server (used for stdio mode)
    this.server = this.createFreshServer();
  }

  /**
   * Create a fresh MCP Server with all handlers registered.
   * Called per-request in HTTP mode so each request gets a clean server.
   *
   * In gateway mode, per-request handlers are passed so each request is fully
   * isolated — no shared mutable state between concurrent requests.
   */
  private createFreshServer(
    perRequestToolHandler?: HuduToolHandler,
    perRequestResourceHandler?: HuduResourceHandler,
  ): Server {
    const server = new Server(
      { name: this.config.name, version: this.config.version },
      {
        capabilities: {
          resources: { subscribe: false, listChanged: true },
          tools: { listChanged: true }
        },
        instructions: this.getServerInstructions()
      }
    );

    server.onerror = (error) => this.logger.error('MCP Server error:', error);
    server.oninitialized = () => this.logger.info('MCP Server initialized and ready');

    this.setupHandlers(
      server,
      perRequestToolHandler ?? this.toolHandler,
      perRequestResourceHandler ?? this.resourceHandler,
    );
    return server;
  }

  /**
   * Build per-request service + handlers from gateway credentials.
   * Returns fully isolated instances that won't be affected by concurrent requests.
   */
  private buildPerRequestHandlers(credentials: GatewayCredentials): {
    toolHandler: HuduToolHandler;
    resourceHandler: HuduResourceHandler;
  } {
    const requestConfig: McpServerConfig = {
      ...this.config,
      hudu: {
        ...this.config.hudu,
        baseUrl: credentials.baseUrl!,
        apiKey: credentials.apiKey!,
      },
    };
    const service = new HuduService(requestConfig, this.logger);
    return {
      resourceHandler: new HuduResourceHandler(service, this.logger),
      toolHandler: new HuduToolHandler(service, this.logger),
    };
  }

  private setupHandlers(
    server: Server,
    toolHandler: HuduToolHandler,
    resourceHandler: HuduResourceHandler,
  ): void {
    this.logger.info('Setting up MCP request handlers...');

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resources = await resourceHandler.listResources();
        return { resources };
      } catch (error) {
        this.logger.error('Failed to list resources:', error);
        throw new McpError(ErrorCode.InternalError, `Failed to list resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const content = await resourceHandler.readResource(request.params.uri);
        return { contents: [content] };
      } catch (error) {
        this.logger.error(`Failed to read resource ${request.params.uri}:`, error);
        throw new McpError(ErrorCode.InternalError, `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = await toolHandler.listTools();
        return { tools };
      } catch (error) {
        this.logger.error('Failed to list tools:', error);
        throw new McpError(ErrorCode.InternalError, `Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const result = await toolHandler.callTool(request.params.name, request.params.arguments || {});
        return { content: result.content, isError: result.isError };
      } catch (error) {
        this.logger.error(`Failed to call tool ${request.params.name}:`, error);
        throw new McpError(ErrorCode.InternalError, `Failed to call tool: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    this.logger.info('MCP request handlers set up successfully');
  }

  async start(): Promise<void> {
    const transportType = this.envConfig?.transport?.type || 'stdio';
    this.logger.info(`Starting Hudu MCP Server with ${transportType} transport...`);

    if (transportType === 'http') {
      await this.startHttpTransport();
    } else {
      await this.startStdioTransport();
    }
  }

  private async startStdioTransport(): Promise<void> {
    // Only actually start the OAuth proxy once HUDU_BASE_URL is known — it's
    // required to discover the Hudu instance's MCP endpoint. A completely
    // unconfigured server (no HUDU_API_KEY *and* no HUDU_BASE_URL) still
    // auto-detects oauth mode, but falls through to the same graceful
    // degradation as api_key mode always had: the server starts, tools/list
    // still returns the local tool surface, and only an actual tool call
    // fails with a clear "missing credentials" error.
    if (shouldUseOAuthProxy(this.config.hudu)) {
      this.oauthStdioProxy = await startOAuthStdioProxy(this.config.hudu.baseUrl!, this.logger);
      return;
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Hudu MCP Server connected to stdio transport');
  }

  /**
   * Start with HTTP Streamable transport.
   * Stateless: each request gets a fresh Server + Transport so multiple
   * clients (via the gateway) never hit "Server already initialized".
   *
   * Fails closed (CWE-306): refuses to listen unless CONDUIT_S2S_SECRET is a
   * real secret. MCP_ALLOW_INSECURE_DEV=1 is the only bypass. It logs a
   * warning, does not enforce X-Gateway-S2S, and binds 127.0.0.1. A known
   * placeholder is rejected even with that flag. A real secret honors
   * MCP_HTTP_HOST. /health stays unauthenticated. stdio does not use S2S.
   */
  private async startHttpTransport(): Promise<void> {
    const configuredPort = this.envConfig?.transport?.port;
    // Port 0 is a real bind (ephemeral). `||` would turn it into 8080.
    const port = configuredPort === undefined || Number.isNaN(configuredPort) ? 8080 : configuredPort;
    const { secret: s2sSecret, insecureDev } = resolveHttpS2sSecret(this.logger);
    const host = resolveBindHost(!insecureDev, this.logger);
    const isGatewayMode = this.envConfig?.auth?.mode === 'gateway';

    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // Health endpoint — unauthenticated liveness. Must not read credentials.
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          transport: 'http',
          authMode: isGatewayMode ? 'gateway' : 'env',
          huduAuthMode: isGatewayMode ? 'api_key' : (this.config.hudu.mode ?? 'api_key'),
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // MCP endpoint — stateless: fresh server + transport per request
      if (url.pathname === '/mcp') {
        // Empty s2sSecret is only reachable when MCP_ALLOW_INSECURE_DEV=1.
        // A configured secret is always enforced, before credential extraction.
        const s2sHeader = headerValue(req.headers[S2S_HEADER]);
        if (s2sSecret && !verifyS2sHeader(s2sHeader, s2sSecret)) {
          this.logger.warn('Rejected request with missing/invalid gateway S2S header');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Unauthorized',
            message: 'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
          }));
          return;
        }

        // Only POST is supported in stateless mode
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed' },
            id: null,
          }));
          return;
        }

        // OAuth mode: reverse-proxy straight through to the Hudu instance's
        // own native MCP server rather than dispatching to HuduService/tool
        // handlers. Mutually exclusive with gateway mode (validated at
        // config load time in src/utils/config.ts). Only takes effect once
        // HUDU_BASE_URL is known — an unconfigured server (auto-detected
        // oauth mode, but no base URL set either) falls through below to the
        // same graceful degradation api_key mode has always had.
        if (!isGatewayMode && shouldUseOAuthProxy(this.config.hudu)) {
          proxyHttpMcpRequest(req, res, this.config.hudu.baseUrl!, this.logger).catch((error) => {
            this.logger.error('OAuth HTTP proxy failed:', error);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Failed to proxy request to Hudu MCP server' },
                id: null,
              }));
            }
          });
          return;
        }

        // In gateway mode, build per-request service + handlers from the
        // injected credential headers. Each request gets its own isolated
        // HuduService so concurrent requests for different tenants
        // never interfere with each other.
        let perRequestToolHandler: HuduToolHandler | undefined;
        let perRequestResourceHandler: HuduResourceHandler | undefined;
        if (isGatewayMode) {
          const credentials = this.extractGatewayCredentials(req);
          // Missing or blank headers are rejected here. Falling through would
          // use HUDU_BASE_URL / HUDU_API_KEY from the process, which is not
          // request-scoped.
          if (!credentials.baseUrl || !credentials.apiKey) {
            this.logger.warn('Gateway mode: Missing required credentials in headers', {
              hasBaseUrl: !!credentials.baseUrl,
              hasApiKey: !!credentials.apiKey,
            });
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Missing credentials',
              message: 'Gateway mode requires X-Hudu-Base-URL and X-Hudu-API-Key headers',
              required: ['X-Hudu-Base-URL', 'X-Hudu-API-Key']
            }));
            return;
          }
          const handlers = this.buildPerRequestHandlers(credentials);
          perRequestToolHandler = handlers.toolHandler;
          perRequestResourceHandler = handlers.resourceHandler;
        }

        // Stateless: create fresh server + transport for each request
        const server = this.createFreshServer(perRequestToolHandler, perRequestResourceHandler);
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
        });

        res.on('close', () => {
          transport.close();
          server.close();
        });

        server.connect(transport as unknown as Transport).then(() => {
          transport.handleRequest(req, res);
        }).catch((err) => {
          this.logger.error('MCP transport error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal error' },
              id: null,
            }));
          }
        });

        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, host, () => {
        const bound = this.httpServer!.address();
        const shownPort = bound && typeof bound !== 'string' ? bound.port : port;
        this.logger.info(`Hudu MCP Server listening on http://${host}:${shownPort}/mcp`);
        this.logger.info(`Health check available at http://${host}:${shownPort}/health`);
        this.logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (header-based)' : 'env (environment variables)'}`);
        if (!isGatewayMode) {
          this.logger.info(`Hudu auth mode: ${this.config.hudu.mode ?? 'api_key'}`);
        }
        resolve();
      });
    });
  }

  private extractGatewayCredentials(req: IncomingMessage): GatewayCredentials {
    return {
      baseUrl: headerValue(req.headers['x-hudu-base-url']),
      apiKey: headerValue(req.headers['x-hudu-api-key']),
    };
  }

  /** TCP address the HTTP transport bound, if it is listening. */
  boundAddress(): { address: string; port: number } | null {
    const address = this.httpServer?.address();
    if (!address || typeof address === 'string') return null;
    return { address: address.address, port: address.port };
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Hudu MCP Server...');
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => err ? reject(err) : resolve());
      });
    }
    if (this.oauthStdioProxy) {
      await this.oauthStdioProxy.close();
    }
    await this.server.close();
    this.logger.info('Hudu MCP Server stopped');
  }

  private getServerInstructions(): string {
    return `# Hudu MCP Server

This server provides access to Hudu IT documentation platform through the Model Context Protocol.

## Available Resources:
- **hudu://companies**, **hudu://companies/{id}** - Company data
- **hudu://assets**, **hudu://assets/{id}** - Asset data
- **hudu://articles**, **hudu://articles/{id}** - Knowledge base articles

## Available Tools (39 total):
- Companies: list, get, create, update, delete, archive, unarchive
- Assets: list, get, create, update, delete, archive
- Asset Layouts: list, get, create, update
- Asset Passwords: list, get, create, update, delete
- Articles: list, get, create, update, delete, archive
- Websites: list, get, create, update, delete
- Folders: list
- Procedures: list
- Activity Logs: list
- Relations: list
- Magic Dash: list
- Utility: test connection

## Authentication:
- HUDU_BASE_URL (required) - Your Hudu instance URL
- HUDU_API_KEY (required) - Your Hudu API key`;
  }
}
