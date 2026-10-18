import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import ModuleDrawer from '@component/ModuleDrawer.svelte';
import type { ModuleEntry } from '@module/adapters/modules';
import { installFoundryMocks } from '../mocks/foundry';
import { ENTRIES } from './fixtures';

const [DICE, EMMA, LIB_WRAPPER] = ENTRIES as [ModuleEntry, ModuleEntry, ModuleEntry];

/**
 * Render the drawer of a module.
 * @param entry - The module
 * @returns The drawer
 */
function renderDrawer(entry: ModuleEntry): HTMLElement {
  render(ModuleDrawer, { entry, id: 'drawer' });
  return document.getElementById('drawer') as HTMLElement;
}

/**
 * The value shown for a field.
 * @param term - The field's localization key
 * @returns The description element following the term
 */
function field(term: string): HTMLElement {
  return screen.getByText(term).nextElementSibling as HTMLElement;
}

describe('ModuleDrawer', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('has the ID its disclosure button controls', () => {
    expect(renderDrawer(DICE)).toHaveClass('emma-drawer');
  });

  test('shows the description as HTML', () => {
    renderDrawer(DICE);

    const description = field('MONDARTH-EMMA.Drawer.Description');
    expect(within(description).getByText('3D dice').tagName).toBe('STRONG');
  });

  describe('authors', () => {
    test('shows a single author inline, with their email link', () => {
      renderDrawer(LIB_WRAPPER);

      const authors = field('MONDARTH-EMMA.Drawer.Authors');
      expect(authors.querySelector('details')).toBeNull();
      expect(within(authors).getByText('ruipin')).toBeInTheDocument();
      expect(
        within(authors).getByRole('link', { name: 'MONDARTH-EMMA.Drawer.Email {"name":"ruipin"}' }),
      ).toHaveAttribute('href', 'mailto:ruipin@example.com');
    });

    test('lists several authors in a closed dropdown that opens', async () => {
      renderDrawer(DICE);

      const authors = field('MONDARTH-EMMA.Drawer.Authors');
      const details = authors.querySelector('details') as HTMLDetailsElement;
      expect(details).not.toHaveAttribute('open');
      expect(within(authors).getByText('MONDARTH-EMMA.Drawer.AuthorCount {"count":"2"}')).toBeInTheDocument();

      await userEvent.click(within(authors).getByText('MONDARTH-EMMA.Drawer.AuthorCount {"count":"2"}'));

      expect(details).toHaveAttribute('open');
      expect(
        within(authors)
          .getAllByRole('listitem')
          .map(item => item.textContent.replace(/\s+/g, ' ').trim()),
      ).toEqual(['Simone simone#1', 'JDW']);
    });

    test('links an author to their web page, in a new tab', () => {
      renderDrawer(DICE);

      const link = screen.getByRole('link', { name: 'Simone' });
      expect(link).toHaveAttribute('href', 'https://example.com/simone');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('shows an author’s Discord name, which has no link', () => {
      renderDrawer(DICE);

      expect(screen.getByRole('img', { name: 'MONDARTH-EMMA.Drawer.Discord' }).parentElement).toHaveTextContent(
        'simone#1',
      );
      expect(screen.queryByRole('link', { name: /simone#1/ })).toBeNull();
    });
  });

  describe('languages', () => {
    test('shows a single language inline, marked with its tag', () => {
      renderDrawer(LIB_WRAPPER);

      const languages = field('MONDARTH-EMMA.Drawer.Languages');
      expect(languages.querySelector('details')).toBeNull();
      expect(within(languages).getByText('English')).toHaveAttribute('lang', 'en');
    });

    test('lists several languages in a dropdown, with their tags', () => {
      renderDrawer(DICE);

      const languages = field('MONDARTH-EMMA.Drawer.Languages');
      expect(within(languages).getByText('MONDARTH-EMMA.Drawer.LanguageCount {"count":"2"}')).toBeInTheDocument();
      expect(
        within(languages)
          .getAllByRole('listitem', { hidden: true })
          .map(item => item.textContent),
      ).toEqual(['English (en)', 'Français (fr)']);
    });
  });

  test('leaves out the fields a module does not give', () => {
    const entry: ModuleEntry = { ...LIB_WRAPPER, description: '', languages: [] };
    renderDrawer(entry);

    expect(screen.queryByText('MONDARTH-EMMA.Drawer.Description')).toBeNull();
    expect(screen.queryByText('MONDARTH-EMMA.Drawer.Languages')).toBeNull();
    expect(screen.getByText('MONDARTH-EMMA.Drawer.Authors')).toBeInTheDocument();
  });

  test('says so when the module gives no details', () => {
    const drawer = renderDrawer(EMMA);

    expect(drawer).toHaveTextContent('MONDARTH-EMMA.Drawer.Empty');
    expect(drawer.querySelector('dl')).toBeNull();
  });
});
