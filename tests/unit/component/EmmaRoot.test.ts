import { render } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import EmmaRoot from '@component/EmmaRoot.svelte';
import { installFoundryMocks } from '../mocks/foundry';

describe('EmmaRoot', () => {
  test('shows the localized placeholder', () => {
    installFoundryMocks();

    const { getByText } = render(EmmaRoot);

    expect(getByText('MONDARTH-EMMA.App.Placeholder')).toBeInTheDocument();
  });

  test('leaves nothing behind when unmounted', () => {
    installFoundryMocks();
    const { container, unmount } = render(EmmaRoot);

    unmount();

    expect(container).toBeEmptyDOMElement();
  });
});
