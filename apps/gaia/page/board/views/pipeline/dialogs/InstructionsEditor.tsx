/**
 * A role's brief, the instruction files read top to bottom, in one ruled box: a row per file with Edit, Open or ×, a removed constitution's
 * quiet row that puts it back, and "Add a file". The list is the form's: nothing is sent until the dialog's Save.
 */

import { useId, useState }                                                 from 'react';
import type { BoardInstructionDocument, BoardResolvedInstructionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Button,
  Dialog,
  ListedFile,
  Row,
  Switch,
  Text,
  TextButton
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { FlowGlyph } from '../flow/FlowGlyph.tsx';

import type { StepDialogRole }                                                      from './AgentStepDialogModel.ts';
import { InstructionsEditorModel, type ConstitutionPlace, type InstructionRowView } from './InstructionsEditorModel.ts';

export interface InstructionsEditorProps {
  readonly label:           string;
  readonly role:            StepDialogRole;
  readonly entries:         readonly BoardInstructionDocument[];
  readonly resolvedEntries: readonly BoardResolvedInstructionDocument[];
  readonly constitution:    ConstitutionPlace;
  readonly onChange:        (entries: BoardInstructionDocument[]) => void;
}

const READING_ORDER_LEAD = 'The agent reads these files top to bottom';

const BUILT_IN_BRIEF_NOTE = 'You can remove every file. Then a basic built-in brief stays, so the agent still knows its job.';

const EMPTY_LIST_NOTE = 'No file. The agent uses the basic built-in brief.';

const CUT_TEXT_NOTE = 'The preview stops here; the file goes on.';

interface FileTextDialogProps {
  readonly row:     InstructionRowView;
  readonly onClose: () => void;
}

function FileTextDialog({ row, onClose }: FileTextDialogProps) {
  return (
    <Dialog title={row.fileName} kicker="Instruction file" isOpen onDismiss={onClose} closeLabel="Close" width="wide">
      <pre className="board-pipeline-dialog-file-text">{row.text}</pre>
      {row.textIsCut ? <Text typeRole="tab" subtle element="p" marginTop="eight">{CUT_TEXT_NOTE}</Text> : null}
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
    <div className="board-pipeline-dialog-add-file">
      <label className="board-pipeline-dialog-label" htmlFor={inputId}>Path on main</label>
      <input
        id={inputId}
        className="board-pipeline-dialog-input"
        data-mono=""
        value={path}
        placeholder="docs/example-brief.md"
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && path.trim() !== '') onAdd(path);
        }}
      />
      <Button label="Add" compact disabled={path.trim() === ''} onPress={() => onAdd(path)} />
      <Button label="Cancel" compact emphasis="ghost" onPress={onCancel} />
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
  const showsIncludeConstitution = InstructionsEditorModel.offersConstitution(role) && !InstructionsEditorModel.includesConstitution(entries);
  return (
    <div className="board-pipeline-dialog-instructions" role="group" aria-labelledby={labelId}>
      <Row gap="ten" centerY wrap>
        <Text typeRole="title" id={labelId}>{label}</Text>
        <Text muted>{READING_ORDER_LEAD}</Text>
      </Row>
      <div className="board-pipeline-dialog-brief">
        {showsIncludeConstitution
          ? (
            <div className="board-pipeline-dialog-brief-row" data-quiet="">
              <span className="board-pipeline-dialog-brief-row-text"><Text muted>Constitution not included</Text></span>
              <Text typeRole="tab" muted>Include it</Text>
              <Switch accessibleName="Include the constitution" checked={false} onToggle={() => onChange(InstructionsEditorModel.withConstitution(entries))} />
            </div>
          )
          : null}
        {rows.map((row, i) => {
          const openAction = row.editHref === null
            ? (row.text === null ? null : <TextButton label="Open" underlined onPress={() => setOpenedRow(row)} />)
            : <TextButton label="Edit" underlined href={row.editHref} />;
          return (
            <ListedFile
              key={row.key}
              name={row.fileName}
              roleText={row.roleText}
              action={openAction}
              removeLabel={row.removeLabel}
              onRemove={() => onChange(InstructionsEditorModel.withoutEntryAt(entries, i))}
              ruled
            />
          );
        })}
        {entries.length === 0 ? <div className="board-pipeline-dialog-brief-row"><Text muted>{EMPTY_LIST_NOTE}</Text></div> : null}
        <div className="board-pipeline-dialog-brief-row" data-foot="">
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
            : (
              <>
                <span className="board-pipeline-dialog-brief-add">
                  <FlowGlyph glyph="plus" />
                  <TextButton label="Add a file" underlined onPress={() => setAddsFile(true)} />
                </span>
                <Text typeRole="tab" subtle>The file must exist on main.</Text>
              </>
            )}
        </div>
      </div>
      <Text typeRole="tab" subtle>{BUILT_IN_BRIEF_NOTE}</Text>
      {openedRow === null ? null : <FileTextDialog row={openedRow} onClose={() => setOpenedRow(null)} />}
    </div>
  );
}
