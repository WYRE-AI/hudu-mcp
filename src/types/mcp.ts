export interface McpServerConfig {
  name: string;
  version: string;
  hudu: {
    baseUrl?: string;
    apiKey?: string;
    /** 'api_key' (default when HUDU_API_KEY is set) or 'oauth' (default otherwise). */
    mode?: 'api_key' | 'oauth';
  };
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
  isError?: boolean;
}
