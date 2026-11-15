/**
 * The pipeline agent's conversation inside a pipeline panel: what the step shows before it, the agent's chat, what follows the chat, the
 * line of what the agent does while a turn runs, and the step's setup questions as decision cards last; then the agent strip with Flint,
 * and the composer that messages the agent in the panel's foot. An answer and a message go to the Overseer as commands, and a refusal
 * shows verbatim.
 */
import { TypingIndicator } from 'design-system/TypingIndicator';
import type { ReactNode }  from 'react';

import type { PipelineSetupFacts }                         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupQuestionStep }                          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ChatThread }                                      from '../../../conversation/ChatThread.tsx';
import { Composer }                                        from '../../../conversation/Composer.tsx';
import { useTranscript, type TranscriptFollower }          from '../../../conversation/TranscriptLog.tsx';
import { PipelinePanelBody, PipelinePanelFoot }            from '../PipelinePanel.tsx';
import { AgentStrip }                                      from './AgentStrip.tsx';
import { PIPELINE_AGENT_SPEAKER, PipelineAgentPanelModel } from './PipelineAgentPanelModel.ts';
import { SetupQuestionForm }                               from './SetupQuestionForm.tsx';

export interface PipelineAgentPanelProps {
  readonly setup:               PipelineSetupFacts;
  /** The step whose questions the panel shows. */
  readonly step:                SetupQuestionStep;
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
}

export function PipelineAgentPanel({
  setup, step, followTranscript, todayCalendarDate, composerPlaceholder, beforeChat = null, afterChat = null, showsAgentStrip = false
}: PipelineAgentPanelProps) {
  const { record } = setup;
  const { agentJobId } = record;
  const { entries, historyKey } = useTranscript(agentJobId, followTranscript);
  const cards = PipelineAgentPanelModel.questionCardsOf(record.questions, step, record.findings);
  const activityLine = PipelineAgentPanelModel.activityLineOf(entries);
  const turns = agentJobId === null ? [] : PipelineAgentPanelModel.chatTurnsOf(entries, agentJobId, todayCalendarDate);
  return (
    <>
      <PipelinePanelBody followsEnd>
        {beforeChat}
        {turns.length === 0
          ? null
          : <ChatThread label={`Conversation of ${agentJobId ?? PIPELINE_AGENT_SPEAKER}`} turns={turns} renderDecision={() => null} historyKey={historyKey} />}
        {afterChat}
        {activityLine === null ? null : <TypingIndicator text={activityLine} accessibleName={`${PIPELINE_AGENT_SPEAKER} is working`} />}
        {cards.map((card) => <SetupQuestionForm key={card.questionId} setupId={record.setupId} card={card} layout="stack" />)}
      </PipelinePanelBody>
      {showsAgentStrip ? <AgentStrip strip={PipelineAgentPanelModel.agentStripOf(step, record, setup.agentJobState)} /> : null}
      <PipelinePanelFoot>
        <Composer
          label="Message the pipeline agent"
          recipientLabel={PIPELINE_AGENT_SPEAKER}
          recipientJobId={agentJobId}
          status={PipelineAgentPanelModel.composerTagOf(setup.agentJobState)}
          placeholder={composerPlaceholder}
          sendLabel="Send"
          commandOf={(text) => PipelineAgentPanelModel.messageCommandOf(agentJobId, text)}
        />
      </PipelinePanelFoot>
    </>
  );
}
