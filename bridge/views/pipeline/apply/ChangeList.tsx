/**
 * The changes a draft makes to the applied pipeline (or to the smallest one in a first setup), one card each, with the sentence of the
 * edit that made it; Undo sends `pipeline-draft-undo` for that edit, and its refusal shows verbatim beside it. While an applied pipeline is
 * edited, a card also shows the values before and after, and a new gate's card offers its benchmark, which sends `gate-profile-start`.
 */
import type { PipelineChange }                                         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupEdit }                                              from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ChangeRow }                                                   from '../../../design-system/ChangeRow.tsx';
import { CommandButton }                                               from '../../../shell/CommandButton.tsx';
import { ChangeListModel, type ChangeListEditing, type ChangeRowView } from './ChangeListModel.ts';

export interface ChangeListProps {
  readonly setupId:    string;
  readonly changeList: readonly PipelineChange[];
  readonly edits:      readonly SetupEdit[];
  /** Given while an applied pipeline is edited. */
  readonly editing?:   ChangeListEditing | null;
}

function RowActions({ setupId, row }: { readonly setupId: string; readonly row: ChangeRowView }) {
  const { benchmark, undoEditId } = row;
  if (benchmark === null && undoEditId === null) return null;
  return (
    <>
      {benchmark === null
        ? null
        : (
          <CommandButton
            label={benchmark.label}
            accessibleName={`${benchmark.label}: ${row.title}`}
            command={ChangeListModel.benchmarkCommandOf(setupId, benchmark)}
            hasNothingToSend={benchmark.measuring}
          />
        )}
      {undoEditId === null
        ? null
        : <CommandButton label="Undo" accessibleName={`Undo the change to ${row.title}`} command={ChangeListModel.undoCommandOf(setupId, undoEditId)} />}
    </>
  );
}

export function ChangeList({
  setupId, changeList, edits, editing = null
}: ChangeListProps) {
  const rows = ChangeListModel.changeRowsOf(changeList, edits, editing);
  if (rows.length === 0) return <p className="bridge-pipeline-change-list-empty">The draft changes nothing yet.</p>;
  return (
    <ul className="bridge-pipeline-change-list" aria-label="Changes">
      {rows.map((row) => (
        <li key={row.field} className="bridge-pipeline-change-list-item">
          <ChangeRow
            change={row.change}
            title={row.title}
            location={row.location}
            density="card"
            {...(row.before === null ? {} : { before: row.before })}
            {...(row.after === null ? {} : { after: row.after })}
            {...(row.note === null ? {} : { note: row.note })}
            {...(row.benchmark === null && row.undoEditId === null ? {} : { actions: <RowActions setupId={setupId} row={row} /> })}
          />
        </li>
      ))}
    </ul>
  );
}
