/**
 * An action confirmed in place: the question and its consequence, then the confirming control and Cancel. The neutral strip runs inline
 * as one line of text; the danger strip is a card in the error colours. The confirming control arrives whole, as the caller's command.
 */
import type { ReactNode } from 'react';

import { Button } from '../atoms/Button.tsx';

export interface ConfirmStripProps {
  /** The group's accessible name. */
  readonly label:        string;
  readonly question:     string;
  readonly consequence?: ReactNode;
  readonly tone:         'neutral' | 'danger';
  readonly confirm:      ReactNode;
  readonly cancelLabel:  string;
  readonly onCancel:     () => void;
}

export function ConfirmStrip({
  label, question, consequence, tone, confirm, cancelLabel, onCancel
}: ConfirmStripProps) {
  return (
    <span className="design-system-confirm" role="group" aria-label={label} data-tone={tone}>
      <span className="design-system-confirm-text">
        <span className="design-system-confirm-question">{question}</span>
        {consequence === undefined
          ? null
          : (
            <>
              {' '}
              <span className="design-system-confirm-consequence">{consequence}</span>
            </>
          )}
      </span>
      <span className="design-system-confirm-actions">
        {confirm}
        <Button label={cancelLabel} onPress={onCancel} />
      </span>
    </span>
  );
}
