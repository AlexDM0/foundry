/**
 * A6bApplyChanges, Apply on a running board: the changes as rows, each worded by what it names, where it is and its kind (a changed
 * `constitution` is committed to main on Apply), the version line and the tickets in flight. Back closes it; Apply N changes sends
 * `pipeline-apply` without resuming the board, and a refusal shows verbatim with nothing else offered. While Apply commits
 * `CONSTITUTION.md` first, the pending, held and refused states show as in the first Apply, with Cancel apply.
 */
import { ChangeRow } from 'design-system/ChangeRow';
import { Dialog }    from 'design-system/Dialog';
import { View }      from 'design-system/View';

import type { AppliedPipelineFacts, PipelineFlowFacts, PipelineSetupFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ApplyChangesDialogModel }                                          from './ApplyChangesDialogModel.ts';
import { ApplyFoot, ApplyPendingState }                                     from './ApplyPendingState.tsx';
import { InFlightNote }                                                     from './InFlightNote.tsx';

export interface ApplyChangesDialogProps {
  readonly setup:        PipelineSetupFacts;
  readonly flow:         PipelineFlowFacts;
  readonly pipeline:     AppliedPipelineFacts | undefined;
  readonly onClose:      () => void;
  /** Called once the Overseer took the Apply, which never resumes the board. */
  readonly onApplySent?: () => void;
}

export function ApplyChangesDialog({
  setup, flow, pipeline, onClose, onApplySent
}: ApplyChangesDialogProps) {
  const { record, applyState } = setup;
  const rows = ApplyChangesDialogModel.changeRowsOf(flow.changeList, flow);
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(pipeline);
  return (
    <Dialog
      title={ApplyChangesDialogModel.titleOf(rows.length)}
      description={ApplyChangesDialogModel.versionLineOf(appliedRevision)}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="standard"
      foot={(
        <ApplyFoot
          setupId={record.setupId}
          applyState={applyState}
          closeLabel="Back"
          onClose={onClose}
          applyLabel={ApplyChangesDialogModel.applyLabelOf(rows.length)}
          applyCommand={ApplyChangesDialogModel.applyCommandOf(record)}
          {...(onApplySent === undefined ? {} : { onApplySent })}
        />
      )}
    >
      <View gap="eighteen">
        <ul className="bridge-pipeline-apply-changes-rows" aria-label="Changes to apply">
          {rows.map((row) => (
            <li key={row.field} className="bridge-pipeline-apply-changes-row">
              <ChangeRow change={row.change} title={row.title} location={row.location} density="row" />
            </li>
          ))}
        </ul>
        <InFlightNote
          ticketIds={flow.ticketIdsInFlight}
          lead={ApplyChangesDialogModel.inFlightLeadOf(flow.ticketIdsInFlight.length)}
          text={ApplyChangesDialogModel.inFlightTextOf(appliedRevision)}
        />
        {applyState === null ? null : <ApplyPendingState applyState={applyState} constitutionMarkdown={record.constitution?.markdown ?? null} />}
      </View>
    </Dialog>
  );
}
