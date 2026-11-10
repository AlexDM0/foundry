/**
 * The Assistant view: the live session as a chat thread with a composer under it, and beside it a rail of its open incidents and the
 * handled ones with the moves and escalations made under them, each applied default in the warning state. While no session is up the
 * thread says a fresh one is booting; there is no off switch.
 */
import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import type { ChatTurn }                  from '../../conversation/ChatThread.tsx';
import { ChatCard, ChatThread }           from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }            from '../../conversation/ChatThreadModel.ts';
import { Composer }                       from '../../conversation/Composer.tsx';
import {
  CardHead,
  JobLink,
  MetaLine,
  TicketLinks
} from '../../conversation/ConversationParts.tsx';
import { useTranscript, type TranscriptFollower } from '../../conversation/TranscriptLog.tsx';
import { ListSection, SectionHead }               from '../../design-system/ListSection.tsx';
import { useBridgeClock }                         from '../../shell/BridgeClock.ts';
import { IncidentTrailUtil, type IncidentEntry }  from '../../utils/IncidentTrailUtil.ts';
import { TimeUtil }                               from '../../utils/TimeUtil.ts';
import { AssistantModelUtil }                     from './AssistantModel.ts';

export interface AssistantViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
}

const BOOTING_TURN: ChatTurn = {
  kind: 'system', key: 'booting', text: 'Booting a fresh session.', stamp: null, revealText: null
};

function IncidentItem({ incident }: { readonly incident: IncidentEntry }) {
  return (
    <li className="bridge-card" data-state={incident.settlement === 'defaulted' ? 'warning' : incident.settlement} aria-label={`Incident ${incident.incidentId}`}>
      <CardHead id={incident.incidentId} title={incident.kind} pill={IncidentTrailUtil.incidentPillOf(incident)} />
      {incident.ticketIds.length === 0 && incident.defaultMove === null
        ? null
        : (
          <MetaLine parts={[
            incident.ticketIds.length === 0 ? null : <TicketLinks ticketIds={incident.ticketIds} />,
            incident.defaultMove === null ? null : `default ${incident.defaultMove}`,
          ]} />
        )}
      {incident.facts.map(([name, value]) => <p key={name} className="bridge-note">{`${name}: ${value}`}</p>)}
      {incident.steps.map((step) => <p key={`${step.at}-${step.text}`} className="bridge-note">{step.text}</p>)}
    </li>
  );
}

export function AssistantView({ board, followTranscript }: AssistantViewProps) {
  const model = AssistantModelUtil.assistantModelOf(board);
  const job = model.assistantJob;
  const entries = useTranscript(job?.id ?? null, followTranscript);
  // The viewer's day only picks the form a stamp is shown in.
  const todayCalendarDate = TimeUtil.calendarDateOf(useBridgeClock().now().getTime());
  const queued = job === null ? [] : AssistantModelUtil.queuedMessagesOf(board.questionHistory ?? [], job.id, job.messagesWaiting);
  const turns = job === null
    ? [BOOTING_TURN]
    : AssistantModelUtil.chatTurnsOf(ChatThreadModelUtil.threadItemsOf(entries, queued), { jobId: job.id, todayCalendarDate });
  const messageLabel = job === null ? 'Message the Assistant' : `Message Assistant ${job.id}`;
  return (
    <div className="bridge-view">
      <div className="bridge-assistant-layout">
        <section className="bridge-section" aria-label="Assistant session">
          <SectionHead title="Assistant">
            {job === null ? null : <JobLink jobId={job.id} />}
            {job === null ? null : <span className="bridge-section-meta">{AssistantModelUtil.headMetaOf(job, ChatThreadModelUtil.turnCountOf(entries))}</span>}
          </SectionHead>
          <ChatCard label="Assistant chat">
            <ChatThread label="Assistant conversation" turns={turns} renderDecision={() => null} />
            <Composer
              label={messageLabel}
              recipientLabel="Assistant"
              recipientJobId={job?.id ?? null}
              status={AssistantModelUtil.composerTagOf(job)}
              placeholder={messageLabel}
              sendLabel="Send"
              commandOf={(text) => (job === null || text.trim() === '' ? null : { kind: 'job-message', jobId: job.id, text: text.trim() })}
            />
          </ChatCard>
        </section>
        <aside className="bridge-assistant-rail" aria-label="Incidents">
          <ListSection
            label="Open incidents"
            title="Open incidents"
            count={model.openIncidents.length}
            emptyText="No open incident."
            items={model.openIncidents}
            keyOf={(incident) => incident.incidentId}
            renderItem={(incident) => <IncidentItem incident={incident} />}
          />
          <ListSection
            label="Handled incidents"
            title="Handled incidents"
            emptyText="No handled incident yet."
            items={model.settledIncidents}
            keyOf={(incident) => incident.incidentId}
            renderItem={(incident) => <IncidentItem incident={incident} />}
          />
        </aside>
      </div>
    </div>
  );
}
