/**
 * The changes a draft makes to the applied pipeline (or to the smallest one in a first setup), one card each, with the sentence of the
 * edit that made it; Undo sends `pipeline-draft-undo` for that edit, and its refusal shows verbatim beside it.
 */
import type { PipelineChange } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupEdit }      from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ChangeRow }           from '../../../design-system/ChangeRow.tsx';
import { CommandButton }       from '../../../shell/CommandButton.tsx';
import { ChangeListModel }     from './ChangeListModel.ts';

export interface ChangeListProps {
  readonly setupId:    string;
  readonly changeList: readonly PipelineChange[];
  readonly edits:      readonly SetupEdit[];
}

export function ChangeList({ setupId, changeList, edits }: ChangeListProps) {
  const rows = ChangeListModel.changeRowsOf(changeList, edits);
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
            {...(row.note === null ? {} : { note: row.note })}
            {...(row.undoEditId === null
              ? {}
              : {
                actions: (
                  <CommandButton
                    label="Undo"
                    accessibleName={`Undo the change to ${row.title}`}
                    command={ChangeListModel.undoCommandOf(setupId, row.undoEditId)}
                  />
                )
              })}
          />
        </li>
      ))}
    </ul>
  );
}
