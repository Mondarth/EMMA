<!--
  A handle between two panels that resizes them, by dragging it or from the keyboard, as the ARIA window splitter
  pattern has it: the arrow keys move it a little, and Home and End to its limits. Its value is the share of the width,
  or height, of the element it is in that the panel before it (or after it) takes, so the panels keep their shares as
  the window is resized.
-->
<script lang="ts">
  interface Props {
    /** `vertical` between panels side by side, resizing their widths; `horizontal` between panels one above the other. */
    orientation: 'vertical' | 'horizontal';
    /** The share of the container the panel it sizes takes, from 0 to 1. */
    value: number;
    /** Whether the panel it sizes is the one before it (left or above) or after it (right or below). */
    sizes: 'before' | 'after';
    min: number;
    max: number;
    /** What it resizes, for assistive technology. */
    label: string;
    onChange: (value: number) => void;
  }

  let { orientation, value, sizes, min, max, label, onChange }: Props = $props();

  /** How far an arrow key moves it. */
  const STEP = 0.02;

  let dragging = $state(false);

  /**
   * Keep a value within the limits.
   * @param share - The value
   * @returns The value, within them
   */
  function clamp(share: number): number {
    return Math.min(max, Math.max(min, share));
  }

  /**
   * The share a pointer at a point gives the panel it sizes, of the element the handle and the panels are in.
   * @param event - The pointer, on the handle
   * @returns The share, or `undefined` if that element has no size, as while the window is hidden
   */
  function shareAt(event: PointerEvent & { currentTarget: HTMLElement }): number | undefined {
    const handle = event.currentTarget;
    const rect = (handle.parentElement ?? handle).getBoundingClientRect();
    const [at, start, size] =
      orientation === 'vertical' ? [event.clientX, rect.left, rect.width] : [event.clientY, rect.top, rect.height];
    if (size <= 0) return undefined;
    const before = (at - start) / size;
    return sizes === 'before' ? before : 1 - before;
  }

  /**
   * Follow the pointer while it drags the handle.
   * @param event - The pointer
   */
  function onPointerMove(event: PointerEvent & { currentTarget: HTMLElement }): void {
    if (!dragging) return;
    const share = shareAt(event);
    if (share !== undefined) onChange(clamp(share));
  }

  /**
   * Move the handle from the keyboard.
   * @param event - The key
   */
  function onKeydown(event: KeyboardEvent): void {
    const [less, more] = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    // Moving the handle towards the end grows the panel before it, and shrinks the one after it.
    const grow = sizes === 'before' ? more : less;
    const shrink = sizes === 'before' ? less : more;
    let next: number | undefined;
    if (event.key === grow) next = value + STEP;
    else if (event.key === shrink) next = value - STEP;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
  }
</script>

<!--
  A focusable separator is a widget, as the ARIA window splitter pattern has it, though Svelte counts the role as static.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class={['emma-splitter', `emma-splitter-${orientation}`]}
  class:emma-splitter-dragging={dragging}
  role="separator"
  tabindex="0"
  aria-label={label}
  aria-orientation={orientation}
  aria-valuenow={Math.round(value * 100)}
  aria-valuemin={Math.round(min * 100)}
  aria-valuemax={Math.round(max * 100)}
  onkeydown={onKeydown}
  onpointerdown={event => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging = true;
  }}
  onpointermove={onPointerMove}
  onpointerup={event => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragging = false;
  }}
  onpointercancel={() => {
    dragging = false;
  }}>
</div>

<style>
  .emma-splitter {
    flex: none;
    background: var(--color-border, #555);
    opacity: 0.5;
    touch-action: none;
  }

  .emma-splitter:hover,
  .emma-splitter:focus-visible,
  .emma-splitter-dragging {
    opacity: 1;
    background: var(--color-warm-1, #ff6400);
    outline: none;
  }

  .emma-splitter-vertical {
    width: 4px;
    cursor: col-resize;
  }

  .emma-splitter-horizontal {
    height: 4px;
    cursor: row-resize;
  }
</style>
