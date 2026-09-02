/**
 * Handler-invocation tests for HuduToolHandler.
 *
 * The tool-surface (list/call routing through the MCP transport) is already
 * covered by src/__tests__/worker.test.ts. This file covers the layer that
 * was previously untested: for each registered tool, that
 *   1. the outbound call to the underlying Hudu API client is shaped
 *      correctly (method invoked, and the params/body/id derived from the
 *      tool arguments), and
 *   2. the raw client response is correctly transformed into the tool's
 *      returned MCP content (the `{ message, data }` envelope).
 *
 * The `@wyre-technology/node-hudu` client is mocked at the module boundary;
 * HuduService and HuduToolHandler run for real against the mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = vi.hoisted(() => ({
  companies: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
  },
  assets: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
  },
  assetLayouts: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  assetPasswords: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  articles: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
  },
  websites: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  folders: { list: vi.fn() },
  procedures: { list: vi.fn() },
  activityLogs: { list: vi.fn() },
  relations: { list: vi.fn() },
  magicDash: { list: vi.fn() },
}));

vi.mock('@wyre-technology/node-hudu', () => ({
  HuduClient: vi.fn().mockImplementation(function HuduClient() {
    return mockClient;
  }),
}));

import { HuduService } from '../../services/hudu.service.js';
import { Logger } from '../../utils/logger.js';
import { HuduToolHandler } from '../tool.handler.js';

function resetAllMocks() {
  for (const resource of Object.values(mockClient)) {
    for (const fn of Object.values(resource)) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
}

function makeHandler(): HuduToolHandler {
  const logger = new Logger('error');
  const service = new HuduService(
    { name: 'hudu-mcp', version: 'test', hudu: { baseUrl: 'https://hudu.example.test', apiKey: 'test-key' } },
    logger,
  );
  return new HuduToolHandler(service, logger);
}

async function callAndParse(handler: HuduToolHandler, name: string, args: Record<string, any> = {}) {
  const result = await handler.callTool(name, args);
  const parsed = JSON.parse(result.content[0].text as string);
  return { result, parsed };
}

describe('HuduToolHandler - listTools', () => {
  it('returns the full tool definition list', async () => {
    const handler = makeHandler();
    const tools = await handler.listTools();
    expect(tools.length).toBeGreaterThan(30);
    expect(tools.map((t) => t.name)).toContain('hudu_list_companies');
  });
});

describe('HuduToolHandler - callTool dispatch, per domain', () => {
  beforeEach(() => resetAllMocks());

  describe('connection', () => {
    it('hudu_test_connection reports success on a healthy client', async () => {
      mockClient.companies.list.mockResolvedValue([]);
      const handler = makeHandler();
      const { result, parsed } = await callAndParse(handler, 'hudu_test_connection', {});
      expect(mockClient.companies.list).toHaveBeenCalledWith({ page: 1, page_size: 1 });
      expect(result.isError).toBeUndefined();
      expect(parsed).toEqual({ message: 'Successfully connected to Hudu API', data: { success: true } });
    });

    it('hudu_test_connection surfaces the real underlying error as a tool error, not a generic message', async () => {
      mockClient.companies.list.mockRejectedValue(new Error('network down'));
      const handler = makeHandler();
      const { result, parsed } = await callAndParse(handler, 'hudu_test_connection', {});
      expect(result.isError).toBe(true);
      expect(parsed.error).toBe('network down');
      expect(parsed.tool).toBe('hudu_test_connection');
    });
  });

  describe('companies', () => {
    it('hudu_list_companies passes filters through and reports the count', async () => {
      mockClient.companies.list.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_companies', { name: 'Acme', page: 2 });
      expect(mockClient.companies.list).toHaveBeenCalledWith({ name: 'Acme', page: 2 });
      expect(parsed).toEqual({ message: 'Found 2 companies', data: [{ id: 1 }, { id: 2 }] });
    });

    it('hudu_get_company fetches by id and maps the response', async () => {
      mockClient.companies.get.mockResolvedValue({ id: 7, name: 'Acme Corp' });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_get_company', { id: 7 });
      expect(mockClient.companies.get).toHaveBeenCalledWith(7);
      expect(parsed).toEqual({ message: 'Company retrieved successfully', data: { id: 7, name: 'Acme Corp' } });
    });

    it('hudu_create_company strips a stray id and forwards the rest as the create body', async () => {
      mockClient.companies.create.mockResolvedValue({ id: 9, name: 'New Co' });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_create_company', { id: 999, name: 'New Co', nickname: 'nc' });
      expect(mockClient.companies.create).toHaveBeenCalledWith({ name: 'New Co', nickname: 'nc' });
      expect(parsed).toEqual({ message: 'Company created successfully', data: { id: 9, name: 'New Co' } });
    });

    it('hudu_update_company splits id from the update body and reports the id in the message', async () => {
      mockClient.companies.update.mockResolvedValue({ id: 7, name: 'Renamed' });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_update_company', { id: 7, name: 'Renamed' });
      expect(mockClient.companies.update).toHaveBeenCalledWith(7, { name: 'Renamed' });
      expect(parsed.message).toBe('Company 7 updated successfully');
      expect(parsed.data).toEqual({ id: 7, name: 'Renamed' });
    });

    it('hudu_delete_company deletes by id and returns a null-data envelope', async () => {
      mockClient.companies.delete.mockResolvedValue(undefined);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_delete_company', { id: 3 });
      expect(mockClient.companies.delete).toHaveBeenCalledWith(3);
      expect(parsed).toEqual({ message: 'Company 3 deleted successfully', data: null });
    });

    it('hudu_archive_company / hudu_unarchive_company call the matching client methods', async () => {
      mockClient.companies.archive.mockResolvedValue(undefined);
      mockClient.companies.unarchive.mockResolvedValue(undefined);
      const handler = makeHandler();

      const archived = await callAndParse(handler, 'hudu_archive_company', { id: 4 });
      expect(mockClient.companies.archive).toHaveBeenCalledWith(4);
      expect(archived.parsed.message).toBe('Company 4 archived successfully');

      const unarchived = await callAndParse(handler, 'hudu_unarchive_company', { id: 4 });
      expect(mockClient.companies.unarchive).toHaveBeenCalledWith(4);
      expect(unarchived.parsed.message).toBe('Company 4 unarchived successfully');
    });
  });

  describe('assets', () => {
    it('hudu_list_assets forwards filters and reports the count', async () => {
      mockClient.assets.list.mockResolvedValue([{ id: 1 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_assets', { company_id: 5 });
      expect(mockClient.assets.list).toHaveBeenCalledWith({ company_id: 5 });
      expect(parsed.message).toBe('Found 1 assets');
    });

    it('hudu_get_asset fetches by id', async () => {
      mockClient.assets.get.mockResolvedValue({ id: 11 });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_get_asset', { id: 11 });
      expect(mockClient.assets.get).toHaveBeenCalledWith(11);
      expect(parsed.data).toEqual({ id: 11 });
    });

    it('hudu_create_asset forwards the full body (no id to strip)', async () => {
      mockClient.assets.create.mockResolvedValue({ id: 20, name: 'Server 1' });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_create_asset', { name: 'Server 1', company_id: 5 });
      expect(mockClient.assets.create).toHaveBeenCalledWith({ name: 'Server 1', company_id: 5 });
      expect(parsed.data).toEqual({ id: 20, name: 'Server 1' });
    });

    it('hudu_update_asset splits id from the body', async () => {
      mockClient.assets.update.mockResolvedValue({ id: 20, name: 'Server 1 Renamed' });
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_update_asset', { id: 20, name: 'Server 1 Renamed' });
      expect(mockClient.assets.update).toHaveBeenCalledWith(20, { name: 'Server 1 Renamed' });
      expect(parsed.message).toBe('Asset 20 updated successfully');
    });

    it('hudu_delete_asset and hudu_archive_asset call the matching client methods', async () => {
      mockClient.assets.delete.mockResolvedValue(undefined);
      mockClient.assets.archive.mockResolvedValue(undefined);
      const handler = makeHandler();

      await callAndParse(handler, 'hudu_delete_asset', { id: 8 });
      expect(mockClient.assets.delete).toHaveBeenCalledWith(8);

      await callAndParse(handler, 'hudu_archive_asset', { id: 8 });
      expect(mockClient.assets.archive).toHaveBeenCalledWith(8);
    });
  });

  describe('asset layouts', () => {
    it('hudu_list_asset_layouts / hudu_get_asset_layout', async () => {
      mockClient.assetLayouts.list.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      mockClient.assetLayouts.get.mockResolvedValue({ id: 1, name: 'Servers' });
      const handler = makeHandler();

      const list = await callAndParse(handler, 'hudu_list_asset_layouts', {});
      expect(mockClient.assetLayouts.list).toHaveBeenCalledWith({});
      expect(list.parsed.message).toBe('Found 3 asset layouts');

      const single = await callAndParse(handler, 'hudu_get_asset_layout', { id: 1 });
      expect(mockClient.assetLayouts.get).toHaveBeenCalledWith(1);
      expect(single.parsed.data).toEqual({ id: 1, name: 'Servers' });
    });

    it('hudu_create_asset_layout and hudu_update_asset_layout shape the body correctly', async () => {
      mockClient.assetLayouts.create.mockResolvedValue({ id: 5, name: 'Workstations' });
      mockClient.assetLayouts.update.mockResolvedValue({ id: 5, name: 'Workstations v2' });
      const handler = makeHandler();

      await callAndParse(handler, 'hudu_create_asset_layout', { name: 'Workstations' });
      expect(mockClient.assetLayouts.create).toHaveBeenCalledWith({ name: 'Workstations' });

      await callAndParse(handler, 'hudu_update_asset_layout', { id: 5, name: 'Workstations v2' });
      expect(mockClient.assetLayouts.update).toHaveBeenCalledWith(5, { name: 'Workstations v2' });
    });
  });

  describe('asset passwords', () => {
    it('covers list/get/create/update/delete', async () => {
      mockClient.assetPasswords.list.mockResolvedValue([{ id: 1 }]);
      mockClient.assetPasswords.get.mockResolvedValue({ id: 1, name: 'root' });
      mockClient.assetPasswords.create.mockResolvedValue({ id: 2, name: 'admin' });
      mockClient.assetPasswords.update.mockResolvedValue({ id: 2, name: 'admin-renamed' });
      mockClient.assetPasswords.delete.mockResolvedValue(undefined);
      const handler = makeHandler();

      const list = await callAndParse(handler, 'hudu_list_asset_passwords', { company_id: 1 });
      expect(mockClient.assetPasswords.list).toHaveBeenCalledWith({ company_id: 1 });
      expect(list.parsed.message).toBe('Found 1 asset passwords');

      await callAndParse(handler, 'hudu_get_asset_password', { id: 1 });
      expect(mockClient.assetPasswords.get).toHaveBeenCalledWith(1);

      await callAndParse(handler, 'hudu_create_asset_password', { name: 'admin', username: 'root' });
      expect(mockClient.assetPasswords.create).toHaveBeenCalledWith({ name: 'admin', username: 'root' });

      const updated = await callAndParse(handler, 'hudu_update_asset_password', { id: 2, name: 'admin-renamed' });
      expect(mockClient.assetPasswords.update).toHaveBeenCalledWith(2, { name: 'admin-renamed' });
      expect(updated.parsed.message).toBe('Asset password 2 updated successfully');

      const deleted = await callAndParse(handler, 'hudu_delete_asset_password', { id: 2 });
      expect(mockClient.assetPasswords.delete).toHaveBeenCalledWith(2);
      expect(deleted.parsed).toEqual({ message: 'Asset password 2 deleted successfully', data: null });
    });
  });

  describe('articles', () => {
    it('covers list/get/create/update/delete/archive', async () => {
      mockClient.articles.list.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockClient.articles.get.mockResolvedValue({ id: 1, name: 'Runbook' });
      mockClient.articles.create.mockResolvedValue({ id: 3, name: 'New Article' });
      mockClient.articles.update.mockResolvedValue({ id: 3, name: 'Updated Article' });
      mockClient.articles.delete.mockResolvedValue(undefined);
      mockClient.articles.archive.mockResolvedValue(undefined);
      const handler = makeHandler();

      const list = await callAndParse(handler, 'hudu_list_articles', {});
      expect(mockClient.articles.list).toHaveBeenCalledWith({});
      expect(list.parsed.message).toBe('Found 2 articles');

      await callAndParse(handler, 'hudu_get_article', { id: 1 });
      expect(mockClient.articles.get).toHaveBeenCalledWith(1);

      await callAndParse(handler, 'hudu_create_article', { name: 'New Article', content: 'body' });
      expect(mockClient.articles.create).toHaveBeenCalledWith({ name: 'New Article', content: 'body' });

      await callAndParse(handler, 'hudu_update_article', { id: 3, name: 'Updated Article' });
      expect(mockClient.articles.update).toHaveBeenCalledWith(3, { name: 'Updated Article' });

      const deleted = await callAndParse(handler, 'hudu_delete_article', { id: 3 });
      expect(mockClient.articles.delete).toHaveBeenCalledWith(3);
      expect(deleted.parsed.message).toBe('Article 3 deleted successfully');

      const archived = await callAndParse(handler, 'hudu_archive_article', { id: 3 });
      expect(mockClient.articles.archive).toHaveBeenCalledWith(3);
      expect(archived.parsed.message).toBe('Article 3 archived successfully');
    });
  });

  describe('websites', () => {
    it('covers list/get/create/update/delete', async () => {
      mockClient.websites.list.mockResolvedValue([{ id: 1 }]);
      mockClient.websites.get.mockResolvedValue({ id: 1, name: 'example.com' });
      mockClient.websites.create.mockResolvedValue({ id: 2, name: 'example.org' });
      mockClient.websites.update.mockResolvedValue({ id: 2, name: 'example.net' });
      mockClient.websites.delete.mockResolvedValue(undefined);
      const handler = makeHandler();

      const list = await callAndParse(handler, 'hudu_list_websites', {});
      expect(mockClient.websites.list).toHaveBeenCalledWith({});
      expect(list.parsed.message).toBe('Found 1 websites');

      await callAndParse(handler, 'hudu_get_website', { id: 1 });
      expect(mockClient.websites.get).toHaveBeenCalledWith(1);

      await callAndParse(handler, 'hudu_create_website', { name: 'example.org' });
      expect(mockClient.websites.create).toHaveBeenCalledWith({ name: 'example.org' });

      await callAndParse(handler, 'hudu_update_website', { id: 2, name: 'example.net' });
      expect(mockClient.websites.update).toHaveBeenCalledWith(2, { name: 'example.net' });

      const deleted = await callAndParse(handler, 'hudu_delete_website', { id: 2 });
      expect(mockClient.websites.delete).toHaveBeenCalledWith(2);
      expect(deleted.parsed).toEqual({ message: 'Website 2 deleted successfully', data: null });
    });
  });

  describe('single-endpoint list domains', () => {
    it('hudu_list_folders', async () => {
      mockClient.folders.list.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_folders', { company_id: 1 });
      expect(mockClient.folders.list).toHaveBeenCalledWith({ company_id: 1 });
      expect(parsed.message).toBe('Found 2 folders');
    });

    it('hudu_list_procedures', async () => {
      mockClient.procedures.list.mockResolvedValue([{ id: 1 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_procedures', {});
      expect(mockClient.procedures.list).toHaveBeenCalledWith({});
      expect(parsed.message).toBe('Found 1 procedures');
    });

    it('hudu_list_activity_logs', async () => {
      mockClient.activityLogs.list.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_activity_logs', {});
      expect(mockClient.activityLogs.list).toHaveBeenCalledWith({});
      expect(parsed.message).toBe('Found 3 activity logs');
    });

    it('hudu_list_relations', async () => {
      mockClient.relations.list.mockResolvedValue([]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_relations', {});
      expect(mockClient.relations.list).toHaveBeenCalledWith({});
      expect(parsed.message).toBe('Found 0 relations');
    });

    it('hudu_list_magic_dash', async () => {
      mockClient.magicDash.list.mockResolvedValue([{ id: 1 }]);
      const handler = makeHandler();
      const { parsed } = await callAndParse(handler, 'hudu_list_magic_dash', { company_id: 9 });
      expect(mockClient.magicDash.list).toHaveBeenCalledWith({ company_id: 9 });
      expect(parsed.message).toBe('Found 1 Magic Dash items');
    });
  });
});

describe('HuduToolHandler - error paths', () => {
  beforeEach(() => resetAllMocks());

  it('returns an isError envelope for an unregistered tool name', async () => {
    const handler = makeHandler();
    const { result, parsed } = await callAndParse(handler, 'hudu_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(parsed.error).toBe('Unknown tool: hudu_not_a_real_tool');
    expect(parsed.tool).toBe('hudu_not_a_real_tool');
  });

  it('wraps a client-level rejection into an isError envelope rather than throwing', async () => {
    mockClient.companies.get.mockRejectedValue(new Error('404 not found'));
    const handler = makeHandler();
    const { result, parsed } = await callAndParse(handler, 'hudu_get_company', { id: 404 });
    expect(result.isError).toBe(true);
    expect(parsed.error).toBe('404 not found');
    expect(parsed.tool).toBe('hudu_get_company');
  });

  it('surfaces a missing-credentials configuration error through the same envelope', async () => {
    const logger = new Logger('error');
    const service = new HuduService({ name: 'hudu-mcp', version: 'test', hudu: {} }, logger);
    const handler = new HuduToolHandler(service, logger);
    const { result, parsed } = await callAndParse(handler, 'hudu_list_companies', {});
    expect(result.isError).toBe(true);
    expect(parsed.error).toMatch(/HUDU_BASE_URL and HUDU_API_KEY/);
  });
});
