/**
 * An action confirmed in place: the question and its consequence, any choices, then the confirming control and Cancel. The neutral strip runs
 * inline as one line, its Cancel compact, or stacks when it has choices; the danger strip is a card in the error colours with a full-size Cancel.
 * The confirming control and the choices arrive whole from the caller.
 */
import type { ReactNode } from 'react';

import { Button } from '../atoms/Button.tsx';

export interface ConfirmStripProps {
  /** The group's accessible name. */
  readonly label:        string;
  readonly question:     string;
  readonly consequence?: ReactNode;
  /** The ways the action can go, such as two options to choose from, shown side by side between the question and the actions. */
  readonly choices?:     ReactNode;
  readonly tone:         'neutral' | 'danger';
  readonly confirm:      ReactNode;
  readonly cancelLabel:  string;
  readonly onCancel:     () => void;
}

export function ConfirmStrip({
  label, question, consequence, choices, tone, confirm, cancelLabel, onCancel
}: ConfirmStripProps) {
  return (
    <span className="design-system-confirm" role="group" aria-label={label} data-tone={tone} data-with-choices={choices === undefined ? undefined : ''}>
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
      {choices === undefined ? null : <span className="design-system-confirm-choices">{choices}</span>}
      <span className="design-system-confirm-actions">
        {confirm}
        <Button label={cancelLabel} compact={tone === 'neutral'} onPress={onCancel} />
      </span>
    </span>
  );
}
