import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { SITES_KEY } from '../../../src/browser/api';
import Options from '../../../src/component/Options.svelte';
import type { Site } from '../../../src/lib/sites';
import { installChromeMock } from '../../mocks/chrome';

const LOCAL = 'http://localhost:30000';
const REMOTE = 'https://vtt.example.com';

/**
 * Render the options page.
 * @param sites - The servers remembered
 * @returns The mocks and a user to act with
 */
function setUp(sites: Site[]) {
  const mocks = installChromeMock({ storage: { [SITES_KEY]: sites } });
  render(Options, { sites });
  return { ...mocks, user: userEvent.setup() };
}

describe('Options', () => {
  test('says when EMMA is active on no server', () => {
    setUp([]);

    expect(screen.getByText(/not active on any server/)).toBeInTheDocument();
  });

  test('lists the servers, switching how EMMA opens on each, and forgetting them', async () => {
    const { user, storage } = setUp([
      { origin: LOCAL, auto: true },
      { origin: REMOTE, auto: false },
    ]);
    expect(screen.getByRole('checkbox', { name: `Open EMMA by itself on ${LOCAL}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Open EMMA by itself on ${REMOTE}` })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: `Open EMMA by itself on ${REMOTE}` }));
    expect(storage.get(SITES_KEY)).toEqual([
      { origin: LOCAL, auto: true },
      { origin: REMOTE, auto: true },
    ]);

    await user.click(screen.getByRole('button', { name: `Forget ${LOCAL}` }));
    expect(storage.get(SITES_KEY)).toEqual([{ origin: REMOTE, auto: true }]);
    expect(screen.queryByText(LOCAL)).toBeNull();
  });
});
