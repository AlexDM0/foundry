/** The button that asks the browser to allow question notifications, shown only while User has neither allowed nor refused them. */
import { Button }   from 'design-system/Button';
import { useState } from 'react';

import type { NotificationAllowance, QuestionNotifier } from './QuestionAlerts.ts';

export interface NotificationAllowanceControlProps {
  readonly notifier: QuestionNotifier;
  /** The dense row button, for a foot of small links. */
  readonly dense?:   boolean;
}

export function NotificationAllowanceControl({ notifier, dense = false }: NotificationAllowanceControlProps) {
  const [allowance, setAllowance] = useState<NotificationAllowance>(() => notifier.allowance());
  if (allowance !== 'default') return null;
  return (
    <Button label="Notify me of new questions" dense={dense} onPress={() => void notifier.askAllowance().then(setAllowance)} />
  );
}
