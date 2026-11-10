/**
 * The Assistant view: the live session's transcript, its open incidents, the handled ones with the moves and escalations made under them
 * and each applied default in the warning state, and a chat box. While no session is up it says a fresh one is booting; there is no off
 * switch.
 */
import { useState } from 'react';

import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import { ChatBox }                        from '../../conversation/ChatBox.tsx';
import {
  CardHead,
  JobLink,
  MetaLine,
  TicketLinks
} from '../../conversation/ConversationParts.tsx';
import { TranscriptLog, useTranscript, type TranscriptFollower } from '../../conversation/TranscriptLog.tsx';
import { ListSection, SectionHead }                              from '../../design-system/ListSection.tsx';
import { AssistantModelUtil, type IncidentEntry }                from './AssistantModel.ts';

export interface AssistantViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
}

function IncidentItem({ incident }: { readonly incident: IncidentEntry }) {
  return (
    <li className="bridge-card" data-state={incident.settlement === 'defaulted' ? 'warning' : incident.settlement} aria-label={`Incident ${incident.incidentId}`}>
      <CardHead id={incident.incidentId} title={incident.kind} pill={AssistantModelUtil.incidentPillOf(incident)} />
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
  const entries = useTranscript(model.assistantJobId, followTranscript);
  const [sentTexts, setSentTexts] = useState<readonly string[]>([]);
  const queued = AssistantModelUtil.queuedMessagesOf(sentTexts, entries);
  return (
    <div className="bridge-view">
      <section className="bridge-section" aria-label="Assistant session">
        <SectionHead title="Assistant">
          {model.assistantJobId === null ? null : <JobLink jobId={model.assistantJobId} />}
        </SectionHead>
        {model.assistantJobId === null
          ? <p className="bridge-note" role="status">Booting a fresh session.</p>
          : <TranscriptLog label="Assistant transcript" entries={entries} />}
        {queued.map((text) => <p key={text} className="bridge-note">{`Queued until the Assistant is idle: ${text}`}</p>)}
        <ChatBox label="Message the Assistant" jobId={model.assistantJobId} onSent={(text) => setSentTexts((previous) => [...previous, text])} />
      </section>
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
    </div>
  );
}
