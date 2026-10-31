// DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …) for every unit test.
import '@testing-library/jest-dom/vitest';

import { ApplicationV2Mock } from './mocks/foundry';

// EMMA's window extends Foundry's ApplicationV2 as soon as its module loads, before any test installs its mocks.
Object.assign(globalThis, { foundry: { applications: { api: { ApplicationV2: ApplicationV2Mock } } } });

// happy-dom has no Popover API. A popover here is shown by an attribute, and toggles fire as browsers fire them, so
// components using popovers can be tested, as in the EMMA module's tests.
// The dev server's tests run in Node, without a DOM.
if (typeof HTMLElement !== 'undefined' && !('showPopover' in HTMLElement.prototype)) {
  const toggle = (element: HTMLElement, open: boolean): void => {
    if (element.hasAttribute('data-popover-open') === open) return;
    element.toggleAttribute('data-popover-open', open);
    const event = new Event('toggle');
    Object.assign(event, { oldState: open ? 'closed' : 'open', newState: open ? 'open' : 'closed' });
    element.dispatchEvent(event);
  };
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement): void {
      toggle(this, true);
    },
    hidePopover(this: HTMLElement): void {
      toggle(this, false);
    },
  });
}
