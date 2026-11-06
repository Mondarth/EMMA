import { describe, expect, test, vi } from 'vitest';

import { readListing } from '../../../src/foundry/listing';
import { KIT } from '../../mocks/kit';

const CATALOGUE = { url: 'https://catalogue.example.test/', key: 'catalogue-k3y' };

/**
 * A line of builds a package's listing gives a version for.
 * @param version - The version
 * @param more - Its builds and manifest
 * @returns The version, as the catalogue lists it
 */
function line(version: string, more: Record<string, string> = {}) {
  return { version, minimum: null, maximum: null, verified: null, manifest: null, notes: null, ...more };
}

/**
 * A package as the catalogue's listing gives it.
 * @param id - Its ID
 * @param more - What else it has
 * @returns The package
 */
function listed(id: string, more: Record<string, unknown> = {}) {
  return {
    package: { type: 'module', id },
    title: id,
    summary: null,
    author: null,
    url: null,
    tags: [],
    systems: [],
    premium: false,
    exclusive: false,
    latest: null,
    versions: [line('1.0.0')],
    ...more,
  };
}

/**
 * A fetch that answers the catalogue's listing.
 * @param answer - The listing, or a status to fail with
 * @returns The fetch, a spy
 */
function catalogue(answer: unknown) {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      typeof answer === 'number'
        ? new Response('Failed', { status: answer })
        : new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } }),
    ),
  );
}

describe('readListing', () => {
  test("reads Foundry's listing from the catalogue, sorted by title, at the versions for the installed build", async () => {
    const send = catalogue({
      asOf: null,
      packages: [
        listed('midi', {
          title: 'Midi QOL',
          summary: '<p>Automates\n  <b>combat</b>.</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
          author: 'tposney',
          url: 'https://example.org/midi',
          tags: ['combat', 'automation'],
          systems: ['dnd5e'],
          exclusive: true,
          versions: [
            line('12.4.0', { minimum: '12', maximum: '13', manifest: 'https://example.org/midi/12/module.json' }),
            line('13.0.1', { minimum: '14', verified: '14.368', manifest: 'https://example.org/midi/module.json' }),
            // A line for a newer build than the one installed is not offered.
            line('15.0.0', { minimum: '15' }),
          ],
        }),
        listed('dice', { title: 'Dice', premium: true }),
        // A web page or manifest that is not one is left out, and an empty description.
        listed('paid', {
          title: 'Paid',
          premium: true,
          url: 'javascript:alert(1)',
          summary: ' ',
          author: '',
          versions: [line('2.0.0', { manifest: 'file:///etc/module.json' })],
        }),
        // A package with no version for any build offers the newest.
        listed('ahead', {
          title: 'Ahead',
          versions: [line('1.0.0', { minimum: '15' }), line('2.0.0', { minimum: '16' })],
        }),
        listed('empty', { versions: [] }),
      ],
    });
    const owned = vi.fn(() => Promise.resolve(new Set(['module:dice'])));

    const packages = await readListing('module', {
      kit: KIT,
      catalogue: CATALOGUE,
      clientVersion: '0.3.0',
      fetch: send,
      core: '14.368',
      owned,
    });

    expect(packages).toEqual([
      {
        type: 'module',
        id: 'ahead',
        title: 'Ahead',
        version: '2.0.0',
        compatibility: { minimum: '16' },
        systems: [],
        unowned: false,
      },
      {
        type: 'module',
        id: 'dice',
        title: 'Dice',
        version: '1.0.0',
        compatibility: {},
        systems: [],
        unowned: false,
        premium: true,
      },
      {
        type: 'module',
        id: 'midi',
        title: 'Midi QOL',
        version: '13.0.1',
        author: 'tposney',
        authors: ['tposney'],
        compatibility: { minimum: '14', verified: '14.368' },
        systems: ['dnd5e'],
        unowned: false,
        // Its description's text alone: what the HTML would run or load is gone.
        description: 'Automates combat.',
        url: 'https://example.org/midi',
        manifest: 'https://example.org/midi/module.json',
        tags: ['combat', 'automation'],
        exclusive: true,
      },
      {
        type: 'module',
        id: 'paid',
        title: 'Paid',
        version: '2.0.0',
        compatibility: {},
        systems: [],
        unowned: true,
        premium: true,
      },
    ]);
    const [[input, init] = []] = send.mock.calls;
    expect(input instanceof Request ? input.url : input?.toString()).toBe(
      'https://catalogue.example.test/api/v2/listing?type=module',
    );
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('catalogue-k3y');
    expect(new Headers(init?.headers).get('X-Catalogue-Client')).toBe('EMMA-extension/0.3.0');
    expect(owned).toHaveBeenCalledOnce();
  });

  test('asks nothing of what the user owns where no package is premium; a system names no systems', async () => {
    const owned = vi.fn(() => Promise.resolve(new Set<string>()));
    const send = catalogue({
      asOf: null,
      packages: [listed('pf2e', { package: { type: 'system', id: 'pf2e' }, systems: ['odd'] })],
    });

    const [system] = await readListing('system', {
      kit: KIT,
      catalogue: CATALOGUE,
      fetch: send,
      core: '14.368',
      owned,
    });

    expect(system).toMatchObject({ type: 'system', id: 'pf2e', systems: [] });
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).has('X-Catalogue-Client')).toBe(false);
    expect(owned).not.toHaveBeenCalled();
  });

  test('fails without a catalogue, or when it cannot be reached', async () => {
    const owned = () => Promise.resolve(new Set<string>());

    await expect(readListing('module', { kit: KIT, catalogue: null, core: '14.368', owned })).rejects.toThrow(
      'no package catalogue',
    );
    await expect(
      readListing('module', { kit: KIT, catalogue: CATALOGUE, fetch: catalogue(503), core: '14.368', owned }),
    ).rejects.toThrow('http');
  });
});
