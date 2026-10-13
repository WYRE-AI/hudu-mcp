/**
 * HTTP transport fail-closed auth (CWE-306).
 *
 * Startup requires a real CONDUIT_S2S_SECRET. Empty and known placeholders
 * refuse to listen. MCP_ALLOW_INSECURE_DEV=1 is the empty-secret bypass: it
 * forces the listener onto 127.0.0.1, including when MCP_HTTP_HOST is wider.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit vendor credential headers
 * and must not fall back to HUDU_* in process.env.
 */

import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => [] as Array<{ baseUrl?: string; apiKey?: string }>);

vi.mock('../../services/hudu.service.js', () => {
  class HuduService {
    constructor(config: { hudu?: { baseUrl?: string; apiKey?: string } }) {
      constructed.push({
        baseUrl: config.hudu?.baseUrl,
        apiKey: config.hudu?.apiKey,
      });
    }
  }
  return { HuduService };
});

import { HuduMcpServer } from '../server.js';
import { Logger } from '../../utils/logger.js';
import { loadEnvironmentConfig, mergeWithMcpConfig } from '../../utils/config.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_BASE_URL = 'https://env.example.test';
const ENV_API_KEY = 'env-api-key-must-not-be-used';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'HUDU_BASE_URL',
  'HUDU_API_KEY',
  'HUDU_AUTH_MODE',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: HuduMcpServer[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  // Winston writes error/warn/info to console._stderr, which is not always
  // the same stream object as process.stderr under the test runner.
  const stream = (console as { _stderr?: NodeJS.WriteStream })._stderr ?? process.stderr;
  const spy = vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => {
    if (typeof chunk === 'string') lines.push(chunk);
    else if (Buffer.isBuffer(chunk)) lines.push(chunk.toString('utf8'));
    else lines.push(String(chunk));
    return true;
  });
  return {
    text: () => lines.join(''),
    restore: () => spy.mockRestore(),
  };
}

function exitSpy() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
}

interface HttpResult {
  status: number;
  body: string;
}

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function listen(): Promise<{ port: number; address: string }> {
  const envConfig = loadEnvironmentConfig();
  const server = new HuduMcpServer(mergeWithMcpConfig(envConfig), new Logger('info', 'simple'), envConfig);
  servers.push(server);
  await server.start();
  const bound = server.boundAddress();
  if (!bound) throw new Error('HTTP server did not bind a TCP port');
  return bound;
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const toolsList = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
});

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    try {
      await server.stop();
    } catch {
      // already closed
    }
  }
});

