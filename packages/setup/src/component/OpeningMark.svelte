<!--
  What shows EMMA busy while its window opens (see `SetupState.opening`): a spinner and a word, large in the middle of the
  window, over what is drawn meanwhile, so that it is plain the window is working and not done. The footer's status says
  the same, but small. It lets what is under it be seen, and clicked through. Hidden from assistive technology, as the
  window's status says as much to it already.
-->
<script lang="ts">
  import { localize } from '../lib/i18n';
</script>

<div class="emma-opening" aria-hidden="true" data-testid="emma-opening">
  <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
  <span>{localize('Busy.Analyzing')}</span>
</div>

<style>
  .emma-opening {
    position: absolute;
    inset: 0;
    z-index: 10;
    /* Sized by the window, so that what it shows can be sized by the window's height. */
    container-type: size;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2cqh;
    color: var(--color-light-1, #f0f0e0);
    opacity: 0.6;
    pointer-events: none;
  }

  .emma-opening i {
    /* A tenth of the window's height, at least, and the word under it: more than a tenth together. */
    font-size: max(10cqh, 2rem);
  }

  .emma-opening span {
    font-size: max(3cqh, 1rem);
    font-weight: bold;
    letter-spacing: 0.05em;
  }
</style>
