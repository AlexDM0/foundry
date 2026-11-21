/**
 * "Resume agents stopped by an outage" in the Attention view's page title (decision 35): it sends `fleet-outage-resume`, which resumes
 * every job a network outage stopped across all forges. It is never disabled, with nothing to resume or a forge down, and the answer says
 * what happened in each forge.
 */
import { Button } from 'design-system/Button';

import type { CommandBody } from '../../@types/CommandDocument.ts';
import { useCommandSender } from '../../api/CommandSender.ts';

export const OUTAGE_RESUME: CommandBody = { kind: 'fleet-outage-resume' };

export const OUTAGE_RESUME_LABEL = 'Resume agents stopped by an outage';

export function OutageResumeButton() {
  const { send } = useCommandSender();
  return <Button label={OUTAGE_RESUME_LABEL} onPress={() => void send(OUTAGE_RESUME)} />;
}
