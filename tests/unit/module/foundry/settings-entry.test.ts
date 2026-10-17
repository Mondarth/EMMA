import { beforeEach, describe, expect, test, vi } from 'vitest';

import { openEmma } from '@module/app/emma-app';
import { MODULES_BUTTON, registerModuleManagementOverride } from '@module/foundry/settings-entry';
import { registerSettings } from '@module/settings';
import { installFoundryMocks } from '../../mocks/foundry';

vi.mock('@module/app/emma-app', () => ({ openEmma: vi.fn(() => Promise.resolve()) }));

/**
 * Build a Settings tab element with the Module Management button and one other app button. Like ApplicationV2, the
 * element delegates `data-action` clicks from a bubble-phase listener of its own, recorded by `foundryAction`.
 * @returns The element, its buttons and the spy standing in for Foundry's handler
 */
function createSettingsTab() {
  const element = document.createElement('section');
  element.innerHTML = `
    <button type="button" data-action="openApp" data-app="modules"><i class="fa-solid fa-cubes"></i> Manage Modules</button>
    <button type="button" data-action="openApp" data-app="configure">Configure Settings</button>`;
  document.body.append(element);

  const foundryAction = vi.fn();
  element.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-action]')) foundryAction();
  });

  const [modules, configure] = element.querySelectorAll('button');
  return { element, modules: modules as HTMLButtonElement, configure: configure as HTMLButtonElement, foundryAction };
}

/**
 * Install the mocks, register the setting and the override, and render a Settings tab.
 * @returns The Settings tab and the installed mocks
 */
function setUp() {
  const mocks = installFoundryMocks();
  registerSettings();
  registerModuleManagementOverride();
  const tab = createSettingsTab();
  mocks.hooks.run('renderSettings', {}, tab.element, {}, {});
  return { ...mocks, ...tab };
}

describe('registerModuleManagementOverride', () => {
  beforeEach(() => {
    vi.mocked(openEmma).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  test('matches the Module Management button only', () => {
    const { modules, configure } = setUp();

    expect(modules.matches(MODULES_BUTTON)).toBe(true);
    expect(configure.matches(MODULES_BUTTON)).toBe(false);
  });

  test('returns the hook ID for Hooks.off', () => {
    installFoundryMocks();

    expect(registerModuleManagementOverride()).toEqual(expect.any(Number));
  });

  test('opens EMMA instead of Module Management', () => {
    const { modules, foundryAction, foundry } = setUp();

    modules.click();

    expect(openEmma).toHaveBeenCalledOnce();
    expect(foundryAction).not.toHaveBeenCalled();
    expect(foundry.moduleManagementRender).not.toHaveBeenCalled();
  });

  test('catches clicks on the button icon too', () => {
    const { modules, foundryAction } = setUp();

    modules.querySelector('i')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openEmma).toHaveBeenCalledOnce();
    expect(foundryAction).not.toHaveBeenCalled();
  });

  test('leaves the other Settings buttons alone', () => {
    const { configure, foundryAction } = setUp();

    configure.click();

    expect(openEmma).not.toHaveBeenCalled();
    expect(foundryAction).toHaveBeenCalledOnce();
  });

  test('leaves clicks outside any button alone', () => {
    const { element, foundryAction } = setUp();

    element.click();

    expect(openEmma).not.toHaveBeenCalled();
    expect(foundryAction).not.toHaveBeenCalled();
  });

  test('lets Foundry open Module Management while EMMA is disabled', async () => {
    const { game, modules, foundryAction } = setUp();
    await game.settings.set('mondarth-emma', 'disabled', true);

    modules.click();

    expect(openEmma).not.toHaveBeenCalled();
    expect(foundryAction).toHaveBeenCalledOnce();
  });

  test('listens once per element however often the tab renders', () => {
    const { hooks, element, modules } = setUp();

    hooks.run('renderSettings', {}, element, {}, {});
    modules.click();

    expect(openEmma).toHaveBeenCalledOnce();
  });

  test('takes over each Settings tab element, such as a popped-out one', () => {
    const { hooks } = setUp();
    const popout = createSettingsTab();

    hooks.run('renderSettings', {}, popout.element, {}, {});
    popout.modules.click();

    expect(openEmma).toHaveBeenCalledOnce();
    expect(popout.foundryAction).not.toHaveBeenCalled();
  });

  test('falls back to Module Management, with an error, if EMMA cannot open', async () => {
    const { modules, foundry, ui } = setUp();
    const failure = new Error('broken');
    vi.mocked(openEmma).mockRejectedValueOnce(failure);

    modules.click();

    await vi.waitFor(() => {
      expect(foundry.moduleManagementRender).toHaveBeenCalledExactlyOnceWith({ force: true });
    });
    expect(ui.notifications.error).toHaveBeenCalledExactlyOnceWith('MONDARTH-EMMA.Errors.OpenFailed');
    expect(console.error).toHaveBeenCalledWith('mondarth-emma |', expect.any(String), failure);
  });
});
