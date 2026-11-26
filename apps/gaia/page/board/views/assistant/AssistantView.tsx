/**
 * The Assistant view: its title row, then the live session as a chat card (its head holding Flint, the session's name, job and facts, how
 * many of its decisions wait on User, and the board's Assistant switch), the thread and the composer; beside it a rail of its open
 * incidents and the handled ones with the trail of steps made under them, a delivery linking its Assistant and an escalation its decision,
 * each applied default in the warning state with the forge's reason. The switch shows the state the forge serves and a press sends
 * `pipeline-assistant-set`; a refusal reads as the forge's sentence under the head. While the switch is off the head says so and that each
 * incident takes its default; while it is on and no session is up the thread says a fresh one is booting.
 */
import { PAGE_CONTRACT_VERSIONS } from '../../../../src/shared/constants/PageContractVersions.ts';
import {
  ListSection,
  Row,
  Stamp,
  Switch,
  Tag,
  Text,
  View
} from '../../../lib/design-system/DesignSystemInterface.ts';


import type { TranscriptFollower } from '../../@types/BoardServices.ts';
import type { ChatTurn }           from '../../conversation/ChatThread.tsx';
import { ChatCard, ChatThread }    from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }     from '../../conversation/ChatThreadModel.ts';
import { Composer }                from '../../conversation/Composer.tsx';
import {
  CardHead,
  IncidentStepText,
  JobLink,
  MetaLine,
  TicketLinks
} from '../../conversation/ConversationParts.tsx';
import { useTranscript }                                              from '../../conversation/TranscriptLog.tsx';
import { FlintSlotHabitat }                                           from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                                        from '../../flint/FlintSlotHabitats.ts';
import { useBoardClock }                                              from '../../shared/BoardClock.ts';
import { useCoveringPanelHoldsTheFlintSlot }                          from '../../shared/CoveringPanel.ts';
import { useControlCommand }                                          from '../../shared/commands/ControlCommandSender.ts';
import { useBoardHrefOf }                                             from '../../shared/routing/BoardRouteLinks.ts';
import { presenceAttributeOf, useItemPresence }                       from '../../shell/ItemPresence.ts';
import { IncidentTrailUtil, type IncidentEntry }                      from '../../utils/IncidentTrailUtil.ts';
import type { ItemPresence }                                          from '../../utils/ItemPresenceUtil.ts';
import { TimeUtil }                                                   from '../../utils/TimeUtil.ts';
import { ViewTitle }                                                  from '../ViewTitle.tsx';
import { AssistantModelUtil, type AssistantBoard, type AssistantJob } from './AssistantModel.ts';

export interface AssistantViewProps {
  readonly board:            AssistantBoard;
  readonly followTranscript: TranscriptFollower;
}

const BOOTING_TURN: ChatTurn = {
  kind: 'system', key: 'booting', text: 'Booting a fresh session.', stamp: null, revealText: null
};

const SWITCHED_OFF_TEXT = 'The Assistant is off: each incident takes its default.';

const SWITCHED_OFF_TURN: ChatTurn = {
  kind: 'system', key: 'switched-off', text: 'No session while the Assistant is off.', stamp: null, revealText: null
};

interface IncidentItemProps {
  readonly incident:          IncidentEntry;
  readonly presence:          ItemPresence;
  readonly todayCalendarDate: string;
}

function IncidentItem({ incident, presence, todayCalendarDate }: IncidentItemProps) {
  return (
    <li
      className="board-card"
      data-state={incident.settlement === 'defaulted' ? 'warning' : incident.settlement}
      data-presence={presenceAttributeOf(presence)}
      inert={presence === 'leaving'}
      aria-label={`Incident ${incident.incidentId}`}
    >
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
          <p key={i} className="board-note board-incident-step">
            <span className="board-incident-step-time">{stamp === null ? null : <Stamp {...stamp} />}</span>
            <span><IncidentStepText step={step} /></span>
          </p>
        );
      })}
    </li>
  );
}

interface ChatHeadProps {
  readonly assistantIsOn:       boolean;
  readonly job:                 AssistantJob | null;
  readonly turnCount:           number;
  readonly askingDecisionCount: number;
}

