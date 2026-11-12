/**
 * One row of a gates tab: position, name with its kind, command, the other phases it runs in, its network, the stopwatch chip and its
 * change. The row itself takes the focus: a double-click or Enter opens its Gate dialog, and Delete takes it out. A press on the stopwatch
 * chip sends `gate-profile-start` for this gate in the tab's phase, and its refusal shows in the row.
 */
import type { KeyboardEvent, SyntheticEvent } from 'react';

import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import { Tag }                     from '../../../design-system/Tag.tsx';
import { useControlCommand }       from '../../../shell/ControlCommandSender.ts';

import { GatesAreaModel, type GateRowView, type ProfileChipView } from './GatesAreaModel.ts';

export interface GateRowProps {
  readonly view:           GateRowView;
  /** The profile start a press on the stopwatch chip sends; null where the chip takes no press. */
  readonly profileCommand: ControlCommandBody | null;
  readonly onOpen:         (() => void) | null;
  readonly onDelete:       (() => void) | null;
}

interface ProfileChipProps {
  readonly chip:    ProfileChipView;
  readonly command: ControlCommandBody | null;
}

function ProfileChip({ chip, command }: ProfileChipProps) {
  const sender = useControlCommand(chip.pressable ? command : null);
  const pressable = chip.pressable && command !== null && sender.enabled;
  return (
    <>
      <Tag
        text={chip.text}
        tone={chip.tone}
        glyph="stopwatch"
        busy={chip.busy}
        title={chip.title}
        {...(chip.state === null ? {} : { state: chip.state })}
        {...(pressable ? { onPress: () => void sender.send() } : {})}
      />
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </>
  );
}

/** A double-click on the stopwatch chip is two presses, never the row's double-click. */
function keepInsideProfile(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function GateRow({
  view, profileCommand, onOpen, onDelete
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
      className="bridge-pipeline-gate-row"
      role="group"
      aria-label={view.openLabel ?? view.name}
      aria-haspopup={onOpen === null ? undefined : 'dialog'}
      tabIndex={0}
      data-row-kind={view.rowKind}
      data-change={view.change ?? undefined}
      data-proposed={view.proposed ? '' : undefined}
      onDoubleClick={onOpen ?? undefined}
      onKeyDown={keyDownOnRow}
    >
      <span className="bridge-pipeline-gate-position">{view.positionText}</span>
      <span className="bridge-pipeline-gate-name">
        <span className="bridge-pipeline-gate-name-text">{view.name}</span>
        {view.kindText === null ? null : <span className="bridge-pipeline-gate-kind">{view.kindText}</span>}
      </span>
      <span className="bridge-pipeline-gate-command">{view.command}</span>
      <span className="bridge-pipeline-gate-also-in">{view.alsoInText}</span>
      <span className="bridge-pipeline-gate-network">{view.networkText}</span>
      <span className="bridge-pipeline-gate-profile" onDoubleClick={keepInsideProfile}>
        {view.profileChip === null ? null : <ProfileChip chip={view.profileChip} command={profileCommand} />}
        {view.change === null ? null : <Tag text={view.change} tone="neutral" change={view.change} />}
      </span>
    </div>
  );
}
