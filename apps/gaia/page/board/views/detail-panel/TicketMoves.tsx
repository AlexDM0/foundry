/**
 * The ticket form's other moves, each a button beside the effect it has. A move that needs a reason (Hold…, Park…), domains (Set
 * network…), a choice (Priority…) or a confirmation (Delivered by hand…) only opens its row under itself, one row at a time; the row's
 * button posts the board command, and Cancel closes it with nothing sent. A closed row hands the focus back to the move that opened it,
 * or to the first move when that one is gone. Keyed by ticket by its caller, so typed text never carries over to the next ticket opened.
 */
import { Button } from 'design-system/Button';
import {
  Fragment,
  useEffect,
  useRef,
  useState
} from 'react';

import { PAGE_CONTRACT_VERSIONS }     from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }  from '../../../@types/board/BoardCommandDocument.ts';
import { CommandButton }              from '../../shell/CommandButton.tsx';
import { DetailControlsModelUtil }    from './DetailControlsModel.ts';
import { TextParts }                  from './DetailParts.tsx';
import type { MoveModel, TicketMove } from './TicketOverviewModel.ts';

const COMMAND_VERSION = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand;

/** The command of a move that needs no field; `null` where the forge does not offer it, so the button stays disabled. */
function commandOf(ticketId: string, move: MoveModel): BoardCommandDocument | null {
  if (!move.sendable) return null;
  switch (move.move) {
    case 'ready':
      return { boardCommandVersion: COMMAND_VERSION, kind: 'ticket-ready', ticketIds: [ticketId] };
    case 'merge-accept':
      return { boardCommandVersion: COMMAND_VERSION, kind: 'merge-accept', ticketId };
    case 'unhold':
      return { boardCommandVersion: COMMAND_VERSION, kind: 'ticket-unhold', ticketId };
    case 'merge-update':
      return { boardCommandVersion: COMMAND_VERSION, kind: 'merge-update', ticketId };
    default:
      return null;
  }
}

interface MoveButtonProps {
  readonly ticketId: string;
  readonly move:     MoveModel;
  readonly primary?: boolean;
  /** The 30px button of the Other moves rows. */
  readonly compact?: boolean;
}

/** A move sent at once, such as Ready, Accept or Update branch. */
export function MoveButton({
  ticketId, move, primary = false, compact = false
}: MoveButtonProps) {
  return <CommandButton label={move.label} command={commandOf(ticketId, move)} primary={primary} compact={compact} />;
}

interface FieldRowProps {
  readonly ticketId: string;
  readonly move:     MoveModel;
  readonly onClose:  () => void;
}

