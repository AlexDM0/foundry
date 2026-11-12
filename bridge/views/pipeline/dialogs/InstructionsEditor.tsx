/**
 * A role's instruction list, read top to bottom: a row per file with its note, Edit on the constitution, Open on a file whose text the
 * facts carry (a read-only dialog of it), and × to remove it. A removed constitution leaves a dashed row whose switch puts it back at the
 * top; "Add a file" opens a path field. The list is the form's: nothing is sent until the dialog's Save.
 */
import { useId, useState } from 'react';

import type { InstructionEntry }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { ResolvedInstructionEntry } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { Button, TextButton }            from '../../../design-system/Button.tsx';
import { Dialog }                        from '../../../design-system/Dialog.tsx';
import { ListedFile }                    from '../../../design-system/ListedFile.tsx';
import { Switch }                        from '../../../design-system/Switch.tsx';

import type { StepDialogRole }                                                      from './AgentStepDialogModel.ts';
import { InstructionsEditorModel, type ConstitutionPlace, type InstructionRowView } from './InstructionsEditorModel.ts';

export interface InstructionsEditorProps {
  readonly label:           string;
  readonly role:            StepDialogRole;
  readonly entries:         readonly InstructionEntry[];
  readonly resolvedEntries: readonly ResolvedInstructionEntry[];
  readonly constitution:    ConstitutionPlace;
  readonly onChange:        (entries: InstructionEntry[]) => void;
}

const READING_ORDER_NOTE = 'Read top to bottom. Every item can be removed; with none left, a basic built-in brief stays, so the agent still knows its job.';

const EMPTY_LIST_NOTE = 'No file left: the agent reads its basic built-in brief.';

const CUT_TEXT_NOTE = 'The preview stops here; the file goes on.';

interface FileTextDialogProps {
  readonly row:     InstructionRowView;
  readonly onClose: () => void;
}

function FileTextDialog({ row, onClose }: FileTextDialogProps) {
  return (
    <Dialog title={row.fileName} kicker="Instruction file" isOpen onDismiss={onClose} closeLabel="Close" width="wide">
      <pre className="bridge-pipeline-dialog-file-text">{row.text}</pre>
      {row.textIsCut ? <p className="bridge-pipeline-dialog-note">{CUT_TEXT_NOTE}</p> : null}
    </Dialog>
  );
}

interface AddFileFieldProps {
  readonly onAdd:    (path: string) => void;
  readonly onCancel: () => void;
}

function AddFileField({ onAdd, onCancel }: AddFileFieldProps) {
  const [path, setPath] = useState('');
  const inputId = useId();
  return (
    <div className="bridge-pipeline-dialog-add-file">
      <label className="bridge-pipeline-dialog-label" htmlFor={inputId}>Path on main</label>
      <input
        id={inputId}
        className="bridge-pipeline-dialog-input"
        data-mono=""
        value={path}
        placeholder="docs/example-brief.md"
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && path.trim() !== '') onAdd(path);
        }}
      />
      <Button label="Add" disabled={path.trim() === ''} onPress={() => onAdd(path)} />
      <Button label="Cancel" emphasis="quiet" onPress={onCancel} />
    </div>
  );
}

export function InstructionsEditor({
  label, role, entries, resolvedEntries, constitution, onChange
}: InstructionsEditorProps) {
  const [openedRow, setOpenedRow] = useState<InstructionRowView | null>(null);
  const [addsFile, setAddsFile] = useState(false);
  const labelId = useId();
  const rows = InstructionsEditorModel.rowsOf(entries, role, constitution, resolvedEntries);
  const showsAddConstitution = InstructionsEditorModel.offersConstitution(role) && !InstructionsEditorModel.includesConstitution(entries);
  return (
    <div className="bridge-pipeline-dialog-instructions" role="group" aria-labelledby={labelId}>
      <div className="bridge-pipeline-dialog-instructions-head">
        <span className="bridge-pipeline-dialog-label" id={labelId}>{label}</span>
        <TextButton label="Add a file" onPress={() => setAddsFile(true)} />
      </div>
      <div className="bridge-pipeline-dialog-instruction-rows">
        {showsAddConstitution
          ? (
            <div className="bridge-pipeline-dialog-constitution-off">
              <span className="bridge-pipeline-dialog-constitution-off-text">Constitution not included</span>
              <span className="bridge-pipeline-dialog-constitution-off-label">Add constitution</span>
              <Switch accessibleName="Add constitution" checked={false} onToggle={() => onChange(InstructionsEditorModel.withConstitution(entries))} />
            </div>
          )
          : null}
        {rows.map((row, i) => {
          const openAction = row.editHref === null
            ? (row.text === null ? undefined : { label: 'Open', onPress: () => setOpenedRow(row) })
            : { label: 'Edit', href: row.editHref };
          return (
            <ListedFile
              key={row.key}
              name={row.fileName}
              roleText={row.roleText}
              removeLabel={row.removeLabel}
              onRemove={() => onChange(InstructionsEditorModel.withoutEntryAt(entries, i))}
              {...(openAction === undefined ? {} : { openAction })}
            />
          );
        })}
      </div>
      {addsFile
        ? (
          <AddFileField
            onAdd={(path) => {
              onChange(InstructionsEditorModel.withFile(entries, path));
              setAddsFile(false);
            }}
            onCancel={() => setAddsFile(false)}
          />
        )
        : null}
      <p className="bridge-pipeline-dialog-note">{entries.length === 0 ? EMPTY_LIST_NOTE : READING_ORDER_NOTE}</p>
      {openedRow === null ? null : <FileTextDialog row={openedRow} onClose={() => setOpenedRow(null)} />}
    </div>
  );
}
