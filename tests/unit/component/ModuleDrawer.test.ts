import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, test } from 'vitest';

import ModuleDrawer from '@component/ModuleDrawer.svelte';
import type { ModuleEntry } from '@module/adapters/modules';
import type { DrawerField } from '@module/state/drawer-fields.svelte';
import { DRAWER_FIELDS, DrawerFields } from '@module/state/drawer-fields.svelte';
import { installFoundryMocks } from '../mocks/foundry';
import { ENTRIES } from './fixtures';

const [DICE, EMMA, LIB_WRAPPER] = ENTRIES as [ModuleEntry, ModuleEntry, ModuleEntry];

/**
 * Render the drawer of a module.
 * @param entry - The module
 * @param fields - The details shown; the defaults unless a test says otherwise
 * @returns The drawer
 */
function renderDrawer(entry: ModuleEntry, fields = new DrawerFields()): HTMLElement {
  render(ModuleDrawer, { entry, id: 'drawer', fields });
  return document.getElementById('drawer') as HTMLElement;
}

/**
 * The value shown for a field.
 * @param name - The field
 * @returns The description element following the field's term
 */
function field(name: DrawerField): HTMLElement {
  return screen.getByText(`MONDARTH-EMMA.Drawer.Field.${name}`).nextElementSibling as HTMLElement;
}

/**
 * The text of each item in a list, with its whitespace collapsed.
 * @param container - The element holding the list
 * @returns The texts
 */
function itemTexts(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole('listitem', { hidden: true })
    .map(item => item.textContent.replace(/\s+/g, ' ').trim());
}

