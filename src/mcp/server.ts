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
import { EnvironmentConfig, GatewayCredentials, parseCredentialsFromHeaders } from '../utils/config.js';
import { HuduResourceHandler } from '../handlers/resource.handler.js';
import { HuduToolHandler } from '../handlers/tool.handler.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';
import { startOAuthStdioProxy } from '../oauth/stdio-proxy.js';
import { proxyHttpMcpRequest } from '../oauth/http-proxy.js';

export class HuduMcpServer {
  private server: Server;
  private config: McpServerConfig;
  private huduService: HuduService;
  private resourceHandler: HuduResourceHandler;
  private toolHandler: HuduToolHandler;
  private logger: Logger;
  private envConfig: EnvironmentConfig | undefined;
  private httpServer?: HttpServer;

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
    if (this.config.hudu.mode === 'oauth') {
      if (!this.config.hudu.baseUrl) {
        throw new Error('HUDU_AUTH_MODE=oauth requires HUDU_BASE_URL to be set.');
      }
      await startOAuthStdioProxy(this.config.hudu.baseUrl, this.logger);
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
   */
  private async startHttpTransport(): Promise<void> {
    const port = this.envConfig?.transport?.port || 8080;
    const host = this.envConfig?.transport?.host || '0.0.0.0';
    const isGatewayMode = this.envConfig?.auth?.mode === 'gateway';

    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // Health endpoint — no auth required
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
        // Gateway S2S verification (gateway#377 parity). Runs before any
        // credential extraction — see src/mcp/s2s-verify.ts. Empty secret
        // means S2S enforcement isn't provisioned for this vendor yet, so
        // we don't call verifyS2sHeader at all (dark-by-default).
        const s2sSecret = process.env.CONDUIT_S2S_SECRET || '';
        if (s2sSecret) {
          const s2sHeader = req.headers[S2S_HEADER] as string | undefined;
          if (!verifyS2sHeader(s2sHeader, s2sSecret)) {
            this.logger.warn('Rejected request with missing/invalid gateway S2S header');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Unauthorized',
              message: 'Missing or invalid gateway S2S authentication header',
            }));
            return;
          }
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
        // config load time in src/utils/config.ts).
        if (!isGatewayMode && this.config.hudu.mode === 'oauth') {
          if (!this.config.hudu.baseUrl) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'HUDU_AUTH_MODE=oauth requires HUDU_BASE_URL to be set' },
              id: null,
            }));
            return;
          }
          proxyHttpMcpRequest(req, res, this.config.hudu.baseUrl, this.logger).catch((error) => {
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
        this.logger.info(`Hudu MCP Server listening on http://${host}:${port}/mcp`);
        this.logger.info(`Health check available at http://${host}:${port}/health`);
        this.logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (header-based)' : 'env (environment variables)'}`);
        if (!isGatewayMode) {
          this.logger.info(`Hudu auth mode: ${this.config.hudu.mode ?? 'api_key'}`);
        }
        resolve();
      });
    });
  }

  private extractGatewayCredentials(req: IncomingMessage): GatewayCredentials {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    return parseCredentialsFromHeaders(headers);
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Hudu MCP Server...');
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => err ? reject(err) : resolve());
      });
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
