/**
 * The ticket form's other moves, each a button beside the effect it has. A move that needs a reason (Hold…, Park…), domains
 * (Set network…) or a confirmation (Delivered by hand…) only opens its field row under itself, one row at a time; the row's button
 * posts the `ControlCommand` and Cancel closes it with nothing sent. Keyed by ticket by its caller, so typed text never carries over to
 * the next ticket opened.
 */
import { Fragment, useState } from 'react';

import type { ControlCommandBody }    from '../../api/CommandClient.ts';
import { Button }                     from '../../design-system/Button.tsx';
import { CommandButton }              from '../../shell/CommandButton.tsx';
import { DetailControlsModelUtil }    from './DetailControlsModel.ts';
import { TextParts }                  from './DetailParts.tsx';
import type { MoveModel, TicketMove } from './TicketOverviewModel.ts';

/** The command of a move that needs no field; `null` where the Overseer would refuse it, so the button stays disabled. */
function commandOf(ticketId: string, move: MoveModel): ControlCommandBody | null {
  if (!move.sendable) return null;
  switch (move.move) {
    case 'ready':
      return { kind: 'ticket-ready', ticketReferences: [ticketId] };
    case 'merge-accept':
      return { kind: 'merge-accept', ticketReference: ticketId };
    case 'unhold':
      return { kind: 'ticket-unhold', ticketReference: ticketId };
    case 'merge-update':
      return { kind: 'merge-update', ticketReference: ticketId };
    default:
      return null;
  }
}

/** A move sent at once, such as Ready, Accept or Update branch. */
export function MoveButton({ ticketId, move, primary = false }: { readonly ticketId: string; readonly move: MoveModel; readonly primary?: boolean }) {
  return <CommandButton label={move.label} command={commandOf(ticketId, move)} primary={primary} />;
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
  let command: ControlCommandBody | null = { kind: 'ticket-hold', ticketReference: ticketId, reason };
  if (isPark) command = reason.trim() === '' ? null : { kind: 'ticket-park', ticketReference: ticketId, reason };
  return (
    <div className="bridge-detail-reason" role="group" aria-label={isPark ? 'Park with a reason' : 'Hold with a reason'}>
      <input className="bridge-detail-input" aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      <CommandButton label={isPark ? 'Park' : 'Hold'} command={command} primary onApplied={onClose} />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

/** The confirmation of a by-hand delivery, with the branch and the commit User landed, both optional. */
function ByHandRow({ ticketId, move, onClose }: FieldRowProps) {
  const [branch, setBranch] = useState('');
  const [commit, setCommit] = useState('');
  const command: ControlCommandBody | null = move.sendable
    ? {
      kind:            'ticket-deliver-by-hand',
      ticketReference: ticketId,
      ...(branch.trim() === '' ? {} : { branch: branch.trim() }),
      ...(commit.trim() === '' ? {} : { commit: commit.trim() }),
    }
    : null;
  return (
    <div className="bridge-detail-reason" role="group" aria-label="Delivered by hand">
      <input className="bridge-detail-input" aria-label="Branch" placeholder="Branch (optional)" value={branch} onChange={(event) => setBranch(event.target.value)} />
      <input className="bridge-detail-input" aria-label="Commit" placeholder="Commit (optional)" value={commit} onChange={(event) => setCommit(event.target.value)} />
      <CommandButton label="Record delivered" command={command} primary onApplied={onClose} />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

function DomainsRow({ ticketId, move, onClose }: FieldRowProps) {
  const [domainsText, setDomainsText] = useState(() => (move.domains ?? []).join(', '));
  return (
    <div className="bridge-detail-reason" role="group" aria-label="Network">
      <input
        className="bridge-detail-input"
        aria-label="Network domains"
        placeholder="example.com, api.example.com"
        value={domainsText}
        onChange={(event) => setDomainsText(event.target.value)}
      />
      <CommandButton
        label="Set network"
        command={{ kind: 'ticket-network', ticketReference: ticketId, domains: DetailControlsModelUtil.networkDomainsOf(domainsText) }}
        primary
        onApplied={onClose}
      />
      <Button label="Cancel" onPress={onClose} />
    </div>
  );
}

export function TicketMoves({ ticketId, moves }: { readonly ticketId: string; readonly moves: readonly MoveModel[] }) {
  const [openMove, setOpenMove] = useState<TicketMove | null>(null);
  const close = (): void => setOpenMove(null);
  return (
    <>
      {moves.map((move) => (
        <Fragment key={move.move}>
          <div className="bridge-detail-move">
            {move.opens === null
              ? <MoveButton ticketId={ticketId} move={move} />
              : <Button label={move.label} expanded={openMove === move.move} onPress={() => setOpenMove(openMove === move.move ? null : move.move)} />}
            <p className="bridge-detail-effect"><TextParts parts={move.effect} /></p>
          </div>
          {openMove === move.move && move.opens === 'reason' ? <ReasonRow ticketId={ticketId} move={move} onClose={close} /> : null}
          {openMove === move.move && move.opens === 'domains' ? <DomainsRow ticketId={ticketId} move={move} onClose={close} /> : null}
          {openMove === move.move && move.opens === 'by-hand' ? <ByHandRow ticketId={ticketId} move={move} onClose={close} /> : null}
        </Fragment>
      ))}
    </>
  );
}