function ChatHead({
  assistantIsOn, job, turnCount, askingDecisionCount
}: ChatHeadProps) {
  const askingText = AssistantModelUtil.askingDecisionsTextOf(askingDecisionCount);
  const switchLabel = AssistantModelUtil.switchLabelOf(assistantIsOn);
  // The switch stays as the board serves it: an applied press shows once the forge's next board says so.
  const switchSender = useControlCommand(AssistantModelUtil.switchCommandOf(assistantIsOn));
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  const hrefOf = useBoardHrefOf();
  return (
    <>
      <div className="board-assistant-chat-head">
        {flintSlotIsCovered
          ? null
          : (
            <FlintSlotHabitat
              habitat={FLINT_SLOT_HABITATS.assistant}
              cue={AssistantModelUtil.flintCueOf({ askingDecisionCount })}
              label="Flint, the Assistant"
              ground="lane"
            />
          )}
        <View gap="four">
          <Row gap="ten" centerY>
            <Text typeRole="page" element="h3">Assistant</Text>
            {job === null ? null : <JobLink jobId={job.id} />}
          </Row>
          {job === null ? null : <Text typeRole="tab" muted>{AssistantModelUtil.headMetaOf(job, turnCount)}</Text>}
        </View>
        <span className="board-assistant-chat-head-end">
          {askingText === null ? null : <Tag text={askingText} tone="neutral" href={hrefOf({ tab: 'questions', item: null })} />}
          <span className="board-control">
            <Text typeRole="tab" muted>{switchLabel}</Text>
            <Switch accessibleName={switchLabel} checked={assistantIsOn} disabled={!switchSender.enabled} onToggle={() => void switchSender.send()} />
          </span>
        </span>
      </div>
      {assistantIsOn ? null : <p className="board-assistant-head-line">{SWITCHED_OFF_TEXT}</p>}
      {switchSender.refusal === null ? null : <p className="board-assistant-head-line board-refusal" role="status">{switchSender.refusal}</p>}
    </>
  );
}

function incidentKeyOf(incident: IncidentEntry): string {
  return incident.incidentId;
}

export function AssistantView({ board, followTranscript }: AssistantViewProps) {
  const model = AssistantModelUtil.assistantModelOf(board);
  const job = model.assistantJob;
  const { entries, historyKey } = useTranscript(job?.id ?? null, followTranscript);
  // The viewer's day only picks the form a stamp is shown in.
  const todayCalendarDate = TimeUtil.calendarDateOf(useBoardClock().now().getTime());
  const queued = job === null ? [] : AssistantModelUtil.queuedMessagesOf(board.questionHistory, job.id, job.messagesWaiting);
  const turns = job === null
    ? [model.assistantIsOn ? BOOTING_TURN : SWITCHED_OFF_TURN]
    : AssistantModelUtil.chatTurnsOf(ChatThreadModelUtil.threadItemsOf(entries, queued), { jobId: job.id, todayCalendarDate });
  const messageLabel = job === null ? 'Message the Assistant' : `Message Assistant ${job.id}`;
  // An incident that opens rises in; once handled it fades out of the open list and rises into the handled one.
  const presentOpenIncidents = useItemPresence(model.openIncidents, incidentKeyOf);
  const presentSettledIncidents = useItemPresence(model.settledIncidents, incidentKeyOf);
  return (
    <div className="board-view">
      <ViewTitle title="Assistant" lead="Hephaestus's Assistant. Talk to it here; its incidents are on the right." />
      <div className="board-assistant-layout">
        <ChatCard label="Assistant session">
          <ChatHead assistantIsOn={model.assistantIsOn} job={job} turnCount={ChatThreadModelUtil.turnCountOf(entries)} askingDecisionCount={model.askingDecisionCount} />
          <ChatThread label="Assistant conversation" turns={turns} renderDecision={() => null} historyKey={historyKey} />
          <Composer
            label={messageLabel}
            recipientLabel="Assistant"
            recipientJobId={job?.id ?? null}
            status={AssistantModelUtil.composerTagOf(job, model.assistantIsOn)}
            placeholder={messageLabel}
            sendLabel="Send"
            commandOf={(text) => (job === null || text.trim() === '' ? null : {
              boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId: job.id, text: text.trim(), pictures: [], incidentId: null
            })}
          />
        </ChatCard>
        <aside className="board-assistant-rail" aria-label="Incidents">
          <ListSection
            label="Open incidents"
            title="Open incidents"
            count={model.openIncidents.length}
            emptyText="No open incident."
            items={presentOpenIncidents}
            keyOf={({ key }) => key}
            renderItem={({ item, presence }) => <IncidentItem incident={item} presence={presence} todayCalendarDate={todayCalendarDate} />}
          />
          <ListSection
            label="Handled incidents"
            title="Handled incidents"
            count={model.settledIncidents.length}
            emptyText="No handled incident yet."
            items={presentSettledIncidents}
            keyOf={({ key }) => key}
            renderItem={({ item, presence }) => <IncidentItem incident={item} presence={presence} todayCalendarDate={todayCalendarDate} />}
          />
        </aside>
      </div>
    </div>
  );
}
