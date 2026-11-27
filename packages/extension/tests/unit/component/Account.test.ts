import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { TOKEN_KEY } from '../../../src/browser/catalogue';
import Account from '../../../src/component/Account.svelte';
import Options from '../../../src/component/Options.svelte';
import { installChromeMock } from '../../mocks/chrome';

const CATALOGUE = 'https://catalogue.example.test/';

/**
 * The catalogue's answer to `/api/v2/me`.
 * @param entitled - Whether the user may use everything
 * @param paidUntil - When their subscription ends or ended
 * @param nickname - The nickname they set, if any
 * @returns The answer
 */
const me = (entitled: boolean, paidUntil: string | null, nickname: string | null = null) =>
  Response.json({
    user: { handle: 'crimson-bell-trail-58', nickname, role: 'user' },
    subscription: { paidUntil, active: entitled },
    entitled,
  });

/**
 * The codes the catalogue gives: a new answer each time, as a body is read once.
 * @returns The answer
 */
const codes = () =>
  Response.json({
    device_code: 'dev1ce',
    user_code: 'WDJBMJHT',
    verification_uri_complete: `${CATALOGUE}device?user_code=WDJBMJHT`,
    expires_in: 600,
    interval: 0,
  });

/**
 * Show the account, with the catalogue answering as a test says, by the endpoint asked.
 * @param token - The token kept, if any
 * @param answers - The answers, by path, each given in turn
 * @returns The mocks, and a user to act with
 */
