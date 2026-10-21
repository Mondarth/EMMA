import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { joinAs, MODULE_ID, MODULE_TITLE, USERS } from '../support/foundry';

const EMMA_TITLE = 'EMMA - module management';
const EMMA_WINDOW = `#${MODULE_ID}-app`;

/**
 * Open the Settings tab of the sidebar and return its Module Management button. The button is found by the markup
 * EMMA's interception relies on (`src/module/foundry/settings-entry.ts`), so a change to it in Foundry fails here.
 * @param page - A page showing the game view
 * @returns The button
 */
async function moduleManagementButton(page: Page) {
  // Click the tab as a user would: unlike `Sidebar#changeTab`, a click also expands a collapsed sidebar.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const button = page.locator('#settings [data-action="openApp"][data-app="modules"]');
  await expect(button).toBeVisible();
  return button;
}

/**
 * Set whether EMMA is disabled in the test world.
 * @param page - A page logged in as the GM
 * @param disabled - The value to store
 */
async function setDisabled(page: Page, disabled: boolean): Promise<void> {
  await page.evaluate(
    async ([id, value]) => {
      await game.settings.set(id, 'disabled', value);
    },
    [MODULE_ID, disabled] as const,
  );
}

/**
 * Save the view EMMA shows the logged-in user.
 * @param page - A logged-in page
 * @param view - The view to store
 */
async function setView(page: Page, view: 'list' | 'split'): Promise<void> {
  await page.evaluate(
    async ([id, value]) => {
      await game.settings.set(id, 'view', value);
    },
    [MODULE_ID, view] as const,
  );
}

/**
 * Close the EMMA window, if it is open, through Foundry's public registry of open applications, discarding any changes
 * staged in it without asking.
 * @param page - A logged-in page
 */
async function closeEmma(page: Page): Promise<void> {
  await page.evaluate(async id => {
    // EMMA's window takes a `discard` option that Foundry's base type does not declare.
    const app = foundry.applications.instances.get(id) as
      { close(options: { discard: boolean }): Promise<unknown> } | undefined;
    await app?.close({ discard: true });
  }, `${MODULE_ID}-app`);
  await expect(page.locator(EMMA_WINDOW)).toHaveCount(0);
}

test.describe('Module Management', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
  });

  test.afterEach(async ({ page }) => {
    await setDisabled(page, false);
  });

  test('the Settings sidebar opens EMMA instead of Module Management', async ({ page }) => {
    await (await moduleManagementButton(page)).click();

    await expect(page.getByText(EMMA_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator('#module-management')).toHaveCount(0);
  });

  test('a second click brings back the same window', async ({ page }) => {
    const button = await moduleManagementButton(page);

    await button.click();
    await button.click();

    await expect(page.getByText(EMMA_TITLE, { exact: true })).toHaveCount(1);
  });

  test('Disable EMMA restores Module Management without a reload', async ({ page }) => {
    await setDisabled(page, true);

    await (await moduleManagementButton(page)).click();

    await expect(page.locator('#module-management')).toBeVisible();
    await expect(page.getByText(EMMA_TITLE, { exact: true })).toHaveCount(0);
  });
});

const LIBRARY = { id: 'emma-fixture-library', title: 'EMMA Fixture Library' } as const;
const ADDON = { id: 'emma-fixture-addon', title: 'EMMA Fixture Add-on' } as const;
const RIVAL = { id: 'emma-fixture-rival', title: 'EMMA Fixture Rival' } as const;

