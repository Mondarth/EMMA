/**
 * Puts EMMA's button in the setup screen's menu, beside Foundry's own (Configure, Update, Backups…).
 *
 * The menu is Foundry's `SetupMenu` application (Foundry 14.368), which replaces its buttons each time it renders. So
 * the button is added again on each `renderSetupMenu` hook, into the menu's buttons part
 * (`[data-application-part="buttons"]`), and at once if the menu is already showing.
 */

/** The class of EMMA's button, by which it is found again. */
export const MENU_BUTTON_CLASS = 'mondarth-emma-open';

/** What the button shows. */
export interface MenuButtonOptions {
  /** Its accessible name and tooltip. */
  readonly label: string;
  /** Called when it is clicked. */
  readonly onClick: () => void;
}

/**
 * Add EMMA's button to a rendered menu, unless it is already there.
 * @param menu - The menu's element
 * @param options - What the button shows
 */
export function addButton(menu: HTMLElement, options: MenuButtonOptions): void {
  const { label, onClick } = options;
  const buttons = menu.querySelector('[data-application-part="buttons"]');
  if (buttons === null || buttons.querySelector(`.${MENU_BUTTON_CLASS}`) !== null) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon ${MENU_BUTTON_CLASS}`;
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-cubes';
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  button.addEventListener('click', onClick);
  buttons.prepend(button);
}

/**
 * Keep EMMA's button in the setup screen's menu.
 * @param options - What the button shows
 * @returns The ID of the `renderSetupMenu` hook, for `Hooks.off`
 */
export function keepMenuButton(options: MenuButtonOptions): number {
  const menu = document.getElementById('setup-menu');
  if (menu !== null) addButton(menu, options);
  return Hooks.on('renderSetupMenu', (_app, element) => {
    addButton(element, options);
  });
}
