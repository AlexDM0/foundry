/**
 * How the Forges view's dialogs, "Add a repository" and "What notifies", close on the package's dialog: by Escape and the close button but
 * never by a click beside them, so a half-filled form is never lost to a stray click.
 */
import type { DialogDismissalReason } from '../../lib/design-system/DesignSystemInterface.ts';

/** The package's dismissal handler that closes the dialog for every reason but a click on the backdrop. */
export function formDialogDismissalOf(onClose: () => void): (reason: DialogDismissalReason) => void {
  return (reason) => {
    if (reason !== 'backdrop') onClose();
  };
}
