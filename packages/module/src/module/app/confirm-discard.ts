import { localize } from '@module/lib/i18n';

/** Options for closing a window that asks before discarding unsaved changes. */
export interface DiscardClosingOptions extends foundry.applications.api.ApplicationV2.ClosingOptions {
  /** Close without asking, discarding any unsaved changes. */
  discard?: boolean;
}

/** What to ask when a window would discard unsaved changes. */
export interface DiscardQuestion {
  /** The dialog's DOM ID. */
  id: string;
  /** Localization key of the dialog's title. */
  title: string;
  /** Localization key of the question. */
  body: string;
}

/**
 * Ask whether to close a window, discarding its unsaved changes. Keeping them is the default.
 * @param question - What to ask
 * @returns `true` if the user chose to discard the changes
 */
export async function confirmDiscard(question: DiscardQuestion): Promise<boolean> {
  const discard = await foundry.applications.api.DialogV2.confirm({
    id: question.id,
    window: { title: question.title },
    content: `<p>${localize(question.body)}</p>`,
    modal: true,
    yes: { label: 'MONDARTH-EMMA.Discard.Discard', icon: 'fa-solid fa-trash', default: false },
    no: { label: 'MONDARTH-EMMA.Discard.Keep', icon: 'fa-solid fa-pen', default: true },
  });
  return discard === true;
}
