/**
 * The Assistant view: its title row, then the live session as a chat card (its head holding Flint, the session's name, job and facts, and
 * how many of its decisions wait on User), the thread and the composer; beside it a rail of its open incidents and the handled ones with
 * the trail of steps made under them, a delivery linking its Assistant and an escalation its decision, each applied default in the
 * warning state. While no session is up the thread says a fresh one is booting; there is no off switch.
 */
import { FlintSlot }   from 'design-system/FlintSlot';
import { ListSection } from 'design-system/ListSection';
import { Row }         from 'design-system/Row';
import { Stamp }       from 'design-system/Stamp';
import { Tag }         from 'design-system/Tag';
import { Text }        from 'design-system/Text';
import { View }        from 'design-system/View';

import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import type { ChatTurn }                  from '../../conversation/ChatThread.tsx';
import { ChatCard, ChatThread }           from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }            from '../../conversation/ChatThreadModel.ts';
import { Composer }                       from '../../conversation/Composer.tsx';
import {
  CardHead,
  IncidentStepText,
  JobLink,
  MetaLine,
  TicketLinks
} from '../../conversation/ConversationParts.tsx';
import { useTranscript, type TranscriptFollower } from '../../conversation/TranscriptLog.tsx';
import { useBridgeClock }                         from '../../shell/BridgeClock.ts';
import { useCoveringPanelHoldsTheFlintSlot }      from '../../shell/CoveringPanel.ts';
import { HashRouter }                             from '../../shell/HashRouter.ts';
import { IncidentTrailUtil, type IncidentEntry }  from '../../utils/IncidentTrailUtil.ts';
import { TimeUtil }                               from '../../utils/TimeUtil.ts';
import { ViewTitle }                              from '../ViewTitle.tsx';
import { AssistantModelUtil, type AssistantJob }  from './AssistantModel.ts';

export interface AssistantViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
}

const BOOTING_TURN: ChatTurn = {
  kind: 'system', key: 'booting', text: 'Booting a fresh session.', stamp: null, revealText: null
};

function IncidentItem({ incident, todayCalendarDate }: { readonly incident: IncidentEntry; readonly todayCalendarDate: string }) {
  return (
    <li className="bridge-card" data-state={incident.settlement === 'defaulted' ? 'warning' : incident.settlement} aria-label={`Incident ${incident.incidentId}`}>
      <CardHead id={incident.incidentId} title={incident.kind} pill={IncidentTrailUtil.incidentPillOf(incident)} isOnWarnSurface={incident.settlement === 'defaulted'} />
      {incident.ticketIds.length === 0 && incident.defaultMove === null
        ? null
        : (
          <MetaLine parts={[
            incident.ticketIds.length === 0 ? null : <TicketLinks ticketIds={incident.ticketIds} />,
            incident.defaultMove === null ? null : `default ${incident.defaultMove}`,
          ]} />
        )}
      {/* Two steps may share a stamp and words, such as two equal notes, so a step is known by its place. */}
      {incident.steps.map((step, i) => {
        const stamp = AssistantModelUtil.stepStampOf(step.at, todayCalendarDate);
        return (
          <p key={i} className="bridge-note bridge-incident-step">
            <span className="bridge-incident-step-time">{stamp === null ? null : <Stamp {...stamp} />}</span>
            <span><IncidentStepText step={step} /></span>
          </p>
        );
      })}
    </li>
  );
}

interface ChatHeadProps {
  readonly job:                 AssistantJob | null;
  readonly turnCount:           number;
  readonly askingDecisionCount: number;
}

function ChatHead({ job, turnCount, askingDecisionCount }: ChatHeadProps) {
  const askingText = AssistantModelUtil.askingDecisionsTextOf(askingDecisionCount);
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <div className="bridge-assistant-chat-head">
      {flintSlotIsCovered
        ? null
        : <FlintSlot label="Flint, the Assistant" size="100" ground="lane" pose={AssistantModelUtil.flintPoseOf({ askingDecisionCount })} />}
      <View gap="four">
        <Row gap="ten">
          <Text typeRole="page" element="h3">Assistant</Text>
          {job === null ? null : <JobLink jobId={job.id} />}
        </Row>
        {job === null ? null : <Text typeRole="tab" muted>{AssistantModelUtil.headMetaOf(job, turnCount)}</Text>}
      </View>
      {askingText === null
        ? null
        : <span className="bridge-assistant-chat-head-end"><Tag text={askingText} tone="neutral" href={HashRouter.fragmentOf({ tab: 'questions', item: null })} /></span>}
    </div>
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
      <ViewTitle title="Assistant" lead="The Overseer's Assistant. Talk to it here; its incidents are on the right." />
      <div className="bridge-assistant-layout">
        <ChatCard label="Assistant session">
          <ChatHead job={job} turnCount={ChatThreadModelUtil.turnCountOf(entries)} askingDecisionCount={model.askingDecisionCount} />
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
        <aside className="bridge-assistant-rail" aria-label="Incidents">
          <ListSection
            label="Open incidents"
            title="Open incidents"
            count={model.openIncidents.length}
            emptyText="No open incident."
            items={model.openIncidents}
            keyOf={(incident) => incident.incidentId}
            renderItem={(incident) => <IncidentItem incident={incident} todayCalendarDate={todayCalendarDate} />}
          />
          <ListSection
            label="Handled incidents"
            title="Handled incidents"
            count={model.settledIncidents.length}
            emptyText="No handled incident yet."
            items={model.settledIncidents}
            keyOf={(incident) => incident.incidentId}
            renderItem={(incident) => <IncidentItem incident={incident} todayCalendarDate={todayCalendarDate} />}
          />
        </aside>
      </div>
    </div>
  );
}
