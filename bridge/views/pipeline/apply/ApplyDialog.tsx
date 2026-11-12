/**
 * A4Confirm, the first Apply: the board starts using the pipeline as the flow shows it. "Resume the board" (on by default) says how many
 * pending tickets start building and how many at a time, and Apply sends it with `pipeline-apply`; a refusal shows verbatim and the
 * dialog stays open. While Apply commits `CONSTITUTION.md` first, the dialog shows the pending state from the facts, and Cancel becomes
 * Cancel apply. Once the pipeline is applied, the setup record closes and the view shows the live flow.
 */
import { useState } from 'react';

import type { PipelineSetupFacts }      from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { Dialog }                       from '../../../design-system/Dialog.tsx';
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
      width="narrow"
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
      <div className="bridge-pipeline-apply">
        {constitutionNote === null ? null : <p className="bridge-pipeline-apply-note">{constitutionNote}</p>}
        {choosesResume
          ? (
            <label className="bridge-pipeline-apply-resume">
              <input type="checkbox" checked={resumesBoard} onChange={(event) => setResumesBoard(event.currentTarget.checked)} />
              <span className="bridge-pipeline-apply-resume-text">
                <strong>Resume the board</strong>
                <span className="bridge-pipeline-apply-resume-detail">{ApplyDialogModel.resumeTextOf(pendingTicketCount, concurrencyLimit)}</span>
              </span>
            </label>
          )
          : null}
        {applyState === null ? null : <ApplyPendingState applyState={applyState} constitutionMarkdown={record.constitution?.markdown ?? null} />}
      </div>
    </Dialog>
  );
}
