/**
 * The selected session: its head (job, title, turns and calls, state), its chat with User's request first, the agent's turns and each open
 * decision docked where it was asked, the composer sending `job-message`, and beside it the drafts, the pictures and Close intake. It
 * follows the one transcript stream of its job.
 */
import type { DecisionDocument, PictureLimitsDocument }             from '../../@types/ConversationDocuments.ts';
import { ChatThread, type ChatTurn }                                from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }                                      from '../../conversation/ChatThreadModel.ts';
import { JobLink }                                                  from '../../conversation/ConversationParts.tsx';
import { DecisionCard }                                             from '../../conversation/DecisionCard.tsx';
import { useTranscript, type TranscriptFollower }                   from '../../conversation/TranscriptLog.tsx';
import { Pane }                                                     from '../../design-system/Pane.tsx';
import { StateBadge }                                               from '../../design-system/StateBadge.tsx';
import { IntakeAside }                                              from './IntakeAside.tsx';
import { IntakeChat }                                               from './IntakeChat.tsx';
import { IntakeModelUtil, type IntakeChatTurn, type IntakeSession } from './IntakeModel.ts';
import { SentPicture }                                              from './SentPicture.tsx';

export interface IntakeChatPaneProps {
  readonly session:           IntakeSession;
  readonly followTranscript:  TranscriptFollower;
  readonly pictureLimits:     PictureLimitsDocument | null;
  readonly todayCalendarDate: string;
}

const PRODUCT_OWNER_LABEL = 'Product owner';

function shownTurnOf(turn: IntakeChatTurn): ChatTurn {
  if (turn.kind !== 'user') return turn;
  const { sentPictures, ...userTurn } = turn;
  return {
    ...userTurn,
    pictures: sentPictures.length === 0 ? null : sentPictures.map((picture) => <SentPicture key={picture.pictureId} picture={picture} />),
  };
}

function DockedDecision({ decision }: { readonly decision: DecisionDocument }) {
  return <DecisionCard decision={decision} escalated={false} placement="docked" questionLayout={decision.questions.length > 1 ? 'columns' : 'stack'} />;
}

export function IntakeChatPane({
  session, followTranscript, pictureLimits, todayCalendarDate
}: IntakeChatPaneProps) {
  const { jobId } = session;
  const entries = useTranscript(jobId, followTranscript);
  const turns = IntakeModelUtil.chatTurnsOf(entries, session.questions, { jobId, requestText: session.requestText, todayCalendarDate });
  const pill = IntakeModelUtil.sessionPillOf(session);
  const composerLabel = `Message ${PRODUCT_OWNER_LABEL} ${jobId}`;
  return (
    <Pane
      label={`Intake ${jobId}`}
      title="Intake"
      titleMark={jobId}
      subtitle={session.title}
      headEnd={(
        <>
          <span className="bridge-intake-meta">
            {'product-owner · '}
            <JobLink jobId={jobId} />
            {` · ${IntakeModelUtil.paneMetaOf(ChatThreadModelUtil.turnCountOf(entries), session.calls)}`}
          </span>
          <StateBadge state={pill.state} label={pill.label} />
        </>
      )}
      body="flush"
    >
      <div className="bridge-intake-detail">
        <IntakeChat
          label={`Chat with ${jobId}`}
          thread={(
            <ChatThread
              label={`Conversation of ${jobId}`}
              turns={turns.map(shownTurnOf)}
              renderDecision={(decisionId) => {
                const decision = session.questions.find((candidate) => candidate.id === decisionId);
                return decision === undefined ? null : <DockedDecision decision={decision} />;
              }}
            />
          )}
          composerLabel={composerLabel}
          recipientLabel={PRODUCT_OWNER_LABEL}
          recipientJobId={jobId}
          status={IntakeModelUtil.composerTagOf(session)}
          placeholder={composerLabel}
          sendLabel="Send"
          pictureLimits={pictureLimits}
          commandOf={(text, pictures) => ({
            kind: 'job-message', jobId, text, ...(pictures.length === 0 ? {} : { pictures })
          })}
        />
        <IntakeAside session={session} pictures={IntakeModelUtil.picturesInChatOf(entries)} />
      </div>
    </Pane>
  );
}
