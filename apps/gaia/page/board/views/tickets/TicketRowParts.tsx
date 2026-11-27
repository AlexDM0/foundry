/** The parts the Tickets segments draw alike: a row that opens its ticket, a row's epic, an agent at work, a draft's stage track, an empty line. */
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import type { BoardDisplayState } from '../../../@types/board/BoardVocabulary.ts';
import { StateDot }               from '../../../lib/design-system/DesignSystemInterface.ts';
import { useDetailRouting }       from '../../shared/routing/DetailRouting.ts';
import type { DraftStep }         from '../../shared/tickets/DraftRowsModel.ts';
import type { RowEpic }           from '../../shared/tickets/TicketRowFactsUtil.ts';
import { StateToneUtil }          from '../../utils/StateToneUtil.ts';

export function RowEpicMark({ epic, originText = null }: { readonly epic: RowEpic | null; readonly originText?: string | null }) {
  const words = [epic?.title ?? null, originText].filter((word) => word !== null).join(' · ');
  if (words === '') return null;
  return (
    <span className="board-tickets-epic" data-epic-slot={epic === null ? undefined : String(epic.slot)}>
      {epic === null ? null : <span className="board-epic-swatch" aria-hidden="true" />}
      {words}
    </span>
  );
}

export interface AgentMarkProps {
  readonly dotState:    BoardDisplayState;
  readonly pulsing:     boolean;
  readonly jobId:       string | null;
  readonly roleText:    string;
  readonly tokensText?: string | null;
}

/** The agent's dot, its job id in mono, its role in small capitals and its tokens. */
export function AgentMark({
  dotState, pulsing, jobId, roleText, tokensText = null
}: AgentMarkProps) {
  return (
    <span className="board-tickets-agent">
      <StateDot {...StateToneUtil.dotOf(dotState)} pulsing={pulsing} small />
      {jobId === null ? null : <span className="board-tickets-job">{jobId}</span>}
      <span className="board-tickets-role" data-state-tone={StateToneUtil.toneOf(dotState)}>{roleText}</span>
      {tokensText === null ? null : <span className="board-tickets-stamp">{tokensText}</span>}
    </span>
  );
}

/** Each stage as a bar over its name: done, waiting on User, written by an agent, or not reached. */
export function DraftTrack({ steps }: { readonly steps: readonly DraftStep[] }) {
  return (
    <span className="board-draft-track">
      {steps.map((step) => (
        <span key={step.label} className="board-draft-step" data-status={step.status}>
          <span className="board-draft-step-bar" aria-hidden="true" />
          <span className="board-draft-step-label">{step.label}</span>
        </span>
      ))}
    </span>
  );
}

export function SegmentEmptyLine({ text }: { readonly text: string }) {
  return <p className="board-tickets-empty">{text}</p>;
}

/** A click on a link or button inside a row is that control's own, never the row's. */
const ROW_CONTROL_SELECTOR = 'a, button';

/** A row that opens its ticket's detail in place on a click, Enter or Space, a link inside it staying its own. */
export function TicketDetailRow({ ticketId, children }: { readonly ticketId: string; readonly children: ReactNode }) {
  const routing = useDetailRouting();
  const detailItem = { form: 'ticket', ticketId } as const;
  const openRow = (event: MouseEvent<HTMLTableRowElement>): void => {
    if (event.target instanceof Element && event.target.closest(ROW_CONTROL_SELECTOR) !== null) return;
    routing.toggle(detailItem);
  };
  const openRowByKey = (event: KeyboardEvent<HTMLTableRowElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    routing.toggle(detailItem);
  };
  return (
    <tr
      className="board-tickets-row"
      data-opens-detail=""
      data-ticket-id={ticketId}
      data-selected={routing.isOpen(detailItem) ? '' : undefined}
      tabIndex={0}
      onClick={openRow}
      onKeyDown={openRowByKey}
    >
      {children}
    </tr>
  );
}
