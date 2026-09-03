import { McpServerConfig } from '../types/mcp.js';
import { LogLevel } from './logger.js';

export type TransportType = 'stdio' | 'http';
export type AuthMode = 'env' | 'gateway';

/**
 * How this server authenticates to Hudu itself:
 * - 'api_key': the classic HUDU_API_KEY REST-API mode (self-hosted/older Hudu).
 * - 'oauth': proxies to a newer Hudu instance's own native MCP server,
 *   authenticated via RFC 9728/8414 discovery + Dynamic Client Registration
 *   + PKCE authorization_code (see src/oauth/).
 */
export type HuduAuthMode = 'api_key' | 'oauth';

/**
 * Gateway credentials extracted from HTTP request headers.
 * The MCP Gateway injects credentials via these headers:
 * - X-Hudu-Base-URL: The user's Hudu instance URL
 * - X-Hudu-API-Key: The user's Hudu API key
 */
export interface GatewayCredentials {
  baseUrl: string | undefined;
  apiKey: string | undefined;
}

export interface EnvironmentConfig {
  hudu: {
    baseUrl?: string;
    apiKey?: string;
    /** Only meaningful when auth.mode === 'env'; gateway mode is always per-request API-key headers. */
    mode?: HuduAuthMode;
  };
  server: {
    name: string;
    version: string;
  };
  transport: {
    type: TransportType;
    port: number;
    host: string;
  };
  logging: {
    level: LogLevel;
    format: 'json' | 'simple';
  };
  auth: {
    mode: AuthMode;
  };
}

/**
 * Parse credentials from HTTP request headers (for per-request credential handling).
 * Node.js lowercases all incoming header names, so we read lowercase keys.
 */
export function parseCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): GatewayCredentials {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    baseUrl: getHeader('x-hudu-base-url'),
    apiKey: getHeader('x-hudu-api-key'),
  };
}

/**
 * Determines whether this server talks to Hudu via the classic API-key REST
 * client or by proxying to Hudu's own OAuth-protected native MCP server.
 *
 * - `HUDU_AUTH_MODE` explicitly set: always honored (validated to be one of
 *   the two known values).
 * - Otherwise, auto-detected from whether `HUDU_API_KEY` is set: existing
 *   deployments that already export `HUDU_API_KEY` keep working exactly as
 *   before (100% backward compatible), while a fresh install with no API
 *   key defaults to the OAuth flow newer Hudu instances expect.
 */
export function computeHuduAuthMode(env: NodeJS.ProcessEnv = process.env): HuduAuthMode {
  const explicit = env.HUDU_AUTH_MODE;
  if (explicit !== undefined) {
    if (explicit !== 'api_key' && explicit !== 'oauth') {
      throw new Error(`Invalid HUDU_AUTH_MODE value: "${explicit}". Must be "api_key" or "oauth".`);
    }
    return explicit;
  }
  return env.HUDU_API_KEY ? 'api_key' : 'oauth';
}

export function loadEnvironmentConfig(): EnvironmentConfig {
  const transportType = (process.env.MCP_TRANSPORT as TransportType) || 'stdio';
  if (transportType !== 'stdio' && transportType !== 'http') {
    throw new Error(`Invalid MCP_TRANSPORT value: "${transportType}". Must be "stdio" or "http".`);
  }

  const authMode = (process.env.AUTH_MODE as AuthMode) || 'env';

  const huduConfig: { baseUrl?: string; apiKey?: string; mode?: HuduAuthMode } = {};

  if (authMode === 'gateway') {
    // In gateway mode, credentials arrive per-request via HTTP headers
    // (always the classic API-key mode — there's no per-request browser to
    // run an interactive OAuth flow in). Env vars are not required at startup.
    if (process.env.HUDU_AUTH_MODE === 'oauth') {
      throw new Error(
        'HUDU_AUTH_MODE=oauth is incompatible with AUTH_MODE=gateway: gateway mode requires per-request X-Hudu-Base-URL/X-Hudu-API-Key headers, not an interactive browser authorization.',
      );
    }
  } else {
    huduConfig.baseUrl = process.env.HUDU_BASE_URL;
    huduConfig.apiKey = process.env.HUDU_API_KEY;
    huduConfig.mode = computeHuduAuthMode(process.env);
  }

  return {
    hudu: huduConfig,
    server: {
      name: process.env.MCP_SERVER_NAME || 'hudu-mcp',
      version: process.env.MCP_SERVER_VERSION || '1.0.0'
    },
    transport: {
      type: transportType,
      port: parseInt(process.env.MCP_HTTP_PORT || '8080', 10),
      host: process.env.MCP_HTTP_HOST || '0.0.0.0'
    },
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'simple'
    },
    auth: {
      mode: authMode
    }
  };
}

export function mergeWithMcpConfig(envConfig: EnvironmentConfig): McpServerConfig {
  return {
    name: envConfig.server.name,
    version: envConfig.server.version,
    hudu: {
      baseUrl: envConfig.hudu.baseUrl,
      apiKey: envConfig.hudu.apiKey,
      mode: envConfig.hudu.mode,
    }
  };
}
