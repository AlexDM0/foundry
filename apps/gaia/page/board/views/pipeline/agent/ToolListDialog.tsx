/**
 * The tools the forge's agents may run, as a dialog over the design step or the forge's settings: each tool with where forge found it or
 * that this machine lacks it, what runs it, a box that keeps it on the list and a missing mark; an Add field names another tool for forge
 * to find. Keeping the list sends it whole, as a draft edit while a setup designs the pipeline, else as the stored pipeline's tools. An added
 * tool forge does not find offers choosing its program in the system's file chooser, and the list is sent again with the tool at that path.
 */
import { useContext, useId, useState } from 'react';
import type { BoardAgentToolDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import {
  Button,
  ChoiceInput,
  DataTable,
  Dialog,
  Row,
  Tag,
  Text,
  TextField,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommandSequence } from '../../../shell/ControlCommandSender.ts';
import { ProgramFileChooserContext } from '../../../shell/ProgramFileChooser.ts';
import {
  SANDBOX_NOTE,
  ToolListModel,
  type ToolListEdit,
  type ToolListTarget
} from './ToolListModel.ts';

type ToolColumn = 'approved' | 'tool' | 'foundAt' | 'usedBy' | 'mark';

export interface ToolListDialogProps {
  readonly tools:   readonly BoardAgentToolDocument[];
  readonly target:  ToolListTarget;
  readonly title:   string;
  readonly isOpen:  boolean;
  readonly onClose: () => void;
}

const COLUMNS = [
  { key: 'approved', label: 'On the list', labelHidden: true },
  { key: 'tool', label: 'Tool' },
  { key: 'foundAt', label: 'Found at' },
  { key: 'usedBy', label: 'Used by' },
  { key: 'mark', label: 'State', labelHidden: true },
] as const;

export function ToolListDialog({
  tools, target, title, isOpen, onClose
}: ToolListDialogProps) {
  const groupName = useId();
  const [edit, setEdit] = useState<ToolListEdit>(() => ToolListModel.editOf(tools));
  const [typedName, setTypedName] = useState('');
  const chooseProgramFile = useContext(ProgramFileChooserContext);
  const sender = useControlCommandSequence({ onApplied: onClose });
  const keepCommand = ToolListModel.keepCommandOf(target, tools, edit);
  const unfoundToolName = ToolListModel.unfoundAddedToolOf(edit, sender.forgeRefusal);
  const keep = async (keptEdit: ToolListEdit): Promise<void> => {
    const command = ToolListModel.keepCommandOf(target, tools, keptEdit);
    if (command !== null) await sender.sendCommands([command]);
  };
  const chooseUnfoundProgram = async (name: string): Promise<void> => {
    if (chooseProgramFile === null) return;
    const path = await chooseProgramFile();
    if (path === null) return;
    const chosenEdit = ToolListModel.withChosenPath(edit, name, path);
    setEdit(chosenEdit);
    await keep(chosenEdit);
  };
  const missingNote = ToolListModel.missingNoteOf(tools);
  const toolRows = ToolListModel.rowsOf(tools).map((row) => ({
    key:   row.name,
    cells: {
      approved: (
        <ChoiceInput
          type="checkbox"
          name={groupName}
          checked={row.isLocked || edit.approvedNames.includes(row.name)}
          accessibleName={`Keep ${row.name} on the list`}
          disabled={row.isLocked || row.isMissing}
          onChange={() => setEdit(ToolListModel.withApproval(edit, row.name, !edit.approvedNames.includes(row.name)))}
        />
      ),
      tool:    <Text mono>{row.name}</Text>,
      foundAt: <Text mono {...(row.isMissing ? { subtle: true } : { muted: true })}>{row.foundAt}</Text>,
      usedBy:  <Text muted>{row.usedBy}</Text>,
      mark:    row.isMissing ? <Tag text="missing" tone="warn" /> : null,
    },
  }));
  const addedRows = edit.addedTools.map((added) => ({
    key:   `added-${added.name}`,
    cells: {
      approved: null,
      tool:     <Text mono>{added.name}</Text>,
      foundAt:  added.path === null ? <Text subtle>Forge finds it when the list is kept</Text> : <Text mono muted>{added.path}</Text>,
      usedBy:   <Text muted>added by hand</Text>,
      mark:     <Tag text="new" tone="neutral" />,
    },
  }));
  const add = (): void => {
    setEdit(ToolListModel.withAdded(edit, tools, typedName));
    setTypedName('');
  };
  return (
    <Dialog
      title={title}
      description="Every program the pipeline's gates, prepare steps and merge train run."
      isOpen={isOpen}
      onDismiss={onClose}
      closeLabel="Close"
      width="wide"
      foot={(
        <>
          <Button label="Cancel" onPress={onClose} />
          <span className="board-control">
            <Button label="Keep these tools" emphasis="primary" disabled={!sender.canSend || keepCommand === null} onPress={() => void keep(edit)} />
            {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
          </span>
        </>
      )}
    >
      <View gap="twelve">
        <DataTable<ToolColumn> label="Agent tools" columns={COLUMNS} columnWidths="32px 120px minmax(0, 2fr) minmax(0, 2fr) 88px" rows={[...toolRows, ...addedRows]} />
        <form
          className="board-agent-tool-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <TextField label="Tool name" labelHidden mono value={typedName} placeholder="pnpm" onChange={setTypedName} />
          <Button label="Add" compact disabled={typedName.trim() === ''} onPress={add} />
        </form>
        {unfoundToolName === null || chooseProgramFile === null
          ? null
          : (
            <Row centerY gap="eight" wrap>
              <Text>{`Forge did not find ${unfoundToolName}. Choose its program, and the list names ${unfoundToolName} at that path.`}</Text>
              <Button
                label="Choose the program…"
                accessibleName={`Choose the ${unfoundToolName} program…`}
                disabled={!sender.canSend}
                onPress={() => void chooseUnfoundProgram(unfoundToolName)}
              />
            </Row>
          )}
        {missingNote === null ? null : <Text muted>{missingNote}</Text>}
        <Text subtle>{SANDBOX_NOTE}</Text>
      </View>
    </Dialog>
  );
}
