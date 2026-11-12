/**
 * The foot every step and gate dialog ends with: its own actions on the start side, then Cancel and the primary Save, and under them the
 * Overseer's refusal of the last Save, verbatim.
 */
import type { ReactNode } from 'react';

import { Button } from '../../../design-system/Button.tsx';

export interface StepDialogFootProps {
  readonly start?:    ReactNode;
  readonly saveLabel: string;
  readonly canSave:   boolean;
  readonly refusal:   string | null;
  readonly onCancel:  () => void;
  readonly onSave:    () => void;
}

export function StepDialogFoot({
  start, saveLabel, canSave, refusal, onCancel, onSave
}: StepDialogFootProps) {
  return (
    <div className="bridge-pipeline-dialog-foot">
      <div className="bridge-pipeline-dialog-foot-row">
        {start}
        <span className="bridge-pipeline-dialog-foot-gap" />
        <Button label="Cancel" onPress={onCancel} />
        <Button label={saveLabel} emphasis="primary" disabled={!canSave} onPress={onSave} />
      </div>
      {refusal === null ? null : <span className="bridge-refusal" role="status">{refusal}</span>}
    </div>
  );
}
