/** The row form a Gantt row or ticket-table line opens: head, the Bridge's controls on its ticket, then Task, Phases, Ticket and Log. */
import { TicketIdMark, TypeMark }            from '../../chips/TicketMarks.tsx';
import { Stamp }                             from '../../design-system/Stamp.tsx';
import { StateBadge }                        from '../../design-system/StateBadge.tsx';
import { StatePill }                         from '../../design-system/StatePill.tsx';
import { TitledBlock }                       from '../../design-system/TitledBlock.tsx';
import { SandboxedHtmlFrame }                from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { DetailControls }                    from './DetailControls.tsx';
import { DetailFacts, DetailNote, LogLines } from './DetailParts.tsx';
import {
  NO_LOG_LINES_NOTE,
  type PhasesModel,
  type RowDetailHeadModel,
  type RowDetailModel,
  type RowTicketModel
} from './RowDetailModel.ts';

function RowHead({ head }: { readonly head: RowDetailHeadModel }) {
  const { state } = head;
  return (
    <div className="bridge-detail-head" data-state={state.kind === 'row' ? state.token : undefined}>
      <span className="bridge-detail-id">{head.idText}</span>
      <h2 className="bridge-detail-title" title={head.titleTitle ?? undefined}>{head.title}</h2>
      {state.kind === 'row'
        ? <StatePill label={state.label} />
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
              <StatePill label={line.label} />
              <Stamp shortText={line.stamp.shortText} fullText={line.stamp.fullText} element="time" />
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
      <SandboxedHtmlFrame title={`Description of ${ticket.title}`} html={ticket.bodyHtml} placement="ticket-body" />
    </>
  );
}

export function RowDetail({ model }: { readonly model: RowDetailModel }) {
  return (
    <>
      <RowHead head={model.head} />
      {model.ticket === null ? null : <DetailControls ticketId={model.ticket.ticketId} controls={model.ticket.controls} />}
      {model.taskFacts === null ? null : <TitledBlock title="Task" rule="above"><DetailFacts facts={model.taskFacts} /></TitledBlock>}
      {model.phases === null ? null : <TitledBlock title="Phases" rule="above"><Phases phases={model.phases} /></TitledBlock>}
      {model.ticket === null ? null : <TitledBlock title="Ticket" rule="above"><RowTicket ticket={model.ticket} /></TitledBlock>}
      <TitledBlock title="Log" rule="above">
        <LogLines lines={model.logLines} emptyNote={NO_LOG_LINES_NOTE} />
      </TitledBlock>
    </>
  );
}