test.describe('EMMA views', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await setView(page, 'list');
  });

  test('the list view shows every installed module with its activation', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);

    await expect(emma.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(emma.getByRole('checkbox', { name: MODULE_TITLE })).toBeChecked();
    const installed = await page.evaluate(() => game.modules.size);
    await expect(emma.getByRole('list', { name: 'Installed modules' }).getByRole('listitem')).toHaveCount(installed);
  });

  test('both views count the active and inactive modules beside their titles', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const active = await page.evaluate(() => game.modules.filter(pkg => pkg.active).length);
    const inactive = (await page.evaluate(() => game.modules.size)) - active;

    await expect(emma.getByRole('heading', { name: /Installed modules/ })).toHaveText(
      `Installed modules Active (${active}) Inactive (${inactive})`,
      { useInnerText: true },
    );

    await emma.getByRole('button', { name: 'Split view' }).click();

    await expect(emma.getByRole('heading', { name: /^Inactive/ })).toHaveText(`Inactive (${inactive})`, {
      useInnerText: true,
    });
    await expect(emma.getByRole('heading', { name: /^Active/ })).toHaveText(`Active (${active})`, {
      useInnerText: true,
    });
  });

  test('versions carry the compatibility badge Foundry gives them', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const expected = await page.evaluate(id => game.modules.get(id)?.getVersionBadge() ?? null, LIBRARY.id);
    expect(expected).not.toBeNull();

    const row = emma.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: LIBRARY.title }) });
    const badge = row.locator('[data-tooltip-html]');

    await expect(badge).toHaveClass(new RegExp(`\\b${expected?.type ?? ''}\\b`));
    await expect(badge).toContainText('1.0.0');
  });

  test('a change staged in the list view is not saved', async ({ page }) => {
    await (await moduleManagementButton(page)).click();

    await page.locator(EMMA_WINDOW).getByRole('checkbox', { name: MODULE_TITLE }).uncheck();

    const saved = await page.evaluate(id => game.settings.get('core', 'moduleConfiguration')[id], MODULE_ID);
    expect(saved).toBe(true);
  });

  test('the view chosen is remembered when EMMA reopens', async ({ page }) => {
    const button = await moduleManagementButton(page);
    await button.click();
    const emma = page.locator(EMMA_WINDOW);

    await emma.getByRole('button', { name: 'Split view' }).click();
    await expect(emma.getByRole('treegrid', { name: /^Active/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => game.settings.get('mondarth-emma', 'view'))).toBe('split');

    await closeEmma(page);
    await button.click();

    await expect(emma.getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(emma.getByRole('list', { name: 'Installed modules' })).toHaveCount(0);
  });

  test('the split view moves modules between the inactive and active sides without saving', async ({ page }) => {
    await setView(page, 'split');
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const inactive = emma.getByRole('treegrid', { name: /^Inactive/ });
    const active = emma.getByRole('treegrid', { name: /^Active/ });
    const deactivate = emma.getByRole('button', { name: 'Deactivate the selected modules', exact: true });
    const activate = emma.getByRole('button', { name: 'Activate the selected modules', exact: true });
    const emmaOption = (side: typeof active) => side.getByRole('row', { name: MODULE_TITLE, exact: true });

    await expect(deactivate).toBeDisabled();
    await expect(activate).toBeDisabled();

    await emmaOption(active).click();
    await expect(emmaOption(active)).toHaveAttribute('aria-selected', 'true');
    await deactivate.click();

    await expect(emmaOption(inactive)).toHaveAttribute('aria-selected', 'true');
    await expect(emmaOption(active)).toHaveCount(0);

    await activate.click();
    await expect(emmaOption(active)).toBeVisible();

    const saved = await page.evaluate(id => game.settings.get('core', 'moduleConfiguration')[id], MODULE_ID);
    expect(saved).toBe(true);
  });

  test('the split view lists can be driven from the keyboard', async ({ page }) => {
    await setView(page, 'split');
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const active = emma.getByRole('treegrid', { name: /^Active/ });

    await active.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ControlOrMeta+a');

    const count = await active.getByRole('row').count();
    await expect(active.getByRole('row', { selected: true })).toHaveCount(count);
    await expect(emma.getByRole('button', { name: 'Deactivate the selected modules', exact: true })).toBeEnabled();
  });
});

