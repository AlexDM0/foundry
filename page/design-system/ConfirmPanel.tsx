/**
 * A question to confirm in place, as a card: the question, the choices side by side when there are any, a line of what follows, then
 * Cancel as a ghost and the confirming button, the group's one primary. The caller names the group by what it confirms, such as "Stop
 * Example Storefront". The package's ConfirmStrip holds no choices and runs inline, so Gaia composes this from the package's buttons.
 */
import { Button }         from 'design-system/Button';
import type { ReactNode } from 'react';


export interface ConfirmPanelProps {
  readonly label:        string;
  readonly question:     string;
  readonly choices?:     ReactNode;
  readonly consequence?: string;
  readonly confirmLabel: string;
  readonly onConfirm:    () => void;
  readonly onCancel:     () => void;
  /** While the confirmed command is on its way. */
  readonly disabled?:    boolean;
}

export function ConfirmPanel({
  label, question, choices, consequence, confirmLabel, onConfirm, onCancel, disabled = false
}: ConfirmPanelProps) {
  return (
    <div className="gaia-confirm" role="group" aria-label={label}>
      <p className="gaia-confirm-question">{question}</p>
      {choices === undefined ? null : <div className="gaia-confirm-choices">{choices}</div>}
      <div className="gaia-confirm-footer">
        <span className="gaia-confirm-consequence">{consequence}</span>
        <Button label="Cancel" emphasis="ghost" compact onPress={onCancel} disabled={disabled} />
        <Button label={confirmLabel} emphasis="primary" compact onPress={onConfirm} disabled={disabled} />
      </div>
    </div>
  );
}
