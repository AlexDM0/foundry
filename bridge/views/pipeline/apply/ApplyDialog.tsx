/**
 * A4Confirm, the first Apply: the board starts using the pipeline as the flow shows it. "Resume the board" (on by default) says how many
 * pending tickets start building and how many at a time, and Apply sends it with `pipeline-apply`; a refusal shows verbatim and the
 * dialog stays open. While Apply commits `CONSTITUTION.md` first, the dialog shows the pending state from the facts, and Cancel becomes
 * Cancel apply. Once the pipeline is applied, the setup record closes and the view shows the live flow.
 */
import { Dialog }   from 'design-system/Dialog';
import { Text }     from 'design-system/Text';
import { View }     from 'design-system/View';
import { useState } from 'react';

import type { PipelineSetupFacts }      from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ApplyDialogModel }             from './ApplyDialogModel.ts';
import { ApplyFoot, ApplyPendingState } from './ApplyPendingState.tsx';

export interface ApplyDialogProps {
  readonly setup:              PipelineSetupFacts;
  readonly pendingTicketCount: number;
  /** Null when the facts carry no concurrency. */
  readonly concurrencyLimit:   number | null;
  readonly onClose:            () => void;
  /** Called with the board's resume choice once the Overseer took the Apply. */
  readonly onApplySent?:       (resumesBoard: boolean) => void;
}

export function ApplyDialog({
  setup, pendingTicketCount, concurrencyLimit, onClose, onApplySent
}: ApplyDialogProps) {
  const { record, applyState } = setup;
  const [resumesBoard, setResumesBoard] = useState(applyState?.resumesBoard ?? true);
  const constitutionNote = ApplyDialogModel.constitutionNoteOf(record);
  const choosesResume = applyState === null || applyState.state === 'refused';
  return (
    <Dialog
      title="Apply the pipeline?"
      description="The board starts using it as shown on the flow."
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="standard"
      foot={(
        <ApplyFoot
          setupId={record.setupId}
          applyState={applyState}
          closeLabel="Cancel"
          onClose={onClose}
          applyLabel="Apply"
          applyCommand={ApplyDialogModel.applyCommandOf(record, resumesBoard)}
          {...(onApplySent === undefined ? {} : { onApplySent: () => onApplySent(resumesBoard) })}
        />
      )}
    >
      <View gap="eighteen">
        {constitutionNote === null ? null : <Text element="p" muted>{constitutionNote}</Text>}
        {choosesResume
          ? (
            <View gap="eight">
              <Text typeRole="small" subtle>What starts</Text>
              <label className="bridge-pipeline-apply-resume">
                <input type="checkbox" checked={resumesBoard} onChange={(event) => setResumesBoard(event.currentTarget.checked)} />
                <View>
                  <Text bold>Resume the board</Text>
                  <Text muted>{ApplyDialogModel.resumeTextOf(pendingTicketCount, concurrencyLimit)}</Text>
                </View>
              </label>
            </View>
          )
          : null}
        {applyState === null ? null : <ApplyPendingState applyState={applyState} constitutionMarkdown={record.constitution?.markdown ?? null} />}
      </View>
    </Dialog>
  );
}
