/**
 * HuduService tests covering the client lifecycle behaviour that sits below
 * every tool handler: lazy initialization, the missing-credentials guard,
 * gateway-mode credential rotation via updateCredentials, and
 * testConnection's success/failure mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = vi.hoisted(() => ({
  companies: { list: vi.fn() },
}));

const HuduClientCtor = vi.hoisted(() =>
  vi.fn().mockImplementation(function HuduClient() {
    return mockClient;
  }),
);

vi.mock('@wyre-technology/node-hudu', () => ({
  HuduClient: HuduClientCtor,
}));

import { HuduService } from '../hudu.service.js';
import { Logger } from '../../utils/logger.js';

beforeEach(() => {
  mockClient.companies.list.mockReset();
  HuduClientCtor.mockClear();
});

describe('HuduService - initialization', () => {
  it('throws a descriptive error when baseUrl/apiKey are missing, without constructing a client', async () => {
    const logger = new Logger('error');
    const service = new HuduService({ name: 'hudu-mcp', version: 'test', hudu: {} }, logger);
    await expect(service.listCompanies()).rejects.toThrow('Missing required Hudu credentials: HUDU_BASE_URL and HUDU_API_KEY are required');
    expect(HuduClientCtor).not.toHaveBeenCalled();
  });

  it('constructs the client exactly once across concurrent calls', async () => {
    mockClient.companies.list.mockResolvedValue([]);
    const logger = new Logger('error');
    const service = new HuduService(
      { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://hudu.example.test', apiKey: 'key' } },
      logger,
    );
    await Promise.all([service.listCompanies(), service.listCompanies(), service.listCompanies()]);
    expect(HuduClientCtor).toHaveBeenCalledTimes(1);
    expect(HuduClientCtor).toHaveBeenCalledWith({ baseUrl: 'https://hudu.example.test', apiKey: 'key' });
  });
});

describe('HuduService - updateCredentials', () => {
  it('rebuilds the client with the new credentials and serves the next call immediately', async () => {
    mockClient.companies.list.mockResolvedValue([{ id: 1 }]);
    const logger = new Logger('error');
    const service = new HuduService(
      { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://a.example.test', apiKey: 'key-a' } },
      logger,
    );
    await service.listCompanies();
    expect(HuduClientCtor).toHaveBeenNthCalledWith(1, { baseUrl: 'https://a.example.test', apiKey: 'key-a' });

    service.updateCredentials('https://b.example.test', 'key-b');
    await service.listCompanies();
    expect(HuduClientCtor).toHaveBeenNthCalledWith(2, { baseUrl: 'https://b.example.test', apiKey: 'key-b' });
    expect(HuduClientCtor).toHaveBeenCalledTimes(2);
  });
});

describe('HuduService - testConnection', () => {
  it('returns true when the underlying probe call succeeds', async () => {
    mockClient.companies.list.mockResolvedValue([]);
    const logger = new Logger('error');
    const service = new HuduService(
      { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://hudu.example.test', apiKey: 'key' } },
      logger,
    );
    await expect(service.testConnection()).resolves.toBe(true);
    expect(mockClient.companies.list).toHaveBeenCalledWith({ page: 1, page_size: 1 });
  });

  it('returns false (never throws) when the probe call rejects', async () => {
    mockClient.companies.list.mockRejectedValue(new Error('timeout'));
    const logger = new Logger('error');
    const service = new HuduService(
      { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://hudu.example.test', apiKey: 'key' } },
      logger,
    );
    await expect(service.testConnection()).resolves.toBe(false);
  });

  it('returns false when credentials are missing rather than throwing', async () => {
    const logger = new Logger('error');
    const service = new HuduService({ name: 'hudu-mcp', version: 'test', hudu: {} }, logger);
    await expect(service.testConnection()).resolves.toBe(false);
  });
});
