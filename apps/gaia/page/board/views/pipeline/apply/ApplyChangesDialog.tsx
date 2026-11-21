/**
 * A6bApplyChanges, Apply on a running board: the changes as rows, each worded by what it names, where it is and its kind (a changed
 * `constitution` is committed to main on Apply), the version line and the tickets in flight. Back closes it; Apply N changes sends
 * `pipeline-apply` without resuming the board, and a refusal shows verbatim with nothing else offered. While Apply commits
 * `CONSTITUTION.md` first, the pending, held and refused states show as in the first Apply, with Cancel apply. Over entities
 * (MonoApplyChanges) the rows group by level under each level's name and count, a copy's set as one row with its count of edits, and the
 * tickets in flight group by entity, a ticket in a package stage under the package as a crossing from its entity; a refusal, such as
 * removing an entity a ticket names, shows verbatim as every refusal does.
 */
import type { BoardAppliedPipelineDocument, BoardPipelineFlowDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ChangeRow,
  CountBadge,
  Dialog,
  MonoId,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { ChangeGroupView }                   from '../entities/ChangeGroupModel.ts';
import { PipelineLevelModel }                     from '../entities/PipelineLevelModel.ts';
import { EntityWorkModel, type EntityWorkTicket } from '../live/EntityWorkModel.ts';
import { ApplyChangesDialogModel }                from './ApplyChangesDialogModel.ts';
import { ApplyFoot, ApplyPendingState }           from './ApplyPendingState.tsx';
import { InFlightNote }                           from './InFlightNote.tsx';

export interface ApplyChangesDialogProps {
  readonly setup:        BoardPipelineSetupDocument;
  readonly flow:         BoardPipelineFlowDocument;
  readonly pipeline:     BoardAppliedPipelineDocument | undefined;
  readonly onClose:      () => void;
  /** Called once the Overseer took the Apply, which never resumes the board. */
  readonly onApplySent?: () => void;
  /** Over entities, every ticket's entity and stage, which group the tickets in flight; absent keeps them one list. */
  readonly tickets?:     readonly EntityWorkTicket[];
}

/** One level's rows under its name and count; a copy's set is one row naming the copy and its count of edits. */
function LevelRows({ group }: { readonly group: ChangeGroupView }) {
  return (
    <section className="board-pipeline-apply-changes-level" aria-label={`${group.name} changes`}>
      <span className="board-pipeline-apply-changes-level-head">
        {PipelineLevelModel.isForgeLevel(group.level) ? <Text bold>{group.name}</Text> : <MonoId text={group.name} tone="strong" weight="bold" />}
        <CountBadge count={group.changeCount} tone="plain" />
      </span>
      <ul className="board-pipeline-apply-changes-rows" aria-label={group.headName}>
        {group.items.map((item) => (
          <li key={item.itemKind === 'edit' ? item.row.field : item.batch.batchId} className="board-pipeline-apply-changes-row">
            {item.itemKind === 'edit'
              ? <ChangeRow change={item.row.change} title={item.row.title} location={item.row.location} density="row" />
              : (
                <span className="board-pipeline-apply-changes-batch">
                  <Text bold>{item.batch.title}</Text>
                  <Tag text={item.batch.editCountText} tone="state" stateTone="accent" />
                </span>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ApplyChangesDialog({
  setup, flow, pipeline, onClose, onApplySent, tickets
}: ApplyChangesDialogProps) {
  const { record, applyState } = setup;
  const rows = ApplyChangesDialogModel.changeRowsOf(flow.changeList, flow);
  const groups = ApplyChangesDialogModel.levelGroupsOf(flow.changeList, { record, pipeline });
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(pipeline);
  const inFlightGroups = groups === null || tickets === undefined
    ? null
    : EntityWorkModel.inFlightGroupsOf(flow.ticketIdsInFlight, tickets, ApplyChangesDialogModel.entityOrderOf({ record, pipeline }));
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
        {groups === null
          ? (
            <ul className="board-pipeline-apply-changes-rows" aria-label="Changes to apply">
              {rows.map((row) => (
                <li key={row.field} className="board-pipeline-apply-changes-row">
                  <ChangeRow change={row.change} title={row.title} location={row.location} density="row" />
                </li>
              ))}
            </ul>
          )
          : groups.map((group) => <LevelRows key={PipelineLevelModel.itemAtLevel(group.level, null)} group={group} />)}
        <InFlightNote
          ticketIds={flow.ticketIdsInFlight}
          lead={ApplyChangesDialogModel.inFlightLeadOf(flow.ticketIdsInFlight.length)}
          text={ApplyChangesDialogModel.inFlightTextOf(appliedRevision)}
          groups={inFlightGroups}
        />
        {applyState === null ? null : <ApplyPendingState applyState={applyState} constitutionMarkdown={record.constitution?.markdown ?? null} />}
      </View>
    </Dialog>
  );
}
