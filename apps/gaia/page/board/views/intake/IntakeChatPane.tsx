/**
 * The selected session: its head (title, job, turns and calls, state), its chat with User's request first, the agent's turns and each open
 * decision docked where it was asked, then, while the session is open, the product owner's live turn where Flint works; the composer
 * sending `job-message`, or, on a session that ended other than closed, a read-only tag naming its outcome; and beside it the drafts, the
 * pictures and Close intake. It follows the one transcript stream of its job. Its
 * chat cues the chat habitat of Flint when a filing draft is researched.
 */

import { PAGE_CONTRACT_VERSIONS }                                   from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardDecisionDocument }                               from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardPictureLimitsDocument }                          from '../../../@types/board/BoardFactDocuments.ts';
import { Row, StateBadge, Tag }                                     from '../../../lib/design-system/DesignSystemInterface.ts';
import type { TranscriptFollower }                                  from '../../@types/BoardServices.ts';
import { ChatCard, ChatThread, type ChatTurn }                      from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }                                      from '../../conversation/ChatThreadModel.ts';
import { JobLink }                                                  from '../../conversation/ConversationParts.tsx';
import { DecisionCard }                                             from '../../conversation/DecisionCard.tsx';
import { useTranscript }                                            from '../../conversation/TranscriptLog.tsx';
import { StateToneUtil }                                            from '../../utils/StateToneUtil.ts';
import { DraftResearchCue }                                         from './DraftResearchCue.tsx';
import { IntakeAside }                                              from './IntakeAside.tsx';
import { IntakeChat }                                               from './IntakeChat.tsx';
import { IntakeModelUtil, type IntakeChatTurn, type IntakeSession } from './IntakeModel.ts';
import { IntakePane }                                               from './IntakePane.tsx';
import type { CuedDraft }                                           from './IntakeSpriteModel.ts';
import { ProductOwnerAtWork }                                       from './ProductOwnerAtWork.tsx';
import { SentPicture }                                              from './SentPicture.tsx';

export interface IntakeChatPaneProps {
  readonly session:           IntakeSession;
  readonly followTranscript:  TranscriptFollower;
  readonly pictureLimits:     BoardPictureLimitsDocument | null;
  readonly todayCalendarDate: string;
  /** The board's open filing drafts. */
  readonly filingDrafts:      readonly CuedDraft[];
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

function DockedDecision({ decision }: { readonly decision: BoardDecisionDocument }) {
  return <DecisionCard decision={decision} escalated={false} placement="docked" questionLayout={decision.questions.length > 1 ? 'columns' : 'stack'} />;
}

export function IntakeChatPane({
  session, followTranscript, pictureLimits, todayCalendarDate, filingDrafts
}: IntakeChatPaneProps) {
  const { jobId } = session;
  const { entries, historyKey } = useTranscript(jobId, followTranscript);
  const turns = IntakeModelUtil.chatTurnsOf(entries, session.questions, { jobId, requestText: session.requestText, todayCalendarDate });
  const pill = IntakeModelUtil.sessionPillOf(session);
  const composerLabel = `Message ${PRODUCT_OWNER_LABEL} ${jobId}`;
  const atWork = IntakeModelUtil.productOwnerAtWorkOf(session);
  const readOnlyTag = IntakeModelUtil.readOnlyTagOf(session);
  const thread = (
    <>
      <ChatThread
        label={`Conversation of ${jobId}`}
        turns={turns.map(shownTurnOf)}
        historyKey={historyKey}
        renderDecision={(decisionId) => {
          const decision = session.questions.find((candidate) => candidate.id === decisionId);
          return decision === undefined ? null : <DockedDecision decision={decision} />;
        }}
      />
      {atWork === null ? null : <ProductOwnerAtWork atWork={atWork} />}
    </>
  );
  return (
    <IntakePane
      label={`Intake ${jobId}`}
      title={session.title}
      titleMark={jobId}
      headEnd={(
        <>
          <span className="board-intake-meta">
            {'product-owner · '}
            <JobLink jobId={jobId} />
            {` · ${IntakeModelUtil.paneMetaOf(ChatThreadModelUtil.turnCountOf(entries), session.calls)}`}
          </span>
          <StateBadge {...StateToneUtil.lookOf(pill.state)} label={pill.label} />
        </>
      )}
    >
      <div className="board-intake-detail">
        {readOnlyTag === null
          ? (
            <IntakeChat
              label={`Chat with ${jobId}`}
              thread={thread}
              composerLabel={composerLabel}
              recipientLabel={PRODUCT_OWNER_LABEL}
              recipientJobId={jobId}
              status={IntakeModelUtil.composerTagOf(session)}
              placeholder={composerLabel}
              sendLabel="Send"
              pictureLimits={pictureLimits}
              commandOf={(text, pictures) => ({
                boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId, text, pictures, incidentId: null
              })}
              chatCues={<DraftResearchCue drafts={filingDrafts} />}
            />
          )
          : (
            <div className="board-intake-chat">
              <ChatCard label={`Chat with ${jobId}`}>
                {thread}
                <Row centerY paddingHorizontal="twentyFour" paddingBottom="eighteen">
                  <Tag {...readOnlyTag} />
                </Row>
              </ChatCard>
            </div>
          )}
        <IntakeAside session={session} pictures={IntakeModelUtil.picturesInChatOf(entries)} />
      </div>
    </IntakePane>
  );
}