/** Park asks User a question, so it needs a reason; a hold may go without one. */
function ReasonRow({ ticketId, move, onClose }: FieldRowProps) {
  const [reason, setReason] = useState('');
  const isPark = move.move === 'park';
  let command: BoardCommandDocument | null = {
    boardCommandVersion: COMMAND_VERSION, kind: 'ticket-hold', ticketId, reason
  };
  if (isPark) {
    command = reason.trim() === '' ? null : {
      boardCommandVersion: COMMAND_VERSION, kind: 'ticket-park', ticketId, reason, incidentId: null
    };
  }
  return (
    <div className="board-detail-reason" role="group" aria-label={isPark ? 'Park with a reason' : 'Hold with a reason'}>
      <input className="board-detail-input" aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      <CommandButton label={isPark ? 'Park' : 'Hold'} command={command} primary onApplied={onClose} />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

/** The confirmation of a by-hand delivery, with the branch and the commit User landed, both optional. */
function ByHandRow({ ticketId, move, onClose }: FieldRowProps) {
  const [branch, setBranch] = useState('');
  const [commit, setCommit] = useState('');
  const command: BoardCommandDocument | null = move.sendable
    ? {
      boardCommandVersion: COMMAND_VERSION,
      kind:                'ticket-deliver-by-hand',
      ticketId,
      branch:              branch.trim() === '' ? null : branch.trim(),
      commit:              commit.trim() === '' ? null : commit.trim(),
    }
    : null;
  return (
    <div className="board-detail-reason" role="group" aria-label="Delivered by hand">
      <input className="board-detail-input" aria-label="Branch" placeholder="Branch (optional)" value={branch} onChange={(event) => setBranch(event.target.value)} />
      <input className="board-detail-input" aria-label="Commit" placeholder="Commit (optional)" value={commit} onChange={(event) => setCommit(event.target.value)} />
      <CommandButton label="Record delivered" command={command} primary onApplied={onClose} />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

function DomainsRow({ ticketId, move, onClose }: FieldRowProps) {
  const [domainsText, setDomainsText] = useState(() => (move.domains ?? []).join(', '));
  return (
    <div className="board-detail-reason" role="group" aria-label="Network">
      <input
        className="board-detail-input"
        aria-label="Network domains"
        placeholder="example.com, api.example.com"
        value={domainsText}
        onChange={(event) => setDomainsText(event.target.value)}
      />
      <CommandButton
        label="Set network"
        command={{
          boardCommandVersion: COMMAND_VERSION, kind: 'ticket-network', ticketId, domains: DetailControlsModelUtil.networkDomainsOf(domainsText)
        }}
        primary
        onApplied={onClose}
      />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

function PrioritiesRow({ ticketId, move, onClose }: FieldRowProps) {
  return (
    <div className="board-detail-reason" role="group" aria-label="Priority">
      {(move.priorities ?? []).map((priority) => (
        <CommandButton
          key={priority}
          label={priority}
          accessibleName={`Priority ${priority}`}
          command={{
            boardCommandVersion: COMMAND_VERSION, kind: 'ticket-priority', ticketId, priority
          }}
          onApplied={onClose}
        />
      ))}
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

export function TicketMoves({ ticketId, moves }: { readonly ticketId: string; readonly moves: readonly MoveModel[] }) {
  const [openMove, setOpenMove] = useState<TicketMove | null>(null);
  const moveToFocus = useRef<TicketMove | null>(null);
  const moveSlots = useRef<Partial<Record<TicketMove, HTMLDivElement | null>>>({});

  // Once a row closed, the focus it held goes back to its opener.
  useEffect(() => {
    const move = moveToFocus.current;
    if (move === null) return;
    moveToFocus.current = null;
    const opener = moveSlots.current[move]?.querySelector('button') ?? Object.values(moveSlots.current).find((slot) => slot !== null)?.querySelector('button');
    opener?.focus();
  });

  const close = (): void => {
    moveToFocus.current = openMove;
    setOpenMove(null);
  };
  return (
    <>
      {moves.map((move) => (
        <Fragment key={move.move}>
          <div
            className="board-detail-move"
            ref={(slot) => {
              moveSlots.current[move.move] = slot;
            }}
          >
            {move.opens === null
              ? <MoveButton ticketId={ticketId} move={move} compact />
              : <Button label={move.label} compact expanded={openMove === move.move} onPress={() => setOpenMove(openMove === move.move ? null : move.move)} />}
            <p className="board-detail-effect"><TextParts parts={move.effect} /></p>
          </div>
          {openMove === move.move && move.opens === 'reason' ? <ReasonRow ticketId={ticketId} move={move} onClose={close} /> : null}
          {openMove === move.move && move.opens === 'domains' ? <DomainsRow ticketId={ticketId} move={move} onClose={close} /> : null}
          {openMove === move.move && move.opens === 'priorities' ? <PrioritiesRow ticketId={ticketId} move={move} onClose={close} /> : null}
          {openMove === move.move && move.opens === 'by-hand' ? <ByHandRow ticketId={ticketId} move={move} onClose={close} /> : null}
        </Fragment>
      ))}
    </>
  );
}
