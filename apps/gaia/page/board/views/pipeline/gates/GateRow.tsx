/**
 * One row of a phase's gates table: position, name with its quiet tag and its change, command, the other phases it runs in, its network
 * and the time chip. The row itself takes the focus: a double-click or Enter opens its Gate dialog, and Delete takes it out. A press on
 * the time chip sends `gate-profile-start` for this gate in the table's phase, and its refusal shows in the row.
 */

import { Tag }                                from 'design-system/Tag';
import { Text }                               from 'design-system/Text';
import type { KeyboardEvent, SyntheticEvent } from 'react';
import type { BoardCommandDocument }          from '../../../../@types/board/BoardCommandDocument.ts';
import { useControlCommand }                  from '../../../shell/ControlCommandSender.ts';

import { GatesAreaModel, type GateRowView, type ProfileChipView } from './GatesAreaModel.ts';

export interface GateRowProps {
  readonly view:           GateRowView;
  /** The profile start a press on the time chip sends; null where the chip takes no press. */
  readonly profileCommand: BoardCommandDocument | null;
  readonly selected:       boolean;
  readonly onOpen:         (() => void) | null;
  readonly onDelete:       (() => void) | null;
}

interface TimeChipProps {
  readonly chip:    ProfileChipView;
  readonly command: BoardCommandDocument | null;
}

function TimeChip({ chip, command }: TimeChipProps) {
  const sender = useControlCommand(chip.pressable ? command : null);
  const pressable = chip.pressable && command !== null && sender.enabled;
  const chipAttributes = { 'title': chip.title, 'data-tone': chip.tone, 'data-busy': chip.busy ? '' : undefined };
  return (
    <>
      {pressable
        ? <button type="button" className="board-pipeline-gate-time" {...chipAttributes} onClick={() => void sender.send()}>{chip.text}</button>
        : <span className="board-pipeline-gate-time" {...chipAttributes}>{chip.text}</span>}
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </>
  );
}

/** A double-click on the time chip is two presses, never the row's double-click. */
function keepInsideTime(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function GateRow({
  view, profileCommand, selected, onOpen, onDelete
}: GateRowProps) {
  const keyDownOnRow = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' && onOpen !== null) {
      event.preventDefault();
      onOpen();
    } else if (GatesAreaModel.keyDeletesRow(event.key) && onDelete !== null) {
      event.preventDefault();
      onDelete();
    }
  };

  return (
    <div
      className="board-pipeline-gate-row"
      role="group"
      aria-label={view.openLabel ?? view.name}
      aria-haspopup={onOpen === null ? undefined : 'dialog'}
      tabIndex={0}
      data-gate-row-key={view.key}
      data-row-kind={view.rowKind}
      data-change={view.change ?? undefined}
      data-selected={selected ? '' : undefined}
      onDoubleClick={onOpen ?? undefined}
      onKeyDown={keyDownOnRow}
    >
      <span className="board-pipeline-gate-name">
        <Text typeRole="small" subtle>{view.positionText}</Text>
        <span className="board-pipeline-gate-name-text">{view.name}</span>
        {view.tagText === null ? null : <Tag text={view.tagText} tone="neutral" />}
        {view.change === null ? null : <Tag text={view.change} tone="neutral" change={view.change} />}
      </span>
      <span className="board-pipeline-gate-command">{view.command}</span>
      <Text muted>{view.alsoInText}</Text>
      <Text muted>{view.networkText}</Text>
      <span className="board-pipeline-gate-profile" onDoubleClick={keepInsideTime}>
        {view.profileChip === null ? null : <TimeChip chip={view.profileChip} command={profileCommand} />}
      </span>
    </div>
  );
}
