/**
 * The pipeline agent's conversation inside a pipeline panel: the chat, the step's setup questions as cards, the agent strip with Flint and
 * the composer. In monorepo mode it shows one level's session, under a line that links the other levels' open questions.
 */
import type { ReactNode }                                  from 'react';
import type { BoardPipelineSetupDocument }                 from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardSetupQuestionStep }                     from '../../../../@types/board/BoardVocabulary.ts';
import { TypingIndicator }                                 from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { TranscriptFollower }                         from '../../../@types/BoardServices.ts';
import { ChatThread }                                      from '../../../conversation/ChatThread.tsx';
import { Composer }                                        from '../../../conversation/Composer.tsx';
import { useTranscript }                                   from '../../../conversation/TranscriptLog.tsx';
import { PipelinePanelBody, PipelinePanelFoot }            from '../PipelinePanel.tsx';
import { OtherLevelQuestionsStrip }                        from '../entities/OtherLevelQuestionsStrip.tsx';
import type { PipelineLevel }                              from '../entities/PipelineLevelModel.ts';
import type { SessionJob }                                 from './AgentSessionModel.ts';
import { AgentStrip }                                      from './AgentStrip.tsx';
import { PIPELINE_AGENT_SPEAKER, PipelineAgentPanelModel } from './PipelineAgentPanelModel.ts';
import { SetupQuestionForm }                               from './SetupQuestionForm.tsx';

/** The level a monorepo panel shows, and where the same screen opens at another level. */
export interface AgentPanelLevel {
  readonly level:  PipelineLevel;
  readonly hrefOf: (level: PipelineLevel) => string;
}

export interface PipelineAgentPanelProps {
  readonly setup:               BoardPipelineSetupDocument;
  /** The step whose questions the panel shows. */
  readonly step:                BoardSetupQuestionStep;
  readonly followTranscript:    TranscriptFollower;
  readonly todayCalendarDate:   string;
  /** The composer's example of what to tell the agent on this step. */
  readonly composerPlaceholder: string;
  /** What the step shows above the chat, such as who reads the constitution. */
  readonly beforeChat?:         ReactNode;
  /** What follows the chat, such as the agent's newest change with its links. */
  readonly afterChat?:          ReactNode;
  /** Flint's strip above the composer, on the setup steps only: one slot per page. */
  readonly showsAgentStrip?:    boolean;
  /** Absent in single mode: the record's one session. */
  readonly levelShown?:         AgentPanelLevel | null;
  /** The board's jobs, which say whether forge refused the session's launch. */
  readonly jobs:                readonly SessionJob[];
}

export function PipelineAgentPanel({
  setup, step, followTranscript, todayCalendarDate, composerPlaceholder, beforeChat = null, afterChat = null, showsAgentStrip = false,
  levelShown = null, jobs
}: PipelineAgentPanelProps) {
  const { record } = setup;
  const session = PipelineAgentPanelModel.levelSessionOf(setup, levelShown?.level ?? null, jobs);
  const { agentJobId, sessionState } = session;
  const { entries, historyKey } = useTranscript(agentJobId, followTranscript);
  const cards = PipelineAgentPanelModel.questionCardsOf(session.questions, step, session.findings);
  const stripQuestions = { questions: session.questions, readyToContinue: record.readyToContinue };
  const otherLevelQuestions = levelShown === null ? null : PipelineAgentPanelModel.otherLevelQuestionsOf(setup, levelShown.level);
  const activityLine = PipelineAgentPanelModel.activityLineOf(entries);
  const shownEntityKey = levelShown?.level.kind === 'entity' ? levelShown.level.key : null;
  const turns = agentJobId === null ? [] : PipelineAgentPanelModel.chatTurnsOf(entries, agentJobId, todayCalendarDate);
  return (
    <>
      {otherLevelQuestions === null || levelShown === null ? null : <OtherLevelQuestionsStrip view={otherLevelQuestions} hrefOf={levelShown.hrefOf} />}
      <PipelinePanelBody followsEnd>
        {beforeChat}
        {turns.length === 0
          ? null
          : <ChatThread label={`Conversation of ${agentJobId ?? PIPELINE_AGENT_SPEAKER}`} turns={turns} renderDecision={() => null} historyKey={historyKey} />}
        {afterChat}
        {activityLine === null ? null : <TypingIndicator text={activityLine} accessibleName={`${PIPELINE_AGENT_SPEAKER} is working`} />}
        {cards.map((card) => <SetupQuestionForm key={card.questionId} setupId={record.setupId} card={card} layout="stack" />)}
      </PipelinePanelBody>
      {showsAgentStrip ? <AgentStrip strip={PipelineAgentPanelModel.agentStripOf(step, stripQuestions, sessionState, shownEntityKey)} /> : null}
      <PipelinePanelFoot>
        <Composer
          label="Message the pipeline agent"
          recipientLabel={PIPELINE_AGENT_SPEAKER}
          recipientJobId={agentJobId}
          status={PipelineAgentPanelModel.composerTagOf(sessionState)}
          placeholder={composerPlaceholder}
          sendLabel="Send"
          commandOf={(text) => PipelineAgentPanelModel.messageCommandOf(agentJobId, text)}
        />
      </PipelinePanelFoot>
    </>
  );
}
