/**
 * RFC 7591 Dynamic Client Registration for a public (no client_secret) OAuth
 * client, registered against a Hudu instance's `registration_endpoint`.
 */

export interface DcrRequestOptions {
  registrationEndpoint: string;
  redirectUri: string;
  clientName?: string;
}

export interface DcrClientInfo {
  clientId: string;
  clientSecret?: string;
  raw: Record<string, unknown>;
}

/** The RFC 7591 request body, split out so it can be unit tested without a network call. */
export function buildDcrRequestBody(opts: Pick<DcrRequestOptions, 'redirectUri' | 'clientName'>): Record<string, unknown> {
  return {
    client_name: opts.clientName ?? 'hudu-mcp',
    redirect_uris: [opts.redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

export async function registerClient(opts: DcrRequestOptions): Promise<DcrClientInfo> {
  const body = buildDcrRequestBody(opts);
  const res = await fetch(opts.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Dynamic client registration failed at ${opts.registrationEndpoint}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
    );
  }

  const json = (await res.json()) as Record<string, unknown>;
  const clientId = json.client_id;
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new Error('Dynamic client registration response is missing a client_id');
  }

  return {
    clientId,
    clientSecret: typeof json.client_secret === 'string' ? json.client_secret : undefined,
    raw: json,
  };
}
