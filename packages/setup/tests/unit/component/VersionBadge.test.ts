import { render, screen } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import type { KitBadge } from '@mondarth/emma-core/setup-kit';

import VersionBadge from '../../../src/component/VersionBadge.svelte';

const WARNING: KitBadge = {
  type: 'warning',
  icon: 'fa-solid fa-triangle-exclamation',
  tooltip: 'Not verified for <em>14</em>',
  text: 'Not verified for 14',
};

describe('VersionBadge', () => {
  test('shows the version in a badge coloured by its compatibility, explained in a tooltip and to screen readers', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING });

    const badge = container.querySelector('.emma-badge');
    expect(badge).toHaveClass('warning');
    expect(badge).toHaveTextContent('2.0.0');
    expect(badge?.querySelector('i')).toHaveClass('fa-solid', 'fa-triangle-exclamation', 'fa-fw');
    expect(badge).toHaveAttribute('data-tooltip-html', 'Not verified for <em>14</em>');
    expect(screen.getByText('Not verified for 14')).toHaveClass('emma-badge-text');
    expect(container.querySelector('.emma-unlisted')).toBeNull();
  });

  test('shows the version alone without a badge', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: null });

    expect(container.querySelector('.emma-badge')).toBeNull();
    expect(screen.getByText('2.0.0')).toHaveClass('emma-version');
    expect(screen.getByText('2.0.0')).not.toHaveAttribute('data-tooltip');
  });

  test('marks a version not on Foundry’s package listing', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: WARNING, unlisted: true });

    expect(container.querySelector('.emma-badge .emma-unlisted')).not.toBeNull();
  });

  test('marks one with no badge too, saying why in its own tooltip', () => {
    const { container } = render(VersionBadge, { version: '2.0.0', badge: null, unlisted: true });

    expect(container.querySelector('.emma-version')).toHaveAttribute(
      'data-tooltip',
      expect.stringMatching(/^Not on Foundry's package listing/) as unknown,
    );
    expect(container.querySelector('.emma-unlisted')).not.toBeNull();
  });
});
