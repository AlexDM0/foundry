/**
 * How one choice in the system's chooser ended. `cancelled`: User closed the dialog without a choice. `timed-out`: nobody answered within
 * the bound, and the dialog closed with its process. `chooser-not-found`: this machine has no `osascript`. `failed`: the chooser ended
 * without a choice and without a cancel.
 */
export type PathChoiceVerdict =
  | { readonly verdict: 'chosen'; readonly path: string }
  | { readonly verdict: 'cancelled' }
  | { readonly verdict: 'timed-out' }
  | { readonly verdict: 'chooser-not-found' }
  | { readonly verdict: 'failed' };
