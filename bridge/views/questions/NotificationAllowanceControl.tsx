/** The button that asks the browser to allow question notifications, shown only while User has neither allowed nor refused them. */
import { useState } from 'react';

import { Button }                                       from '../../design-system/Button.tsx';
import type { NotificationAllowance, QuestionNotifier } from './QuestionAlerts.ts';

export interface NotificationAllowanceControlProps {
  readonly notifier: QuestionNotifier;
}

export function NotificationAllowanceControl({ notifier }: NotificationAllowanceControlProps) {
  const [allowance, setAllowance] = useState<NotificationAllowance>(() => notifier.allowance());
  if (allowance !== 'default') return null;
  return (
    <Button label="Notify me of new questions" onPress={() => void notifier.askAllowance().then(setAllowance)} />
  );
}
