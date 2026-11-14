/**
 * How the Forges view's dialogs, "Add a repository" and "What notifies", sit on the package's dialog: each as wide as its board draws it, and
 * closed by Escape and the close button but never by a click beside them, so a half-filled form is never lost to a stray click.
 */
import type { DialogDismissalReason, DialogWidth } from 'design-system/Dialog';

export const FormDialogUtil = Object.freeze({
  ADD_REPOSITORY_WIDTH: 'widest' satisfies DialogWidth,

  /** The package's wide dialog is the one whose list comes closest to the width C2 draws. */
  WHAT_NOTIFIES_WIDTH: 'wide' satisfies DialogWidth,

  /** The package's dismissal handler that closes the dialog for every reason but a click on the backdrop. */
  dismissalOf(onClose: () => void): (reason: DialogDismissalReason) => void {
    return (reason) => {
      if (reason !== 'backdrop') onClose();
    };
  },
});
