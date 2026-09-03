/**
 * RFC 9728 (OAuth 2.0 Protected Resource Metadata) and RFC 8414 (OAuth 2.0
 * Authorization Server Metadata) discovery for a Hudu instance's native MCP
 * endpoint.
 *
 * Verified against a live Hudu instance (Admin -> External Apps -> MCP):
 *
 *   GET {baseUrl}/.well-known/oauth-protected-resource/mcp
 *     -> { resource, authorization_servers, scopes_supported, bearer_methods_supported }
 *
 *   GET {baseUrl}/.well-known/oauth-authorization-server
 *     -> { issuer, authorization_endpoint, token_endpoint, registration_endpoint,
 *          code_challenge_methods_supported, response_types_supported,
 *          grant_types_supported, token_endpoint_auth_methods_supported }
 */

export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  [key: string]: unknown;
}

export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  [key: string]: unknown;
}

export interface DiscoveredOAuthConfig {
  mcpUrl: string;
  protectedResource: OAuthProtectedResourceMetadata;
  authorizationServer: OAuthAuthorizationServerMetadata;
}

/**
 * Builds a well-known metadata URL per the RFC 8414/9728 "insert before path"
 * convention: `{origin}/.well-known/{segment}{path}`. For a bare origin
 * (path is "/" or empty) this reduces to `{origin}/.well-known/{segment}`.
 */
export function buildWellKnownUrl(resourceUrl: string, wellKnownSegment: string): string {
  const url = new URL(resourceUrl);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}/.well-known/${wellKnownSegment}${path}`;
}

async function fetchJson<T>(url: string, description: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${description} from ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function huduMcpUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/mcp`;
}

export async function discoverProtectedResourceMetadata(
  mcpUrl: string,
): Promise<OAuthProtectedResourceMetadata> {
  const url = buildWellKnownUrl(mcpUrl, 'oauth-protected-resource');
  return fetchJson<OAuthProtectedResourceMetadata>(url, 'OAuth protected resource metadata');
}

export async function discoverAuthorizationServerMetadata(
  authorizationServerUrl: string,
): Promise<OAuthAuthorizationServerMetadata> {
  const url = buildWellKnownUrl(authorizationServerUrl, 'oauth-authorization-server');
  return fetchJson<OAuthAuthorizationServerMetadata>(url, 'OAuth authorization server metadata');
}

/**
 * Full discovery for a Hudu base URL: locate the protected-resource metadata
 * for `{baseUrl}/mcp`, then the authorization-server metadata for whichever
 * issuer it names (falling back to `baseUrl` itself if the resource document
 * omits `authorization_servers`).
 */
export async function discoverOAuthConfig(baseUrl: string): Promise<DiscoveredOAuthConfig> {
  const mcpUrl = huduMcpUrl(baseUrl);
  const protectedResource = await discoverProtectedResourceMetadata(mcpUrl);
  const authServerUrl = protectedResource.authorization_servers?.[0] || baseUrl;
  const authorizationServer = await discoverAuthorizationServerMetadata(authServerUrl);
  return { mcpUrl, protectedResource, authorizationServer };
}