test.describe('Details drawers', () => {
  const SHOW = `Show details of ${LIBRARY.title}`;
  const HIDE = `Hide details of ${LIBRARY.title}`;

  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await setView(page, 'list');
  });

  test('the list view opens a module’s drawer below it, and closes it', async ({ page }) => {
    await setView(page, 'list');
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const checkbox = emma.getByRole('checkbox', { name: LIBRARY.title });

    await emma.getByRole('button', { name: SHOW }).click();

    const drawer = emma.locator(`#${await emma.getByRole('button', { name: HIDE }).getAttribute('aria-controls')}`);
    await expect(drawer.getByText('end-to-end tests activate and deactivate')).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'EMMA tests' })).toHaveAttribute(
      'href',
      'https://github.com/Mondarth/EMMA',
    );
    await drawer.getByText('2 languages').click();
    await expect(drawer.getByText('Français (fr)')).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await checkbox.focus();
    await page.keyboard.press('ArrowRight');

    await expect(drawer).toHaveCount(0);
    await expect(emma.getByRole('button', { name: SHOW })).toHaveAttribute('aria-expanded', 'false');
  });

  test('the toolbar button opens every drawer, then closes them all', async ({ page }) => {
    await setView(page, 'list');
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const triangles = emma.getByRole('button', { name: /^(Show|Hide) details of / });
    const installed = await page.evaluate(() => game.modules.size);

    await emma.getByRole('button', { name: 'Expand all module details' }).click();

    await expect(triangles.and(emma.locator('[aria-expanded="true"]'))).toHaveCount(installed);

    await emma.getByRole('button', { name: 'Collapse all module details' }).click();

    await expect(triangles.and(emma.locator('[aria-expanded="true"]'))).toHaveCount(0);
    await expect(emma.getByRole('button', { name: 'Expand all module details' })).toBeVisible();
  });

  test('the split view opens drawers without changing the selection', async ({ page }) => {
    await setView(page, 'split');
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const inactive = emma.getByRole('treegrid', { name: /^Inactive/ });
    const library = inactive.getByRole('row', { name: LIBRARY.title, exact: true });
    // The rival requires nothing, so clicking it selects it alone.
    const rival = inactive.getByRole('row', { name: RIVAL.title, exact: true });

    await rival.click();
    await inactive.getByRole('button', { name: SHOW }).click();

    await expect(library).toHaveAttribute('aria-expanded', 'true');
    await expect(inactive.getByText('end-to-end tests activate and deactivate')).toBeVisible();
    await expect(inactive.getByRole('row', { selected: true })).toHaveCount(1);
    await expect(rival).toHaveAttribute('aria-selected', 'true');

    // The keyboard is on the rival, which was clicked: the right arrow key opens its drawer too.
    await inactive.focus();
    await page.keyboard.press('ArrowRight');

    await expect(rival).toHaveAttribute('aria-expanded', 'true');
    await expect(library).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(rival).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Choosing the details drawers show', () => {
  const SHOW = `Show details of ${ADDON.title}`;
  const HIDE = `Hide details of ${ADDON.title}`;

  /**
   * Save the details the logged-in user's drawers show.
   * @param page - A logged-in page
   * @param fields - The fields, or `null` for the defaults
   */
  async function setDrawerFields(page: Page, fields: string[] | null): Promise<void> {
    await page.evaluate(
      async ([id, value]) => {
        const setting = game.settings.settings.get(`${id}.drawerFields`);
        await game.settings.set(id, 'drawerFields', value ?? (setting?.default as string[]));
      },
      [MODULE_ID, fields] as const,
    );
  }

  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.player);
    await setDrawerFields(page, null);
    await setView(page, 'list');
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await setDrawerFields(page, null);
  });

  test('closing the menu with the choice changed and not saved asks first', async ({ page }) => {
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Game Settings' }).click();
    const settings = page.locator('#settings-config');
    await settings.getByRole('button', { name: MODULE_TITLE }).click();
    await settings.getByRole('button', { name: 'Choose details' }).click();
    const menuWindow = `#${MODULE_ID}-fields`;
    const menu = page.locator(menuWindow);
    const links = menu.getByRole('checkbox', { name: 'Links' });
    const question = page.locator(`#${MODULE_ID}-fields-discard`);

    await links.check();
    await clickClose(page, menuWindow);

    await expect(question.getByRole('heading', { name: 'Discard your changes?' })).toBeVisible();
    await question.getByRole('button', { name: 'Keep editing' }).click();
    await expect(question).toHaveCount(0);
    await expect(links).toBeChecked();

    await clickClose(page, menuWindow);
    await question.getByRole('button', { name: 'Discard and close' }).click();

    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => game.settings.get('mondarth-emma', 'drawerFields'))).toEqual([
      'description',
      'authors',
      'languages',
    ]);
  });

  test('a player chooses them under Game Settings, and open drawers follow', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    await emma.getByRole('button', { name: SHOW }).click();
    const drawer = emma.locator(`#${await emma.getByRole('button', { name: HIDE }).getAttribute('aria-controls')}`);
    await expect(drawer.getByText('Authors', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Links', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Game Settings' }).click();
    const settings = page.locator('#settings-config');
    await settings.getByRole('button', { name: MODULE_TITLE }).click();
    await settings.getByRole('button', { name: 'Choose details' }).click();
    const menu = page.locator(`#${MODULE_ID}-fields`);
    await expect(menu.getByRole('checkbox', { name: 'Authors' })).toBeChecked();
    await menu.getByRole('checkbox', { name: 'Authors' }).uncheck();
    await menu.getByRole('checkbox', { name: 'Links' }).check();
    await menu.getByRole('checkbox', { name: 'Requires' }).check();
    await menu.getByRole('button', { name: 'Save' }).click();

    await expect(menu).toHaveCount(0);
    await expect(drawer.getByText('Authors', { exact: true })).toHaveCount(0);
    const readme = drawer.getByRole('link', { name: 'Readme' });
    expect(new URL((await readme.getAttribute('href')) ?? '').pathname).toBe(`/modules/${ADDON.id}/README.md`);
    await expect(drawer.getByRole('link', { name: 'Report a bug' })).toHaveAttribute(
      'href',
      'https://github.com/Mondarth/EMMA/issues',
    );
    await expect(drawer.getByText(LIBRARY.title, { exact: true })).toBeVisible();
    await expect(drawer.getByText('It adds to what the library does.')).toBeVisible();
    expect(await page.evaluate(() => game.settings.get('mondarth-emma', 'drawerFields'))).toEqual([
      'description',
      'languages',
      'links',
      'requires',
    ]);
  });
});

