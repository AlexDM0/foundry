/** The row form a Gantt row or ticket-table line opens: head, the Bridge's controls on its ticket, then Task, Phases, Ticket and Log. */
import { StateBadge }             from '../../chips/StateBadge.tsx';
import { TicketIdMark, TypeMark } from '../../chips/TicketMarks.tsx';
import { DetailControls }         from './DetailControls.tsx';
import {
  DetailFacts,
  DetailNote,
  DetailSection,
  Stamp
} from './DetailParts.tsx';
import {
  NO_LOG_LINES_NOTE,
  type PhasesModel,
  type RowDetailHeadModel,
  type RowDetailModel,
  type RowTicketModel
} from './RowDetailModel.ts';
import { TicketBodyFrame } from './TicketBodyFrame.tsx';

function RowHead({ head }: { readonly head: RowDetailHeadModel }) {
  const { state } = head;
  return (
    <div className="bridge-detail-head" data-state={state.kind === 'row' ? state.token : undefined}>
      <span className="bridge-detail-id">{head.idText}</span>
      <h2 className="bridge-detail-title" title={head.titleTitle ?? undefined}>{head.title}</h2>
      {state.kind === 'row'
        ? <span className="bridge-state-pill">{state.label}</span>
        : <StateBadge state={state.status} label={state.label} palette="ticket-status" />}
    </div>
  );
}

function Phases({ phases }: { readonly phases: PhasesModel }) {
  return (
    <>
      {phases.note === null ? null : <DetailNote text={phases.note} />}
      {phases.lines.length === 0 ? null : (
        <ol className="bridge-detail-phases">
          {phases.lines.map((line, index) => (
            <li key={`${line.stamp.fullText}:${String(index)}`} data-state={line.stateToken}>
              <span className="bridge-state-pill">{line.label}</span>
              <Stamp stamp={line.stamp} element="time" />
              {line.gapText === null ? null : <span className="bridge-detail-gap">{line.gapText}</span>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function RowTicket({ ticket }: { readonly ticket: RowTicketModel }) {
  return (
    <>
      <div className="bridge-detail-ticket-head">
        <TicketIdMark ticketId={ticket.ticketId} />
        <h4 className="bridge-detail-ticket-title">{ticket.title}</h4>
        <TypeMark type={ticket.ticketType} />
        <StateBadge state={ticket.status} label={ticket.statusLabel} palette="ticket-status" />
      </div>
      <DetailFacts facts={ticket.facts} />
      <TicketBodyFrame title={ticket.title} bodyHtml={ticket.bodyHtml} />
    </>
  );
}

export function RowDetail({ model }: { readonly model: RowDetailModel }) {
  return (
    <>
      <RowHead head={model.head} />
      {model.ticket === null ? null : <DetailControls ticketId={model.ticket.ticketId} controls={model.ticket.controls} />}
      {model.taskFacts === null ? null : <DetailSection title="Task"><DetailFacts facts={model.taskFacts} /></DetailSection>}
      {model.phases === null ? null : <DetailSection title="Phases"><Phases phases={model.phases} /></DetailSection>}
      {model.ticket === null ? null : <DetailSection title="Ticket"><RowTicket ticket={model.ticket} /></DetailSection>}
      <DetailSection title="Log">
        {model.logLines.length === 0
          ? <DetailNote text={NO_LOG_LINES_NOTE} />
          : (
            <ul className="bridge-detail-log">
              {model.logLines.map((line) => (
                <li key={line.key}>
                  <Stamp stamp={line.stamp} element="time" />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
      </DetailSection>
    </>
  );
}