beforeEach(() => {
  constructed.length = 0;
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'info';
  process.env.MCP_TRANSPORT = 'http';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.HUDU_BASE_URL;
  delete process.env.HUDU_API_KEY;
  delete process.env.HUDU_AUTH_MODE;
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', async () => {
    const logs = captureStderr();
    const exit = exitSpy();
    try {
      await expect(listen()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const text = logs.text();
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    const logs = captureStderr();
    const exit = exitSpy();
    try {
      await expect(listen()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('Refusing to start HTTP transport');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['changeme', 'replace-with-a-real-secret', '  Your-S2S-Secret  '])(
    'refuses known placeholder %j even when MCP_ALLOW_INSECURE_DEV=1',
    async (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = '0.0.0.0';
      const logs = captureStderr();
      const exit = exitSpy();
      try {
        await expect(listen()).rejects.toThrow('process.exit:1');
        expect(exit).toHaveBeenCalledWith(1);
        const text = logs.text();
        expect(text).toContain('known placeholder');
        expect(text).toContain('openssl rand -hex 32');
        expect(text).not.toContain(placeholder.trim());
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        exit.mockRestore();
        logs.restore();
      }
    },
  );

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    delete process.env.MCP_HTTP_HOST;
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it.each(['0.0.0.0', '10.1.2.3'])(
    'forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is %s',
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      try {
        const server = await listen();
        expect(server.address).toBe('127.0.0.1');
        const text = logs.text();
        expect(text).toContain(`MCP_HTTP_HOST=${host} is not a loopback address`);
        expect(text).toContain('forces the listener to 127.0.0.1 only');
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        logs.restore();
      }
    },
  );

  it('forces 127.0.0.1 when the dev bypass host is localhost', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).toContain('SECURITY WARNING');
      expect(logs.text()).not.toContain('is not a loopback address');
    } finally {
      logs.restore();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('is not a loopback address');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    delete process.env.MCP_HTTP_HOST;
    const server = await listen();
    expect(server.address).toBe('127.0.0.1');
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.HUDU_BASE_URL = ENV_BASE_URL;
    process.env.HUDU_API_KEY = ENV_API_KEY;
    process.env.MCP_HTTP_HOST = '127.0.0.1';
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    try {
      const server = await listen();
      const missing = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-hudu-base-url': 'https://header.example.test',
          'x-hudu-api-key': 'header-api-key',
        }),
        body: toolsList,
      });
      const invalid = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader('wrong-secret'),
          'x-hudu-base-url': 'https://header.example.test',
          'x-hudu-api-key': 'header-api-key',
        }),
        body: toolsList,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(missing.body).toContain('X-Gateway-S2S');
      expect(invalid.body).toContain('X-Gateway-S2S');
      expect(missing.body).not.toContain(S2S_SECRET);
      expect(invalid.body).not.toContain(S2S_SECRET);
      expect(missing.body).not.toContain(ENV_API_KEY);
      expect(invalid.body).not.toContain(ENV_BASE_URL);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(constructed.some((entry) => entry.apiKey === 'header-api-key')).toBe(false);
      expect(constructed.some((entry) => entry.apiKey === ENV_API_KEY)).toBe(false);
    } finally {
      logs.restore();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: toolsList,
    });
    const partial = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-hudu-base-url': 'https://header.example.test',
        'x-hudu-api-key': '   ',
      }),
      body: toolsList,
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain('Missing credentials');
    expect(response.body).toContain('X-Hudu-Base-URL');
    expect(response.body).toContain('X-Hudu-API-Key');
    expect(response.body).not.toContain(ENV_API_KEY);
    expect(response.body).not.toContain(ENV_BASE_URL);
    expect(response.body).not.toContain(S2S_SECRET);
    expect(partial.status).toBe(401);
    expect(constructed.some((entry) => entry.apiKey === ENV_API_KEY)).toBe(false);
    expect(constructed.some((entry) => entry.baseUrl === ENV_BASE_URL)).toBe(false);
    expect(constructed.some((entry) => entry.apiKey === 'header-api-key')).toBe(false);
  });

  it('accepts a valid S2S header plus credential headers and uses those credentials', async () => {
    const logs = captureStderr();
    try {
      const server = await listen();
      const response = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-hudu-base-url': 'https://header.example.test',
          'x-hudu-api-key': 'header-api-key',
        }),
        body: toolsList,
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain('hudu_list_companies');
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_API_KEY);
      expect(response.body).not.toContain(ENV_BASE_URL);
      expect(constructed).toContainEqual({
        baseUrl: 'https://header.example.test',
        apiKey: 'header-api-key',
      });
      expect(constructed.some((entry) => entry.apiKey === ENV_API_KEY)).toBe(false);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(logs.text()).not.toContain(ENV_API_KEY);
    } finally {
      logs.restore();
    }
  });

  it('does not require vendor credential headers in env mode after S2S auth', async () => {
    process.env.AUTH_MODE = 'env';
    delete process.env.HUDU_BASE_URL;
    delete process.env.HUDU_API_KEY;
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: toolsList,
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('hudu_list_companies');
    expect(response.body).not.toContain('Missing credentials');
    expect(response.body).not.toContain(S2S_SECRET);
  });

  it('serves /health without authentication and without reading credentials', async () => {
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'GET',
      path: '/health',
    });
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { status?: string; authMode?: string };
    expect(body.status).toBe('ok');
    expect(body.authMode).toBe('gateway');
    expect(response.body).not.toContain(S2S_SECRET);
    expect(response.body).not.toContain(ENV_API_KEY);
    expect(response.body).not.toContain(ENV_BASE_URL);
    expect(constructed.some((entry) => entry.apiKey === ENV_API_KEY)).toBe(false);
  });
});