/**
 * Save the fixture modules as inactive again, without reloading, so each test starts from the same activation.
 * @param page - A page logged in as the GM
 */
async function deactivateFixtures(page: Page): Promise<void> {
  await page.evaluate(
    async ids => {
      const saved = game.settings.get('core', 'moduleConfiguration');
      await game.settings.set('core', 'moduleConfiguration', {
        ...saved,
        ...Object.fromEntries(ids.map(id => [id, false])),
      });
    },
    [LIBRARY.id, ADDON.id, RIVAL.id],
  );
}

/**
 * Read whether the world has saved a module as active.
 * @param page - A logged-in page
 * @param id - The module ID
 * @returns Whether it is saved as active
 */
async function savedActive(page: Page, id: string): Promise<boolean> {
  return page.evaluate(moduleId => game.settings.get('core', 'moduleConfiguration')[moduleId] === true, id);
}

test.describe('Saving', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
    await deactivateFixtures(page);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await deactivateFixtures(page);
  });

  test('Save saves the staged changes and asks to reload', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const save = emma.getByRole('button', { name: 'Save', exact: true });

    await expect(save).toBeDisabled();
    await emma.getByRole('checkbox', { name: LIBRARY.title }).check();
    await expect(emma.getByRole('status')).toHaveText('Changes staged: 1');
    await save.click();

    const prompt = page.locator('#reload-world-confirm');
    await expect(prompt).toBeVisible();
    expect(await savedActive(page, LIBRARY.id)).toBe(true);

    // Decline the reload: the activation is already saved, and the tests keep their session.
    await prompt.getByRole('button', { name: 'No' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(save).toBeDisabled();
  });

  test('Reset discards the staged changes', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const library = emma.getByRole('checkbox', { name: LIBRARY.title });

    await library.check();
    await emma.getByRole('button', { name: 'Reset', exact: true }).click();

    await expect(library).not.toBeChecked();
    await expect(emma.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });

  test('a module a checked module requires is locked, saying why, in both views', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const library = emma.getByRole('checkbox', { name: LIBRARY.title });
    const why = `${LIBRARY.title} is required by ${ADDON.title}, so it must stay active while it is.`;

    await emma.getByRole('checkbox', { name: ADDON.title }).check();

    await expect(library).toBeChecked();
    await expect(library).toBeDisabled();
    await emma
      .locator('.emma-module-row')
      .filter({ has: page.getByRole('checkbox', { name: LIBRARY.title }) })
      .hover();
    await expect(page.locator('#tooltip')).toHaveText(why);
    await expect(emma.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    await emma.getByRole('button', { name: 'Split view' }).click();
    const row = emma.getByRole('treegrid', { name: /^Active/ }).getByRole('row', { name: LIBRARY.title, exact: true });
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    // Forced, since Playwright will not click a row marked disabled; a user can, and nothing happens.
    await row.click({ force: true });
    await expect(row).toHaveAttribute('aria-selected', 'false');
    await expect(emma.getByRole('button', { name: 'Deactivate the selected modules', exact: true })).toBeDisabled();
  });
});