describe('ModuleDrawer', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('has the ID its disclosure button controls', () => {
    expect(renderDrawer(DICE)).toHaveClass('emma-drawer');
  });

  test('shows the description, authors and languages by default', () => {
    renderDrawer(DICE);

    expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual([
      'MONDARTH-EMMA.Drawer.Field.description',
      'MONDARTH-EMMA.Drawer.Field.authors',
      'MONDARTH-EMMA.Drawer.Field.languages',
    ]);
  });

  test('shows every field chosen that the module gives, in a fixed order', () => {
    renderDrawer(DICE, new DrawerFields(['id', 'packs', 'description', 'library']));

    expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual([
      'MONDARTH-EMMA.Drawer.Field.description',
      'MONDARTH-EMMA.Drawer.Field.packs',
      'MONDARTH-EMMA.Drawer.Field.id',
    ]);
  });

  test('follows a change to the fields chosen while it is open', () => {
    const fields = new DrawerFields();
    renderDrawer(DICE, fields);

    fields.set(['id']);
    flushSync();

    expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual(['MONDARTH-EMMA.Drawer.Field.id']);
  });

  test('shows the description as HTML', () => {
    renderDrawer(DICE);

    const description = field('description');
    expect(within(description).getByText('3D dice').tagName).toBe('STRONG');
  });

  describe('authors', () => {
    test('shows a single author inline, with their email link', () => {
      renderDrawer(LIB_WRAPPER);

      const authors = field('authors');
      expect(authors.querySelector('details')).toBeNull();
      expect(within(authors).getByText('ruipin')).toBeInTheDocument();
      expect(
        within(authors).getByRole('link', { name: 'MONDARTH-EMMA.Drawer.Email {"name":"ruipin"}' }),
      ).toHaveAttribute('href', 'mailto:ruipin@example.com');
    });

    test('lists several authors in a closed dropdown that opens', async () => {
      renderDrawer(DICE);

      const authors = field('authors');
      const details = authors.querySelector('details') as HTMLDetailsElement;
      expect(details).not.toHaveAttribute('open');

      await userEvent.click(within(authors).getByText('MONDARTH-EMMA.Drawer.Count.authors {"count":"2"}'));

      expect(details).toHaveAttribute('open');
      expect(itemTexts(authors)).toEqual(['Simone simone#1', 'JDW']);
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

      const languages = field('languages');
      expect(languages.querySelector('details')).toBeNull();
      expect(within(languages).getByText('English')).toHaveAttribute('lang', 'en');
      expect(languages).toHaveTextContent('English (en)');
    });

    test('lists several languages in a dropdown, with their tags', () => {
      renderDrawer(DICE);

      const languages = field('languages');
      expect(within(languages).getByText('MONDARTH-EMMA.Drawer.Count.languages {"count":"2"}')).toBeInTheDocument();
      expect(itemTexts(languages)).toEqual(['English (en)', 'Français (fr)']);
    });
  });

  test('links to each web page the manifest gives, in a new tab', () => {
    renderDrawer(DICE, new DrawerFields(['links']));

    const links = within(field('links')).getAllByRole('link');
    expect(links.map(link => [link.textContent.trim(), link.getAttribute('href')])).toEqual([
      ['MONDARTH-EMMA.Drawer.Link.url', 'https://example.com/dice'],
      ['MONDARTH-EMMA.Drawer.Link.readme', 'https://foundry.example/modules/dice/README.md'],
    ]);
    for (const link of links) expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('shows the compatible Foundry versions the manifest gives', () => {
    renderDrawer(DICE, new DrawerFields(['compatibility']));

    expect(itemTexts(field('compatibility'))).toEqual([
      'MONDARTH-EMMA.Drawer.Compatibility.minimum 13',
      'MONDARTH-EMMA.Drawer.Compatibility.verified 14.368',
    ]);
  });

  describe('relationships', () => {
    test('shows a single related package inline, with the reason given', () => {
      renderDrawer(DICE, new DrawerFields(['requires', 'conflicts']));

      expect(field('requires').querySelector('details')).toBeNull();
      expect(field('requires')).toHaveTextContent('libWrapper Wraps the dice roller.');
      expect(field('conflicts')).toHaveTextContent(/^\s*old-dice\s*$/);
    });

    test('lists several related packages in a dropdown', () => {
      renderDrawer(DICE, new DrawerFields(['recommends', 'systems']));

      expect(field('recommends')).toHaveTextContent('MONDARTH-EMMA.Drawer.Count.recommends {"count":"2"}');
      expect(itemTexts(field('recommends'))).toEqual(['EMMA', 'dice-tray A tray for the dice.']);
      expect(itemTexts(field('systems'))).toEqual(['D&D Fifth Edition', 'pf2e']);
    });

    test('names the type of a related package that is not the one the relationship implies', () => {
      const entry: ModuleEntry = {
        ...LIB_WRAPPER,
        relationships: {
          ...LIB_WRAPPER.relationships,
          requires: [{ id: 'dnd5e', type: 'system', title: 'D&D Fifth Edition' }],
        },
      };
      renderDrawer(entry, new DrawerFields(['requires']));

      expect(field('requires')).toHaveTextContent('D&D Fifth Edition (MONDARTH-EMMA.Drawer.Type.system)');
    });
  });

  test('shows the compendium packs, with the type of document each holds', () => {
    renderDrawer(DICE, new DrawerFields(['packs']));

    expect(itemTexts(field('packs'))).toEqual(['Dice Macros (Macro)', 'Dice Tables (RollTable)']);
  });

  test('says when a module is a library', () => {
    renderDrawer(LIB_WRAPPER, new DrawerFields(['library']));
    expect(field('library')).toHaveTextContent('MONDARTH-EMMA.Drawer.IsLibrary');
  });

  test('shows the module ID', () => {
    renderDrawer(EMMA, new DrawerFields(['id']));

    expect(within(field('id')).getByText('emma').tagName).toBe('CODE');
  });

  test('shows every field a module gives when all are chosen', () => {
    renderDrawer(DICE, new DrawerFields(DRAWER_FIELDS));

    expect(screen.getAllByRole('term')).toHaveLength(DRAWER_FIELDS.length - 1);
    expect(screen.queryByText('MONDARTH-EMMA.Drawer.Field.library')).toBeNull();
  });

  test('leaves out the fields a module does not give', () => {
    const entry: ModuleEntry = { ...LIB_WRAPPER, description: '', languages: [] };
    renderDrawer(entry);

    expect(screen.queryByText('MONDARTH-EMMA.Drawer.Field.description')).toBeNull();
    expect(screen.queryByText('MONDARTH-EMMA.Drawer.Field.languages')).toBeNull();
    expect(screen.getByText('MONDARTH-EMMA.Drawer.Field.authors')).toBeInTheDocument();
  });

  test('says so when the module gives none of the fields chosen', () => {
    const drawer = renderDrawer(EMMA);

    expect(drawer).toHaveTextContent('MONDARTH-EMMA.Drawer.Empty');
    expect(drawer.querySelector('dl')).toBeNull();
  });

  test('says how to choose fields when none are chosen', () => {
    const drawer = renderDrawer(DICE, new DrawerFields([]));

    expect(drawer).toHaveTextContent('MONDARTH-EMMA.Drawer.NoneChosen');
    expect(drawer.querySelector('dl')).toBeNull();
  });
});
