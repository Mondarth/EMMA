import { describe, expect, it, vi } from 'vitest';

import { searchesOnce } from '../../../src/lib/same-search';

describe('searchesOnce', () => {
  const kit = {};
  const inputs = { overview: { core: '14.368' }, universe: { core: [], releases: [{ version: '1.0.0' }] } };

  it('searches the first time', async () => {
    const search = vi.fn(() => Promise.resolve({ planner: 'first' }));
    expect(await searchesOnce<{ planner: string }>()(kit, inputs, search)).toEqual({ planner: 'first' });
    expect(search).toHaveBeenCalledOnce();
  });

  // Regression (to-do 41): Check live searched again, and the new search's planner had none of the last one's
  // completions, so opening a version list after it solved every version afresh, for seconds on a large install.
  it('gives the last search again, not searching, for the same installation, releases and kit', async () => {
    const once = searchesOnce<{ planner: string }>();
    const first = await once(kit, inputs, () => Promise.resolve({ planner: 'first' }));
    const again = vi.fn(() => Promise.resolve({ planner: 'second' }));
    const same = { overview: { core: '14.368' }, universe: { core: [], releases: [{ version: '1.0.0' }] } };
    expect(await once(kit, same, again)).toBe(first);
    expect(again).not.toHaveBeenCalled();
  });

  it('searches again when the releases differ', async () => {
    const once = searchesOnce<{ planner: string }>();
    await once(kit, inputs, () => Promise.resolve({ planner: 'first' }));
    const changed = { ...inputs, universe: { core: [], releases: [{ version: '1.0.1' }] } };
    expect(await once(kit, changed, () => Promise.resolve({ planner: 'second' }))).toEqual({ planner: 'second' });
  });

  it('searches again when the installation differs', async () => {
    const once = searchesOnce<{ planner: string }>();
    await once(kit, inputs, () => Promise.resolve({ planner: 'first' }));
    const changed = { ...inputs, overview: { core: '14.369' } };
    expect(await once(kit, changed, () => Promise.resolve({ planner: 'second' }))).toEqual({ planner: 'second' });
  });

  it('searches again with another kit, as a resolver updated with the module', async () => {
    const once = searchesOnce<{ planner: string }>();
    await once(kit, inputs, () => Promise.resolve({ planner: 'first' }));
    expect(await once({}, inputs, () => Promise.resolve({ planner: 'second' }))).toEqual({ planner: 'second' });
  });

  it('keeps no search that failed', async () => {
    const once = searchesOnce<{ planner: string }>();
    await expect(once(kit, inputs, () => Promise.reject(new Error('unreachable')))).rejects.toThrow('unreachable');
    expect(await once(kit, inputs, () => Promise.resolve({ planner: 'second' }))).toEqual({ planner: 'second' });
  });

  it('keeps only the last search', async () => {
    const once = searchesOnce<{ planner: string }>();
    await once(kit, inputs, () => Promise.resolve({ planner: 'first' }));
    const changed = { ...inputs, overview: { core: '14.369' } };
    await once(kit, changed, () => Promise.resolve({ planner: 'second' }));
    expect(await once(kit, inputs, () => Promise.resolve({ planner: 'third' }))).toEqual({ planner: 'third' });
  });
});
