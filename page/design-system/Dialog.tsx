/**
 * A 640 px dialog centred over a backdrop: its title, its content, its actions at the end. Escape closes it while the focus is inside it;
 * the caller's Cancel closes it too. A click on the backdrop does not, so a half-filled form is never lost by a stray click.
 */
import type { KeyboardEvent, ReactNode } from 'react';

export interface DialogProps {
  readonly title:    string;
  readonly children: ReactNode;
  readonly actions:  ReactNode;
  readonly onClose:  () => void;
}

export function Dialog({
  title, children, actions, onClose
}: DialogProps) {
  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  return (
    <div className="gaia-dialog-backdrop" onKeyDown={closeOnEscape}>
      <div className="gaia-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <h2 className="gaia-dialog-title">{title}</h2>
        <div className="gaia-dialog-body">{children}</div>
        <div className="gaia-dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
