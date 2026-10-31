<!--
  A version list, as the EMMA module's (its component/VersionPicker.svelte): a button showing the version chosen in its
  badge, which opens the other versions, each in its own badge, newest first. The installed version is marked so.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { format, localize } from '../lib/i18n';
  import type { VersionOption } from '../lib/updates';

  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    /** The title of the package whose version is chosen. */
    title: string;
    /** The version chosen, with its badge. */
    chosen: VersionOption;
    /**
     * Every version of the package, newest first, the chosen one among them; read each time the list opens, as judging
     * them takes time. The list leaves out the chosen version, which the button already shows.
     */
    versions: () => readonly VersionOption[];
    /** The version installed, which the list marks. */
    installed: string;
    /** Called with the version the user chooses. */
    onChoose: (version: string) => void;
    /** Called as the list opens, before anything else. */
    onOpen?: () => void;
    /** Called with the version the keyboard or the pointer is on while the list is open, and `null` once it closes. */
    onPreview?: (version: string | null) => void;
  }

  const { title, chosen, versions, installed, onChoose, onOpen, onPreview }: Props = $props();

  const uid = $props.id();

  let button: HTMLButtonElement | undefined = $state();
  let popup: HTMLDivElement | undefined = $state();
  let listbox: HTMLUListElement | undefined = $state();

  let expanded = $state(false);
  let options: readonly VersionOption[] = $state.raw([]);
  let active = $state(0);

  // The version looked at, for whoever explains it.
  $effect(() => {
    const looked = expanded ? (options[active]?.version ?? null) : null;
    // Only what the list looks at, not what the callback reads, which may be what it writes.
    untrack(() => onPreview?.(looked));
  });

  const label = $derived(format('Update.Choose', { title, version: chosen.version }));

  /**
   * The DOM ID of an option.
   * @param index - The option's position
   * @returns A document-unique ID
   */
  function optionId(index: number): string {
    return `${uid}-option-${String(index)}`;
  }

  /**
   * Open the list below the button, on its newest version.
   * @param anchor - The button
   */
  function show(anchor: HTMLElement): void {
    onOpen?.();
    options = versions().filter(({ version }) => version !== chosen.version);
    active = 0;
    // In the top layer, so the module list's scrolling cannot clip it; placed under the button by hand, as CSS anchor
    // positioning is not in every browser Foundry supports.
    const { left, bottom } = anchor.getBoundingClientRect();
    popup?.style.setProperty('left', `${String(left)}px`);
    popup?.style.setProperty('top', `${String(bottom + 2)}px`);
    popup?.showPopover();
    listbox?.focus();
  }

  /**
   * Close the list.
   * @param refocus - Whether to put the keyboard back on the button
   */
  function hide(refocus: boolean): void {
    popup?.hidePopover();
    if (refocus) button?.focus();
  }

  /**
   * Choose a version and close the list.
   * @param index - The option's position
   */
  function choose(index: number): void {
    const option = options[index];
    hide(true);
    if (option !== undefined) onChoose(option.version);
  }

  /**
   * Move through the list, or choose or close it, from the keyboard.
   * @param event - The key press
   */
  function onKeydown(event: KeyboardEvent): void {
    // Kept from the tree, whose own keys would otherwise act on the row behind the list.
    event.stopPropagation();
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      active = move;
      document.getElementById(optionId(move))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hide(true);
    } else if (event.key === 'Tab') {
      hide(false);
    }
  }
</script>

<button
  bind:this={button}
  type="button"
  class="emma-version-picker"
  aria-label={label}
  aria-haspopup="listbox"
  aria-expanded={expanded}
  aria-controls={`${uid}-list`}
  onclick={event => {
    // Opening the list must not also select or toggle the row it is on.
    event.stopPropagation();
    if (expanded) hide(true);
    else show(event.currentTarget);
  }}>
  {@render badged(chosen)}
  <i class="fa-solid fa-caret-down" inert></i>
</button>

{#snippet badged(option: VersionOption)}
  <VersionBadge version={option.version} badge={option.badge} unlisted={option.unlisted === true} />
  {#if option.version === installed}
    <span class="emma-version-installed">{localize('Update.Installed')}</span>
  {/if}
{/snippet}

<!-- Clicks and keys in the list stay in it, as the list's own handlers stop keys: in the DOM it sits inside the row. -->
<div
  bind:this={popup}
  class="emma-version-popup"
  popover="auto"
  role="presentation"
  onclick={event => {
    event.stopPropagation();
  }}
  ontoggle={(event: ToggleEvent) => {
    expanded = event.newState === 'open';
  }}>
  <ul
    bind:this={listbox}
    id={`${uid}-list`}
    role="listbox"
    tabindex="-1"
    aria-label={format('Update.Versions', { title })}
    aria-activedescendant={expanded ? optionId(active) : undefined}
    onkeydown={onKeydown}>
    {#each options as option, index (option.version)}
      <li
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        class={{ active: index === active }}
        onclick={() => {
          choose(index);
        }}
        onkeydown={onKeydown}
        onpointermove={() => {
          active = index;
        }}>
        {@render badged(option)}
      </li>
    {/each}
  </ul>
</div>

<style>
  /* Only the badge shows, as in the EMMA module's lists. */
  .emma-version-picker {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.25rem;
    width: auto;
    cursor: pointer;
    height: auto;
    min-height: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
  }

  .emma-version-picker:focus-visible {
    outline: 1px solid var(--color-border-highlight);
    outline-offset: 1px;
  }

  .emma-version-popup {
    position: fixed;
    inset: auto;
    max-height: 16rem;
    margin: 0;
    padding: 0.25rem;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-cool-5, var(--background));
    box-shadow: 0 0 8px var(--color-shadow-dark, rgb(0 0 0 / 50%));
  }

  .emma-version-popup ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    outline: none;
  }

  .emma-version-popup li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 2px 0.25rem;
    border-radius: 2px;
    cursor: pointer;
  }

  .emma-version-installed {
    font-size: 0.8em;
    opacity: 0.8;
  }

  .emma-version-popup li.active {
    background: var(--color-hover-bg, rgb(255 255 255 / 10%));
  }
</style>
