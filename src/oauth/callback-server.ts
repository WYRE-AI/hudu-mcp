/**
 * A short-lived local HTTP server that catches the OAuth authorization
 * redirect on `http://127.0.0.1:<ephemeral-port>/callback`, validates the
 * `state` parameter, and resolves with the authorization `code`.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CallbackResult {
  code: string;
  state: string;
}

export interface PendingCallback {
  /** The redirect_uri to register with DCR and pass to the authorization endpoint. */
  redirectUri: string;
  /** Resolves with the validated {code, state} once the redirect arrives. */
  waitForCallback: () => Promise<CallbackResult>;
  close: () => Promise<void>;
}

const PAGE_STYLE = 'font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; text-align: center;';

function htmlPage(message: string): string {
  return `<!doctype html><html><body style="${PAGE_STYLE}"><p>${message}</p><p>You may close this window and return to the terminal.</p></body></html>`;
}

/**
 * Starts the callback listener and resolves once it is bound to a port.
 * The returned `waitForCallback()` promise settles when the redirect
 * arrives (or `timeoutMs` elapses); either way the caller is expected to
 * call `close()` afterwards.
 */
export function startCallbackServer(
  expectedState: string,
  timeoutMs = 5 * 60_000,
): Promise<PendingCallback> {
  return new Promise((resolveStart, rejectStart) => {
    let settleResult: (r: CallbackResult) => void;
    let settleError: (e: Error) => void;
    const resultPromise = new Promise<CallbackResult>((res, rej) => {
      settleResult = res;
      settleError = rej;
    });
    // Unhandled-rejection guard: waitForCallback() may never be awaited
    // before close() rejects it (e.g. caller errors out earlier).
    resultPromise.catch(() => {});

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Not found.'));
        return;
      }

      // State is checked before anything else -- including the error branch
      // below -- so a request that doesn't correlate to the flow we started
      // (missing/mismatched state) can never abort it, whether it's forging
      // a success or a failure. Only a callback that proves it's ours gets
      // to settle the pending promise either way.
      const state = url.searchParams.get('state');
      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Invalid state parameter — authorization aborted for your safety.'));
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        const description = url.searchParams.get('error_description') || error;
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage(`Authorization failed: ${description}`));
        settleError(new Error(`Hudu authorization server returned an error: ${description}`));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Missing authorization code.'));
        settleError(new Error('OAuth callback is missing the code parameter'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlPage('Authorization complete.'));
      settleResult({ code, state });
    });

    server.on('error', rejectStart);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const timeout = setTimeout(() => {
        settleError(new Error('Timed out waiting for the OAuth authorization redirect'));
      }, timeoutMs);
      timeout.unref?.();

      resolveStart({
        redirectUri,
        waitForCallback: () => resultPromise.finally(() => clearTimeout(timeout)),
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
