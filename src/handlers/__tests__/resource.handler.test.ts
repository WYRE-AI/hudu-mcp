/**
 * Handler-invocation tests for HuduResourceHandler: URI parsing, request
 * shaping into HuduService calls, and response transformation into the MCP
 * resource-content envelope (including the derived `metadata` block).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = vi.hoisted(() => ({
  companies: { list: vi.fn(), get: vi.fn() },
  assets: { list: vi.fn(), get: vi.fn() },
  articles: { list: vi.fn(), get: vi.fn() },
}));

vi.mock('@wyre-technology/node-hudu', () => ({
  HuduClient: vi.fn().mockImplementation(function HuduClient() {
    return mockClient;
  }),
}));

import { HuduService } from '../../services/hudu.service.js';
import { Logger } from '../../utils/logger.js';
import { HuduResourceHandler } from '../resource.handler.js';

function makeHandler(): HuduResourceHandler {
  const logger = new Logger('error');
  const service = new HuduService(
    { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://hudu.example.test', apiKey: 'test-key' } },
    logger,
  );
  return new HuduResourceHandler(service, logger);
}

beforeEach(() => {
  for (const resource of Object.values(mockClient)) {
    for (const fn of Object.values(resource)) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
});

describe('HuduResourceHandler - listResources', () => {
  it('advertises the static resource catalog', async () => {
    const handler = makeHandler();
    const resources = await handler.listResources();
    expect(resources.map((r) => r.uri)).toEqual([
      'hudu://companies',
      'hudu://companies/{id}',
      'hudu://assets',
      'hudu://assets/{id}',
      'hudu://articles',
      'hudu://articles/{id}',
    ]);
  });
});

describe('HuduResourceHandler - readResource', () => {
  it('reads a company collection with the page_size default and reports its count in metadata', async () => {
    mockClient.companies.list.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const handler = makeHandler();
    const content = await handler.readResource('hudu://companies');
    expect(mockClient.companies.list).toHaveBeenCalledWith({ page_size: 100 });

    const body = JSON.parse(content.text as string);
    expect(body.description).toBe('List of 2 companies');
    expect(body.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(body.metadata).toMatchObject({ resourceType: 'companies', resourceId: null, count: 2 });
    expect(content.mimeType).toBe('application/json');
  });

  it('reads a single company by id and names it in the description', async () => {
    mockClient.companies.get.mockResolvedValue({ id: 5, name: 'Acme' });
    const handler = makeHandler();
    const content = await handler.readResource('hudu://companies/5');
    expect(mockClient.companies.get).toHaveBeenCalledWith(5);

    const body = JSON.parse(content.text as string);
    expect(body.description).toBe('Company: Acme');
    expect(body.metadata).toMatchObject({ resourceType: 'companies', resourceId: '5', count: 1 });
  });

  it('falls back to "Unknown" in the description when the record has no name', async () => {
    mockClient.assets.get.mockResolvedValue({ id: 9 });
    const handler = makeHandler();
    const content = await handler.readResource('hudu://assets/9');
    const body = JSON.parse(content.text as string);
    expect(body.description).toBe('Asset: Unknown');
  });

  it('reads an asset collection', async () => {
    mockClient.assets.list.mockResolvedValue([{ id: 1 }]);
    const handler = makeHandler();
    const content = await handler.readResource('hudu://assets');
    expect(mockClient.assets.list).toHaveBeenCalledWith({ page_size: 100 });
    const body = JSON.parse(content.text as string);
    expect(body.description).toBe('List of 1 assets');
  });

  it('reads an article by id', async () => {
    mockClient.articles.get.mockResolvedValue({ id: 3, name: 'Runbook' });
    const handler = makeHandler();
    const content = await handler.readResource('hudu://articles/3');
    expect(mockClient.articles.get).toHaveBeenCalledWith(3);
    const body = JSON.parse(content.text as string);
    expect(body.description).toBe('Article: Runbook');
  });

  it('rejects an unknown resource type', async () => {
    const handler = makeHandler();
    await expect(handler.readResource('hudu://widgets')).rejects.toThrow('Unknown resource type: widgets');
  });

  it('rejects a malformed URI', async () => {
    const handler = makeHandler();
    await expect(handler.readResource('not-a-hudu-uri')).rejects.toThrow('Invalid Hudu URI format');
  });

  it('rejects an unresolved {id} template URI', async () => {
    const handler = makeHandler();
    await expect(handler.readResource('hudu://companies/{id}')).rejects.toThrow('Template URI not supported for reading');
  });
});
