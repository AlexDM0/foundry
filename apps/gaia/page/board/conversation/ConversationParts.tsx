/**
 * The parts the Questions, Assistant and Intake views share: a card's head (its mono id, its title and its state pill), the meta line
 * whose ticket and job ids each link to their own place, and an incident step's words with the job or decision it names linked; the
 * Agents table links its tickets the same way, and the shell's incident drawer draws its trails with the same step.
 */

import { IdLink }                   from 'design-system/IdLink';
import { MonoId }                   from 'design-system/MonoId';
import { StateBadge }               from 'design-system/StateBadge';
import { Fragment, type ReactNode } from 'react';

import type { BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';
import { useBoardHrefOf }         from '../shell/BoardRouteLinks.ts';
import { DetailRoute }            from '../shell/DetailRoute.ts';
import type { IncidentStep }      from '../utils/IncidentTrailUtil.ts';
import { StateToneUtil }          from '../utils/StateToneUtil.ts';

export interface CardPill {
  readonly state: BoardDisplayState;
  readonly label: string;
}

export interface CardHeadProps {
  readonly id:               string;
  readonly title?:           string;
  readonly pill:             CardPill;
  /** A warn card's id takes the card's ink. */
  readonly isOnWarnSurface?: boolean;
}

export function CardHead({
  id, title, pill, isOnWarnSurface = false
}: CardHeadProps) {
  return (
    <div className="board-card-head">
      <h3 className="board-card-title">
        <MonoId text={id} weight="regular" tone={isOnWarnSurface ? 'inherited' : 'subtle'} />
        {title === undefined ? null : <span>{title}</span>}
      </h3>
      <span className="board-card-head-pill"><StateBadge {...StateToneUtil.lookOf(pill.state)} label={pill.label} /></span>
    </div>
  );
}

export function TicketLinks({ ticketIds }: { readonly ticketIds: readonly string[] }) {
  const hrefOf = useBoardHrefOf();
  return ticketIds.map((ticketId, position) => (
    <Fragment key={ticketId}>
      {position === 0 ? null : ' '}
      <IdLink text={`#${ticketId}`} href={hrefOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) })} />
    </Fragment>
  ));
}

export function JobLink({ jobId }: { readonly jobId: string }) {
  const hrefOf = useBoardHrefOf();
  return <IdLink text={jobId} href={hrefOf({ tab: 'agents', item: jobId })} />;
}

/** The facts a card's meta line holds, each its own element between middle dots; a `null` part is left out. */
export function MetaLine({ parts }: { readonly parts: readonly ReactNode[] }) {
  const shown = parts.filter((part) => part !== null);
  return (
    <p className="board-card-meta">
      {shown.map((part, position) => (
        <Fragment key={position}>
          {position === 0 ? null : ' · '}
          <span>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** A step's words, then the Assistant job it was delivered to or the decision it escalated to, as a link to its own place. */
export function IncidentStepText({ step }: { readonly step: IncidentStep }) {
  const hrefOf = useBoardHrefOf();
  return (
    <>
      {step.text}
      {step.jobId === undefined ? null : <>{' '}<JobLink jobId={step.jobId} /></>}
      {step.decisionId === undefined ? null : <>{' '}<IdLink text={step.decisionId} href={hrefOf({ tab: 'questions', item: null })} /></>}
    </>
  );
}
