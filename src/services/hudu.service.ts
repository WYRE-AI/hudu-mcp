import { HuduClient } from '@wyre-technology/node-hudu';
import { McpServerConfig } from '../types/mcp.js';
import { Logger } from '../utils/logger.js';

export class HuduService {
  private client: HuduClient | null = null;
  private logger: Logger;
  private config: McpServerConfig;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: McpServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  private async ensureClient(): Promise<HuduClient> {
    if (!this.client) {
      await this.ensureInitialized();
    }
    return this.client!;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }
    if (this.client) return;

    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    const { baseUrl, apiKey } = this.config.hudu;
    if (!baseUrl || !apiKey) {
      throw new Error('Missing required Hudu credentials: HUDU_BASE_URL and HUDU_API_KEY are required');
    }

    this.logger.info('Initializing Hudu client...');
    this.client = new HuduClient({ baseUrl, apiKey });
    this.logger.info('Hudu client initialized successfully');
  }

  // Companies
  async listCompanies(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.companies.list(params);
  }

  async getCompany(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.companies.get(id);
  }

  async createCompany(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.companies.create(data);
  }

  async updateCompany(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.companies.update(id, data);
  }

  async deleteCompany(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.companies.delete(id);
  }

  async archiveCompany(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.companies.archive(id);
  }

  async unarchiveCompany(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.companies.unarchive(id);
  }

  // Assets
  async listAssets(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.assets.list(params);
  }

  async getAsset(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.assets.get(id);
  }

  async createAsset(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assets.create(data);
  }

  async updateAsset(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assets.update(id, data);
  }

  async deleteAsset(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.assets.delete(id);
  }

  async archiveAsset(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.assets.archive(id);
  }

  // Asset Layouts
  async listAssetLayouts(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.assetLayouts.list(params);
  }

  async getAssetLayout(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.assetLayouts.get(id);
  }

  async createAssetLayout(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assetLayouts.create(data);
  }

  async updateAssetLayout(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assetLayouts.update(id, data);
  }

  // Asset Passwords
  async listAssetPasswords(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.assetPasswords.list(params);
  }

  async getAssetPassword(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.assetPasswords.get(id);
  }

  async createAssetPassword(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assetPasswords.create(data);
  }

  async updateAssetPassword(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.assetPasswords.update(id, data);
  }

  async deleteAssetPassword(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.assetPasswords.delete(id);
  }

  // Articles
  async listArticles(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.articles.list(params);
  }

  async getArticle(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.articles.get(id);
  }

  async createArticle(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.articles.create(data);
  }

  async updateArticle(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.articles.update(id, data);
  }

  async deleteArticle(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.articles.delete(id);
  }

  async archiveArticle(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.articles.archive(id);
  }

  // Websites
  async listWebsites(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.websites.list(params);
  }

  async getWebsite(id: number): Promise<any> {
    const client = await this.ensureClient();
    return client.websites.get(id);
  }

  async createWebsite(data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.websites.create(data);
  }

  async updateWebsite(id: number, data: any): Promise<any> {
    const client = await this.ensureClient();
    return client.websites.update(id, data);
  }

  async deleteWebsite(id: number): Promise<void> {
    const client = await this.ensureClient();
    await client.websites.delete(id);
  }

  // Folders
  async listFolders(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.folders.list(params);
  }

  // Procedures
  async listProcedures(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.procedures.list(params);
  }

  // Activity Logs
  async listActivityLogs(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.activityLogs.list(params);
  }

  // Relations
  async listRelations(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.relations.list(params);
  }

  // Magic Dash
  async listMagicDash(params?: any): Promise<any[]> {
    const client = await this.ensureClient();
    return client.magicDash.list(params);
  }

  /**
   * Reinitialize the Hudu client with new credentials.
   * Used in gateway mode where credentials come from request headers.
   */
  updateCredentials(baseUrl: string, apiKey: string): void {
    this.client = new HuduClient({ baseUrl, apiKey });
    this.initializationPromise = null;
    this.logger.debug('Hudu client reinitialized with new credentials');
  }

  // Test connection
  async testConnection(): Promise<void> {
    const client = await this.ensureClient();
    await client.companies.list({ page: 1, page_size: 1 });
  }
}
