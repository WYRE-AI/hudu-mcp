import { HuduService } from '../services/hudu.service.js';
import { Logger } from '../utils/logger.js';
import { TOOL_DEFINITIONS, McpTool } from './tool.definitions.js';

export { McpTool };

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class HuduToolHandler {
  private huduService: HuduService;
  private logger: Logger;

  constructor(huduService: HuduService, logger: Logger) {
    this.huduService = huduService;
    this.logger = logger;
  }

  async listTools(): Promise<McpTool[]> {
    this.logger.debug(`Listed ${TOOL_DEFINITIONS.length} available tools`);
    return TOOL_DEFINITIONS;
  }

  private getDispatchTable(): Map<string, (args: any) => Promise<{ result: any; message: string }>> {
    const s = this.huduService;
    type H = (args: any) => Promise<{ result: any; message: string }>;
    return new Map<string, H>([
      // Connection
      ['hudu_test_connection', async () => {
        const ok = await s.testConnection();
        if (!ok) throw new Error('Connection failed: check HUDU_BASE_URL and HUDU_API_KEY');
        return { result: { success: true }, message: 'Successfully connected to Hudu API' };
      }],

      // Companies
      ['hudu_list_companies', async (a) => {
        const r = await s.listCompanies(a); return { result: r, message: `Found ${r.length} companies` };
      }],
      ['hudu_get_company', async (a) => {
        const r = await s.getCompany(a.id); return { result: r, message: 'Company retrieved successfully' };
      }],
      ['hudu_create_company', async (a) => {
        const { id: _omit, ...data } = a;
        const r = await s.createCompany(data); return { result: r, message: 'Company created successfully' };
      }],
      ['hudu_update_company', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateCompany(id, data); return { result: r, message: `Company ${id} updated successfully` };
      }],
      ['hudu_delete_company', async (a) => {
        await s.deleteCompany(a.id); return { result: null, message: `Company ${a.id} deleted successfully` };
      }],
      ['hudu_archive_company', async (a) => {
        await s.archiveCompany(a.id); return { result: null, message: `Company ${a.id} archived successfully` };
      }],
      ['hudu_unarchive_company', async (a) => {
        await s.unarchiveCompany(a.id); return { result: null, message: `Company ${a.id} unarchived successfully` };
      }],

      // Assets
      ['hudu_list_assets', async (a) => {
        const r = await s.listAssets(a); return { result: r, message: `Found ${r.length} assets` };
      }],
      ['hudu_get_asset', async (a) => {
        const r = await s.getAsset(a.id); return { result: r, message: 'Asset retrieved successfully' };
      }],
      ['hudu_create_asset', async (a) => {
        const r = await s.createAsset(a); return { result: r, message: 'Asset created successfully' };
      }],
      ['hudu_update_asset', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateAsset(id, data); return { result: r, message: `Asset ${id} updated successfully` };
      }],
      ['hudu_delete_asset', async (a) => {
        await s.deleteAsset(a.id); return { result: null, message: `Asset ${a.id} deleted successfully` };
      }],
      ['hudu_archive_asset', async (a) => {
        await s.archiveAsset(a.id); return { result: null, message: `Asset ${a.id} archived successfully` };
      }],

      // Asset Layouts
      ['hudu_list_asset_layouts', async (a) => {
        const r = await s.listAssetLayouts(a); return { result: r, message: `Found ${r.length} asset layouts` };
      }],
      ['hudu_get_asset_layout', async (a) => {
        const r = await s.getAssetLayout(a.id); return { result: r, message: 'Asset layout retrieved successfully' };
      }],
      ['hudu_create_asset_layout', async (a) => {
        const r = await s.createAssetLayout(a); return { result: r, message: 'Asset layout created successfully' };
      }],
      ['hudu_update_asset_layout', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateAssetLayout(id, data); return { result: r, message: `Asset layout ${id} updated successfully` };
      }],

      // Asset Passwords
      ['hudu_list_asset_passwords', async (a) => {
        const r = await s.listAssetPasswords(a); return { result: r, message: `Found ${r.length} asset passwords` };
      }],
      ['hudu_get_asset_password', async (a) => {
        const r = await s.getAssetPassword(a.id); return { result: r, message: 'Asset password retrieved successfully' };
      }],
      ['hudu_create_asset_password', async (a) => {
        const r = await s.createAssetPassword(a); return { result: r, message: 'Asset password created successfully' };
      }],
      ['hudu_update_asset_password', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateAssetPassword(id, data); return { result: r, message: `Asset password ${id} updated successfully` };
      }],
      ['hudu_delete_asset_password', async (a) => {
        await s.deleteAssetPassword(a.id); return { result: null, message: `Asset password ${a.id} deleted successfully` };
      }],

      // Articles
      ['hudu_list_articles', async (a) => {
        const r = await s.listArticles(a); return { result: r, message: `Found ${r.length} articles` };
      }],
      ['hudu_get_article', async (a) => {
        const r = await s.getArticle(a.id); return { result: r, message: 'Article retrieved successfully' };
      }],
      ['hudu_create_article', async (a) => {
        const r = await s.createArticle(a); return { result: r, message: 'Article created successfully' };
      }],
      ['hudu_update_article', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateArticle(id, data); return { result: r, message: `Article ${id} updated successfully` };
      }],
      ['hudu_delete_article', async (a) => {
        await s.deleteArticle(a.id); return { result: null, message: `Article ${a.id} deleted successfully` };
      }],
      ['hudu_archive_article', async (a) => {
        await s.archiveArticle(a.id); return { result: null, message: `Article ${a.id} archived successfully` };
      }],

      // Websites
      ['hudu_list_websites', async (a) => {
        const r = await s.listWebsites(a); return { result: r, message: `Found ${r.length} websites` };
      }],
      ['hudu_get_website', async (a) => {
        const r = await s.getWebsite(a.id); return { result: r, message: 'Website retrieved successfully' };
      }],
      ['hudu_create_website', async (a) => {
        const r = await s.createWebsite(a); return { result: r, message: 'Website created successfully' };
      }],
      ['hudu_update_website', async (a) => {
        const { id, ...data } = a;
        const r = await s.updateWebsite(id, data); return { result: r, message: `Website ${id} updated successfully` };
      }],
      ['hudu_delete_website', async (a) => {
        await s.deleteWebsite(a.id); return { result: null, message: `Website ${a.id} deleted successfully` };
      }],

      // Folders
      ['hudu_list_folders', async (a) => {
        const r = await s.listFolders(a); return { result: r, message: `Found ${r.length} folders` };
      }],

      // Procedures
      ['hudu_list_procedures', async (a) => {
        const r = await s.listProcedures(a); return { result: r, message: `Found ${r.length} procedures` };
      }],

      // Activity Logs
      ['hudu_list_activity_logs', async (a) => {
        const r = await s.listActivityLogs(a); return { result: r, message: `Found ${r.length} activity logs` };
      }],

      // Relations
      ['hudu_list_relations', async (a) => {
        const r = await s.listRelations(a); return { result: r, message: `Found ${r.length} relations` };
      }],

      // Magic Dash
      ['hudu_list_magic_dash', async (a) => {
        const r = await s.listMagicDash(a); return { result: r, message: `Found ${r.length} Magic Dash items` };
      }],
    ]);
  }

  async callTool(name: string, args: Record<string, any>): Promise<McpToolResult> {
    this.logger.debug(`Calling tool: ${name}`, args);

    try {
      const handler = this.getDispatchTable().get(name);
      if (!handler) throw new Error(`Unknown tool: ${name}`);

      const { result, message } = await handler(args);
      const responseText = JSON.stringify({ message, data: result });

      this.logger.debug(`Successfully executed tool: ${name}`);
      return { content: [{ type: 'text', text: responseText }] };
    } catch (error) {
      this.logger.error(`Tool execution failed for ${name}:`, error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', tool: name }) }],
        isError: true
      };
    }
  }
}