test.describe('Related modules in the list view', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
    await deactivateFixtures(page);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
  });

  test('checking a module checks what it requires and groups related modules under it', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const titles = emma.locator('.emma-module-title');
    const addon = emma.getByRole('checkbox', { name: ADDON.title });

    await addon.check();

    const order = await titles.allTextContents();
    const at = order.indexOf(ADDON.title);
    expect(order.slice(at, at + 3)).toEqual([ADDON.title, LIBRARY.title, RIVAL.title]);
    expect(order.filter(title => title === LIBRARY.title)).toHaveLength(1);
    await expect(emma.getByRole('checkbox', { name: LIBRARY.title })).toBeChecked();
    await expect(emma.getByRole('checkbox', { name: RIVAL.title })).not.toBeChecked();

    const library = emma.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: LIBRARY.title }) });
    const rival = emma.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: RIVAL.title }) });
    await expect(library.getByRole('img', { name: 'Required', exact: true })).toBeVisible();
    await expect(rival.getByRole('img', { name: 'Recommended', exact: true })).toBeVisible();
    // The rival conflicts with the library, now checked.
    await expect(rival.getByRole('img', { name: 'Conflict', exact: true })).toBeVisible();

    await addon.uncheck();

    await expect(emma.getByRole('checkbox', { name: LIBRARY.title })).not.toBeChecked();
    await expect(emma.getByRole('img', { name: 'Required', exact: true })).toHaveCount(0);
    await expect(emma.getByRole('img', { name: 'Conflict', exact: true })).toHaveCount(0);
    await expect(emma.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });
});

test.describe('List view controls', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
    await deactivateFixtures(page);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await page.evaluate(async () => {
      await game.settings.set('mondarth-emma', 'grouped', true);
    });
  });

  test('the select-all checkbox activates every module, then none, warning that EMMA would go', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const all = emma.getByRole('checkbox', { name: 'All modules', exact: true });
    const warning = emma.getByText(
      "Saving deactivates EMMA itself, so Foundry's own Module Management window will open from then on.",
    );

    expect(await all.evaluate((box: HTMLInputElement) => box.indeterminate)).toBe(true);

    await all.click();
    await expect(all).toBeChecked();
    await expect(emma.getByRole('checkbox', { name: LIBRARY.title })).toBeChecked();
    await expect(warning).toHaveCount(0);

    await all.click();
    await expect(all).not.toBeChecked();
    await expect(emma.getByRole('checkbox', { name: MODULE_TITLE })).not.toBeChecked();
    await expect(warning).toBeVisible();
  });

  test('the grouping toggle flattens the list, and is remembered', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const group = emma.getByRole('button', { name: 'Group related modules', exact: true });
    await emma.getByRole('checkbox', { name: ADDON.title }).check();
    await expect(emma.getByRole('img', { name: 'Required', exact: true })).toBeVisible();

    await group.click();

    await expect(group).toHaveAttribute('aria-pressed', 'false');
    await expect(emma.getByRole('img', { name: 'Required', exact: true })).toHaveCount(0);
    await expect(emma.getByRole('checkbox', { name: LIBRARY.title })).toBeDisabled();

    await closeEmma(page);
    await (await moduleManagementButton(page)).click();
    await expect(emma.getByRole('button', { name: 'Group related modules', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await emma.getByRole('button', { name: 'Split view', exact: true }).click();
    await expect(emma.getByRole('button', { name: 'Group related modules', exact: true })).toHaveCount(0);
  });
});