function setUp(token: string | undefined, answers: Record<string, (Response | Error)[]>) {
  const mocks = installChromeMock({ storage: token === undefined ? {} : { [TOKEN_KEY]: token } });
  const send = vi.fn<typeof fetch>(input => {
    const next =
      answers[new URL(input instanceof Request ? input.url : input).pathname]?.shift() ?? new Error('not answered');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const open = vi.fn();
  render(Account, { catalogue: CATALOGUE, openPage: open, fetch: send });
  return { ...mocks, send, open, user: userEvent.setup() };
}

describe('Account', () => {
  test('names the user by the nickname they set, then the name the accounts gave them', async () => {
    setUp('t0k3n', { '/api/v2/me': [me(true, null, 'Ulenar')] });

    expect(await screen.findByText('Signed in as Ulenar (crimson-bell-trail-58).')).toBeInTheDocument();
  });

  test('says whom the extension is signed in as, until when they are subscribed, and signs out', async () => {
    const { user, storage } = setUp('t0k3n', { '/api/v2/me': [me(true, '2027-01-01T00:00:00.000Z')] });

    expect(await screen.findByText('Signed in as crimson-bell-trail-58.')).toBeInTheDocument();
    expect(screen.getByText(/^Subscribed until /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'your signed-in devices' })).toHaveAttribute('href', `${CATALOGUE}profile`);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(storage.has(TOKEN_KEY)).toBe(false);
    expect(screen.getByRole('button', { name: "Sign in to EMMA's catalogue" })).toBeInTheDocument();
  });

  test('says an admin may use everything, with no subscription to end', async () => {
    setUp('t0k3n', { '/api/v2/me': [me(true, null)] });
    expect(await screen.findByText("You may use everything EMMA's catalogue gives.")).toBeInTheDocument();
  });

  test.each([
    ['2026-10-01T00:00:00.000Z', /^Your subscription ended on /],
    [null, /^You have no subscription/],
  ])('asks a user whose subscription ended (%s) to renew it, linking to it', async (paidUntil, said) => {
    setUp('t0k3n', { '/api/v2/me': [me(false, paidUntil)] });
    expect(await screen.findByRole('alert')).toHaveTextContent(said);
    expect(screen.getByRole('link', { name: 'Your subscription' })).toHaveAttribute('href', `${CATALOGUE}subscription`);
  });

  test('signs in: shows the code, opens the sign-in page, and once approved, whom it is signed in as', async () => {
    const { user, open, storage } = setUp(undefined, {
      '/auth/device/code': [codes()],
      '/auth/device/token': [Response.json({ access_token: 't0k3n' })],
      '/api/v2/me': [me(true, '2027-01-01T00:00:00.000Z')],
    });

    await user.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));

    expect(await screen.findByText('Signed in as crimson-bell-trail-58.')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(`${CATALOGUE}device?user_code=WDJBMJHT`);
    expect(storage.get(TOKEN_KEY)).toBe('t0k3n');
  });

  test('shows the code and the page while waiting, and cancels', async () => {
    const { user, send } = setUp(undefined, {
      '/auth/device/code': [codes()],
      '/auth/device/token': Array.from({ length: 50 }, () =>
        Response.json({ error: 'authorization_pending' }, { status: 400 }),
      ),
    });

    await user.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));

    expect(await screen.findByText('WDJBMJHT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the sign-in page again' })).toHaveAttribute(
      'href',
      `${CATALOGUE}device?user_code=WDJBMJHT`,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(send).toHaveBeenCalled();
  });

  test.each([
    ['denied', [Response.json({ error: 'access_denied' }, { status: 400 })], 'You denied this browser'],
    ['expired', [Response.json({ error: 'expired_token' }, { status: 400 })], 'The code expired'],
    ['failed', [new TypeError('Failed to fetch')], 'Signing in did not work'],
  ])('says a sign-in that ended %s did', async (_end, polls, said) => {
    const { user } = setUp(undefined, { '/auth/device/code': [codes()], '/auth/device/token': polls });
    await user.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));
    expect(await screen.findByRole('alert')).toHaveTextContent(said);
  });

  test('says while it asks for the codes', async () => {
    let answer: (response: Response) => void = () => undefined;
    const { user } = setUp(undefined, {});
    const pending = new Promise<Response>(resolve => {
      answer = resolve;
    });
    const send = vi.fn<typeof fetch>(() => pending);
    document.body.innerHTML = '';
    render(Account, { catalogue: CATALOGUE, openPage: vi.fn(), fetch: send });

    await user.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));

    expect(screen.getByText('Asking for a code to sign you in…')).toBeInTheDocument();
    answer(new Response('', { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in did not work');
  });

  test('says when the catalogue cannot be reached, and tries again', async () => {
    const { user } = setUp('t0k3n', {
      '/api/v2/me': [new TypeError('Failed to fetch'), me(true, null)],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent("EMMA's catalogue could not be reached.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Signed in as crimson-bell-trail-58.')).toBeInTheDocument();
  });

  test('says while it reads the sign-in', () => {
    installChromeMock({ storage: { [TOKEN_KEY]: 't0k3n' } });
    render(Account, { catalogue: CATALOGUE, openPage: vi.fn(), fetch: () => new Promise<Response>(() => undefined) });
    expect(screen.getByRole('status')).toHaveTextContent('Reading your sign-in…');
  });
});

describe('Account, signing in at the accounts', () => {
  const ACCOUNTS = 'https://accounts.example.test/';

  test('signs in at the accounts, opening their page, and links their profile and subscription, the catalogue saying who', async () => {
    installChromeMock();
    const asked: string[] = [];
    const send = vi.fn<typeof fetch>(input => {
      const url = new URL(input instanceof Request ? input.url : input);
      asked.push(url.href);
      if (url.pathname === '/auth/device/code') {
        return Promise.resolve(
          Response.json({
            device_code: 'dev1ce',
            user_code: 'WDJBMJHT',
            verification_uri_complete: `${ACCOUNTS}device?user_code=WDJBMJHT`,
            expires_in: 600,
            interval: 0,
          }),
        );
      }
      if (url.pathname === '/auth/device/token') return Promise.resolve(Response.json({ access_token: 't0k3n' }));
      return Promise.resolve(me(false, null));
    });
    const open = vi.fn();
    render(Account, { catalogue: CATALOGUE, accounts: ACCOUNTS, openPage: open, fetch: send });

    await userEvent.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));

    expect(await screen.findByText('Signed in as crimson-bell-trail-58.')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(`${ACCOUNTS}device?user_code=WDJBMJHT`);
    expect(asked).toContain(`${ACCOUNTS}auth/device/code`);
    expect(asked).toContain(`${ACCOUNTS}auth/device/token`);
    expect(asked).toContain(`${CATALOGUE}api/v2/me`);
    expect(screen.getByRole('link', { name: 'Your subscription' })).toHaveAttribute('href', `${ACCOUNTS}subscription`);
    expect(screen.getByRole('link', { name: 'your signed-in devices' })).toHaveAttribute('href', `${ACCOUNTS}profile`);
  });

  // Regression: since the accounts moved out of the catalogue, its sign-in page is theirs, which an extension that
  // took only the catalogue's refused, so no one could sign in.
  test("refuses a sign-in page that is not the accounts' own", async () => {
    installChromeMock();
    const send = vi.fn<typeof fetch>(input =>
      new URL(input instanceof Request ? input.url : input).pathname === '/auth/device/code'
        ? Promise.resolve(codes())
        : new Promise<Response>(() => undefined),
    );
    const open = vi.fn();
    render(Account, { catalogue: CATALOGUE, accounts: ACCOUNTS, openPage: open, fetch: send });
    await userEvent.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in did not work');
    expect(open).not.toHaveBeenCalled();
  });
});

describe('Options, with the catalogue', () => {
  test('shows the catalogue account in a build with a catalogue, and none without', () => {
    installChromeMock();
    const { unmount } = render(Options, { sites: [], catalogue: null });
    expect(screen.queryByRole('region', { name: "EMMA's catalogue" })).not.toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    render(Options, { sites: [], catalogue: CATALOGUE });
    expect(screen.getByRole('region', { name: "EMMA's catalogue" })).toBeInTheDocument();
  });

  test('opens the sign-in page in a new tab to sign in', async () => {
    const { chrome } = installChromeMock();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        new URL(input instanceof Request ? input.url : input).pathname === '/auth/device/code'
          ? Promise.resolve(codes())
          : new Promise<Response>(() => undefined),
      ),
    );
    render(Options, { sites: [], catalogue: CATALOGUE, accounts: null });

    await userEvent.click(await screen.findByRole('button', { name: "Sign in to EMMA's catalogue" }));

    await vi.waitFor(() => {
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${CATALOGUE}device?user_code=WDJBMJHT` });
    });
  });
});
