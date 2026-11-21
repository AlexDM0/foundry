/**
 * More, the live job's menu of the moves that stop work (Wind down, Stop, Fresh agent) under the ticket form's Watch. Each item opens its
 * confirmation in its place, naming the ticket, the branch and the hold it leaves, so no stop is one click; the confirm posts the
 * board command and closes the menu once applied, a refusal showing verbatim beside it; Cancel puts the item back and the focus on it.
 */

import { ConfirmStrip }                from 'design-system/ConfirmStrip';
import { Menu, MenuItem }              from 'design-system/Menu';
import { useEffect, useRef, useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }                                     from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                  from '../../../@types/board/BoardCommandDocument.ts';
import { CommandButton }                                              from '../../shell/CommandButton.tsx';
import { TextParts }                                                  from './DetailParts.tsx';
import type { JobStopItemModel, JobStopMove, TicketJobControlsModel } from './TicketOverviewModel.ts';

const CONFIRMATION_NAME_OF_MOVE: Readonly<Record<JobStopMove, string>> = {
  'wind-down': 'Confirm winding down',
  'stop':      'Confirm stopping',
  'fresh':     'Confirm a fresh agent for',
};

function commandOf(jobId: string, move: JobStopMove): BoardCommandDocument {
  const boardCommandVersion = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand;
  return move === 'fresh' ? {
    boardCommandVersion, kind: 'job-fresh', jobId, incidentId: null
  } : {
    boardCommandVersion, kind: 'job-stop', jobId, mode: move
  };
}

interface JobStopMenuProps {
  readonly ticketId: string;
  readonly controls: TicketJobControlsModel;
}

export function JobStopMenu({ ticketId, controls }: JobStopMenuProps) {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const [confirming, setConfirming] = useState<JobStopMove | null>(null);
  const itemToFocus = useRef<JobStopMove | null>(null);
  const itemSlots = useRef<Partial<Record<JobStopMove, HTMLDivElement | null>>>({});

  // Once Cancel put an item back in its slot, the focus goes to it.
  useEffect(() => {
    const move = itemToFocus.current;
    if (move === null) return;
    itemToFocus.current = null;
    itemSlots.current[move]?.querySelector('button')?.focus();
  });

  const changeOpen = (open: boolean): void => {
    setMenuIsOpen(open);
    if (!open) setConfirming(null);
  };

  const slotOf = (item: JobStopItemModel) => (
    // A slot holds the item or, in its place, the item's confirmation; Cancel hands the focus back to the item through it.
    <div
      key={item.move}
      ref={(element) => {
        itemSlots.current[item.move] = element;
      }}
    >
      {confirming === item.move
        ? (
          <ConfirmStrip
            label={`${CONFIRMATION_NAME_OF_MOVE[item.move]} ${controls.jobId}`}
            question={item.question}
            consequence={<TextParts parts={item.consequence} />}
            tone="danger"
            confirm={(
              <CommandButton
                label={item.confirmLabel}
                command={commandOf(controls.jobId, item.move)}
                answeredWhileInstallHeld={item.move !== 'fresh'}
                danger
                onApplied={() => changeOpen(false)}
              />
            )}
            cancelLabel="Cancel"
            onCancel={() => {
              itemToFocus.current = item.move;
              setConfirming(null);
            }}
          />
        )
        : <MenuItem label={item.label} description={item.description} closing="stays-open" onChoose={() => setConfirming(item.move)} />}
    </div>
  );

  return (
    <Menu
      label="Controls that stop work"
      trigger="button"
      align="end"
      wide
      triggerContent={<>More <span aria-hidden="true">···</span></>}
      triggerName={`More controls for ${controls.jobId} and #${ticketId}`}
      isOpen={menuIsOpen}
      onOpenChange={changeOpen}
    >
      {controls.stopItems.map(slotOf)}
    </Menu>
  );
}