test.describe('Related modules in the split view', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'split');
    await deactivateFixtures(page);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
    await setView(page, 'list');
  });

  test('selecting groups related modules, activating brings what is required, and recommended ones wait', async ({
    page,
  }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const inactive = emma.getByRole('treegrid', { name: /^Inactive/ });
    const active = emma.getByRole('treegrid', { name: /^Active/ });

    await inactive.getByRole('row', { name: ADDON.title, exact: true }).click();

    const library = inactive.getByRole('row', { name: LIBRARY.title, exact: true });
    await expect(library).toHaveAttribute('aria-selected', 'true');
    await expect(library).toHaveAttribute('aria-level', '2');
    await expect(library.getByRole('img', { name: 'Required', exact: true })).toBeVisible();
    const rival = inactive.getByRole('row', { name: RIVAL.title, exact: true });
    await expect(rival).toHaveAttribute('aria-selected', 'false');
    await expect(rival.getByRole('img', { name: 'Recommended', exact: true })).toBeVisible();

    await emma.getByRole('button', { name: 'Activate the selected modules', exact: true }).click();

    await expect(active.getByRole('row', { name: LIBRARY.title, exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const proposed = active.getByRole('row', { name: RIVAL.title, exact: true });
    const confirm = proposed.getByRole('checkbox', { name: 'Activate this recommended module too' });
    await expect(confirm).not.toBeChecked();
    // The rival conflicts with the library, now active.
    await expect(proposed.getByRole('img', { name: 'Conflict', exact: true })).toBeVisible();

    await confirm.check();

    await expect(inactive.getByRole('row', { name: RIVAL.title, exact: true })).toHaveCount(0);
    await expect(confirm).toBeChecked();
  });
});

/** Foundry's dialog asking whether to discard staged changes. It has an ID, but no accessible name. */
const DISCARD_QUESTION = `#${MODULE_ID}-discard`;

/**
 * Click a window's Close Window button, as a user would. Foundry's notifications, such as the warning about missing
 * hardware acceleration in a test browser, can cover the button, so they are cleared first.
 * @param page - A page showing the window
 * @param window - A selector for the window; EMMA's by default
 */
async function clickClose(page: Page, window = EMMA_WINDOW): Promise<void> {
  await page.evaluate(() => {
    ui.notifications?.clear();
  });
  await page.locator(window).getByRole('button', { name: 'Close Window' }).click();
}

test.describe('Closing with staged changes', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
  });

  test('asks before discarding them', async ({ page }) => {
    const button = await moduleManagementButton(page);
    await button.click();
    const emma = page.locator(EMMA_WINDOW);
    const library = emma.getByRole('checkbox', { name: LIBRARY.title });
    const question = page.locator(DISCARD_QUESTION);

    await library.check();
    await clickClose(page);

    await expect(question).toBeVisible();
    await expect(question.getByRole('heading', { name: 'Discard staged changes?' })).toBeVisible();
    await question.getByRole('button', { name: 'Keep editing' }).click();
    await expect(question).toHaveCount(0);
    await expect(library).toBeChecked();

    await clickClose(page);
    await question.getByRole('button', { name: 'Discard and close' }).click();
    await expect(emma).toHaveCount(0);

    await button.click();
    await expect(emma.getByRole('checkbox', { name: LIBRARY.title })).not.toBeChecked();
  });

  test('closes without asking when nothing is staged', async ({ page }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);

    await clickClose(page);

    await expect(emma).toHaveCount(0);
    await expect(page.locator(DISCARD_QUESTION)).toHaveCount(0);
  });
});

