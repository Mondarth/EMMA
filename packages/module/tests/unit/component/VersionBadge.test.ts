import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, test } from 'vitest';

import VersionBadge from '@component/VersionBadge.svelte';
import type { VersionBadge as Badge } from '@module/adapters/modules';
import { installFoundryMocks } from '../mocks/foundry';

const WARNING: Badge = {
  type: 'warning',
  icon: 'fa-solid fa-triangle-exclamation',
  tooltip: 'Not verified for <em>14</em>',
  text: 'Not verified for 14',
};

describe('VersionBadge', () => {
  beforeEach(() => {
    installFoundryMocks();
  });

  test('shows the version in a badge coloured by its compatibility', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING });

    const badge = container.querySelector('.emma-badge') as HTMLElement;
    expect(badge).toHaveClass('warning');
    expect(badge).toHaveTextContent('2.0.0');
    expect(badge.querySelector('i')).toHaveClass('fa-solid', 'fa-triangle-exclamation', 'fa-fw');
  });

  test('explains the badge in a tooltip, and to screen readers', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING });

    expect(container.querySelector('.emma-badge')).toHaveAttribute('data-tooltip-html', 'Not verified for <em>14</em>');
    expect(screen.getByText('Not verified for 14')).toHaveClass('emma-badge-text');
  });

  test('shows the version alone when Foundry gives no badge', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: null });

    expect(container.querySelector('.emma-badge')).toBeNull();
    expect(screen.getByText('2.0.0')).toHaveClass('emma-version');
  });

  test('marks a version not on Foundry’s package listing', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING, unlisted: true });

    expect(container.querySelector('.emma-badge .emma-unlisted')).not.toBeNull();
  });

  test('marks one with no badge too, saying why in its own tooltip', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: null, unlisted: true });

    const version = screen.getByText('2.0.0');
    expect(version).toHaveAttribute('data-tooltip', 'MONDARTH-EMMA.Versions.Unlisted');
    expect(container.querySelector('.emma-unlisted')).not.toBeNull();
  });

  test('marks nothing for a listed version', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING });

    expect(container.querySelector('.emma-unlisted')).toBeNull();
  });
});
