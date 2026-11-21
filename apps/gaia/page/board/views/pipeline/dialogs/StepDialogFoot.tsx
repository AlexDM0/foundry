/**
 * The foot every step and gate dialog ends with: its own actions on the start side, then Cancel and the primary Save, and under them the
 * Overseer's refusal of the last Save, verbatim.
 */
import { Button }         from 'design-system/Button';
import type { ReactNode } from 'react';


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
    <div className="board-pipeline-dialog-foot">
      <div className="board-pipeline-dialog-foot-row">
        {start}
        <span className="board-pipeline-dialog-foot-gap" />
        <Button label="Cancel" onPress={onCancel} />
        <Button label={saveLabel} emphasis="primary" disabled={!canSave} onPress={onSave} />
      </div>
      {refusal === null ? null : <span className="board-refusal" role="status">{refusal}</span>}
    </div>
  );
}