test.describe('Hypothetical mode', () => {
  test.beforeEach(async ({ page }) => {
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
  });

  test('GMs turn it on to see the Foundry and system versions, and it is off when EMMA reopens', async ({ page }) => {
    const { core, system } = await page.evaluate(() => ({
      core: game.version,
      system: { id: game.system.id, title: game.system.title, version: game.system.version },
    }));
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const toggle = emma.getByRole('button', { name: 'Hypothetical mode', exact: true });
    const coreButton = emma.getByRole('button', { name: `Foundry Virtual Tabletop ${core}`, exact: true });
    const systemButton = emma.getByRole('button', { name: `${system.title} ${system.version}`, exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(coreButton).toHaveCount(0);

    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(coreButton).toHaveText(core);
    await expect(systemButton).toHaveText(`${system.id} ${system.version}`);

    await closeEmma(page);
    await (await moduleManagementButton(page)).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(systemButton).toHaveCount(0);
  });
});

test.describe('Hypothetical versions', () => {
  const RELEASES = 'https://api.github.com/repos/Mondarth/EMMA/releases?per_page=100';
  const LIBRARY_RELEASES = 'https://api.github.com/repos/emma-tests/emma-fixture-library/releases?per_page=100';

  /**
   * GitHub's list of releases, each with a module manifest attached.
   * @param repo - The repository, `<owner>/<repo>`
   * @param versions - The versions released
   * @returns The list
   */
  function releases(repo: string, versions: string[]) {
    return versions.map(version => ({
      tag_name: `v${version}`,
      assets: [
        {
          name: 'module.json',
          browser_download_url: `https://github.com/${repo}/releases/download/v${version}/module.json`,
        },
      ],
    }));
  }

  test.beforeEach(async ({ page }) => {
    // The GitHub releases are made up: EMMA's are newer than any it has, so none is the version installed, and the
    // library's are one older and one newer than the fixture's 1.0.0.
    await page.route(RELEASES, async route => {
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: releases('Mondarth/EMMA', ['9.9.0', '9.8.0']),
      });
    });
    await page.route(LIBRARY_RELEASES, async route => {
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: releases('emma-tests/emma-fixture-library', ['0.9.0', '2.0.0']),
      });
    });
    await joinAs(page, USERS.gm);
    await setDisabled(page, false);
    await setView(page, 'list');
    await deactivateFixtures(page);
  });

  test.afterEach(async ({ page }) => {
    await closeEmma(page);
  });

  test('an active module’s badge becomes a list of its other versions, in their badges’ colours', async ({ page }) => {
    const installed = await page.evaluate(id => game.modules.get(id)?.version ?? '', MODULE_ID);
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const picker = (version: string) =>
      emma.getByRole('button', { name: `${MODULE_TITLE} version ${version}: choose another version`, exact: true });

    await expect(picker(installed)).toHaveCount(0);
    await emma.getByRole('button', { name: 'Hypothetical mode', exact: true }).click();
    await picker(installed).click();

    const list = page.getByRole('listbox', { name: `Versions of ${MODULE_TITLE}` });
    const options = list.getByRole('option');
    // The installed version is on the button, so is left out.
    await expect(options).toHaveText([/^\s*9\.9\.0/, /^\s*9\.8\.0/]);
    // Known only from GitHub's release list, so Foundry cannot place them.
    await expect(options.first().locator('.emma-badge')).toHaveClass(/error/);
    await expect(
      emma.getByRole('status', { name: new RegExp(`^Not every version could be looked up for: .*${MODULE_TITLE}`) }),
    ).toBeVisible();

    await options.filter({ hasText: '9.8.0' }).click();

    await expect(list).toBeHidden();
    await expect(picker('9.8.0')).toBeVisible();
    await expect(picker('9.8.0')).toBeFocused();
    await expect(picker('9.8.0').locator('.emma-badge')).toHaveClass(/error/);

    await picker('9.8.0').click();
    await expect(options).toHaveText([/^\s*9\.9\.0/, new RegExp(`^\\s*${installed.replaceAll('.', '\\.')}`)]);
    await page.keyboard.press('Escape');

    await emma.getByRole('button', { name: 'Hypothetical mode', exact: true }).click();
    await expect(picker('9.8.0')).toHaveCount(0);
  });

  test('a module staged active is looked up, offering only its newer versions; staged inactive, it is not', async ({
    page,
  }) => {
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);
    const picker = emma.getByRole('button', {
      name: `${LIBRARY.title} version 1.0.0: choose another version`,
      exact: true,
    });
    const library = emma.getByRole('checkbox', { name: LIBRARY.title });
    await emma.getByRole('button', { name: 'Hypothetical mode', exact: true }).click();
    await expect(emma.getByRole('button', { name: new RegExp(`^${MODULE_TITLE} version`) })).toBeVisible();
    await expect(picker).toHaveCount(0);

    await library.check();

    await picker.click();
    await expect(page.getByRole('listbox', { name: `Versions of ${LIBRARY.title}` }).getByRole('option')).toHaveText([
      /^\s*2\.0\.0/,
    ]);
    await page.keyboard.press('Escape');

    await library.uncheck();
    await expect(picker).toHaveCount(0);
  });
});

test.describe('Players', () => {
  test.afterEach(async ({ page }) => {
    await closeEmma(page);
  });

  test('see EMMA read-only', async ({ page }) => {
    await joinAs(page, USERS.player);
    await (await moduleManagementButton(page)).click();
    const emma = page.locator(EMMA_WINDOW);

    await expect(emma.getByText('Only a GM can change which modules are active.')).toBeVisible();
    await expect(emma.getByRole('checkbox', { name: MODULE_TITLE })).toBeDisabled();
    await expect(emma.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(emma.getByRole('button', { name: 'Hypothetical mode', exact: true })).toHaveCount(0);
  });
});
