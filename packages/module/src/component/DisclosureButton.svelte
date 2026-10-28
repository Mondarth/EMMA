<script lang="ts">
  import { format } from '@module/lib/i18n';

  interface Props {
    /** The title of the module whose drawer the button opens. */
    title: string;
    /** Whether the drawer is open. */
    expanded: boolean;
    /** The DOM ID of the drawer. */
    controls: string;
    /** Opens or closes the drawer. */
    onToggle: () => void;
    /** Whether Tab stops on the button; the split view's lists handle the keyboard themselves. */
    focusable?: boolean;
    /** Handles a key press on the button. */
    onKeydown?: (event: KeyboardEvent) => void;
  }

  const { title, expanded, controls, onToggle, focusable = true, onKeydown }: Props = $props();

  const label = $derived(
    format(expanded ? 'MONDARTH-EMMA.Drawer.Hide' : 'MONDARTH-EMMA.Drawer.Show', { module: title }),
  );
</script>

<button
  type="button"
  class="emma-disclosure"
  aria-label={label}
  aria-expanded={expanded}
  aria-controls={controls}
  tabindex={focusable ? undefined : -1}
  onclick={event => {
    // Opening the drawer must not also select or toggle the module it belongs to.
    event.stopPropagation();
    onToggle();
  }}
  onkeydown={onKeydown}>
  <!-- In its own element: Foundry resets the font of buttons, so icon classes on the button itself show no icon. -->
  <i class={['fa-solid', 'fa-fw', expanded ? 'fa-caret-down' : 'fa-caret-right']} inert></i>
</button>

<style>
  .emma-disclosure {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    min-height: 0;
    padding: 0;
    border: none;
    background: none;
    line-height: 1;
    color: var(--color-text-secondary);
  }

  .emma-disclosure:hover {
    color: var(--color-text-emphatic);
  }
</style>
