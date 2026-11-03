/**
 * Tells a GM, when a world starts, what changed in its setup since it last ran, as its record says: in a dialog that
 * only informs, a chat card whispered to them alone, or both, as they chose (see `getStartupChanges`).
 */
import { format, localize } from '@module/lib/i18n';
import { getStartupChanges } from '@module/settings';
import type { WorldChanges } from '@mondarth/emma-core/world-record';

/**
 * The changes, as lines to show: Foundry's build, the game system, then each module.
 * @param changes - The changes
 * @returns The lines, as plain text
 */
export function changeLines(changes: WorldChanges): string[] {
  const { core, system } = changes;
  const lines: string[] = [];
  if (core !== undefined) lines.push(format('MONDARTH-EMMA.Changes.Core', core));
  if (system !== undefined) {
    const { from, to } = system;
    lines.push(
      from.id === to.id
        ? format('MONDARTH-EMMA.Changes.System', { from: from.version, to: to.version })
        : format('MONDARTH-EMMA.Changes.OtherSystem', {
            fromTitle: from.title,
            from: from.version,
            toTitle: to.title,
            to: to.version,
          }),
    );
  }
  for (const { title, from, to } of changes.changed) {
    const key = foundry.utils.isNewerVersion(to, from) ? 'Updated' : 'Downgraded';
    lines.push(format(`MONDARTH-EMMA.Changes.${key}`, { title, from, to }));
  }
  for (const { title, version } of changes.added) lines.push(format('MONDARTH-EMMA.Changes.Added', { title, version }));
  for (const { id, title, version } of changes.removed) {
    // A module the world had active may have been uninstalled since, or deactivated where EMMA did not see it.
    const key = game.modules.get(id) === undefined ? 'Uninstalled' : 'Deactivated';
    lines.push(format(`MONDARTH-EMMA.Changes.${key}`, { title, version }));
  }
  return lines;
}

/**
 * The changes as HTML, every name and version escaped.
 * @param changes - The changes
 * @param since - When the world last ran, as its record was last written, an ISO 8601 time
 * @returns The HTML
 */
export function changesHTML(changes: WorldChanges, since: string): string {
  const { escapeHTML } = foundry.utils;
  const ran = new Date(since).toLocaleString(game.i18n.lang);
  const intro = format('MONDARTH-EMMA.Changes.Intro', { world: game.world.title, when: ran });
  const items = changeLines(changes).map(line => `<li>${escapeHTML(line)}</li>`);
  return `<p>${escapeHTML(intro)}</p><ul class="mondarth-emma-changes">${items.join('')}</ul>`;
}

/**
 * Tell the current user what changed since the world last ran, as they chose. A failure is the caller's to log.
 * @param changes - The changes, at least one
 * @param since - When the world last ran, an ISO 8601 time
 * @returns Once the chat card, if any, is made; a dialog is not waited for
 */
export async function reportChanges(changes: WorldChanges, since: string): Promise<void> {
  const how = getStartupChanges();
  if (how === 'none') return;
  const content = changesHTML(changes, since);
  if (how === 'dialog' || how === 'both') {
    // Informational only: it asks nothing, and closing it is the same as its button.
    void foundry.applications.api.DialogV2.prompt({
      window: { title: 'MONDARTH-EMMA.Changes.Title', icon: 'fa-solid fa-clock-rotate-left' },
      content,
      ok: { label: 'MONDARTH-EMMA.Changes.Ok', icon: 'fa-solid fa-check' },
      rejectClose: false,
    });
  }
  if (how === 'chat' || how === 'both') {
    const user = game.user;
    await ChatMessage.implementation.create({
      content: `<h3>${foundry.utils.escapeHTML(localize('MONDARTH-EMMA.Changes.Title'))}</h3>${content}`,
      speaker: { alias: 'EMMA' },
      whisper: user === null ? [] : [user.id],
    });
  }
}
