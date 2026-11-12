/**
 * The pipeline agent panel: one step's setup questions as question cards, the agent's chat, the line of what it does while a turn runs,
 * and the composer that messages it. The inline variant sits under a setup step's page with its questions side by side; the aside variant
 * stacks them beside the flow or the constitution. An answer and a message go to the Overseer as commands, and a refusal shows verbatim.
 */
import type { ReactNode } from 'react';

import type { PipelineSetupFacts }                         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupQuestionStep }                          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ChatThread }                                      from '../../../conversation/ChatThread.tsx';
import { Composer }                                        from '../../../conversation/Composer.tsx';
import { useTranscript, type TranscriptFollower }          from '../../../conversation/TranscriptLog.tsx';
import { TypingIndicator }                                 from '../../../design-system/TypingIndicator.tsx';
import { PIPELINE_AGENT_SPEAKER, PipelineAgentPanelModel } from './PipelineAgentPanelModel.ts';
import { SetupQuestionForm }                               from './SetupQuestionForm.tsx';

export type PipelineAgentPanelVariant = 'inline' | 'aside';

export interface PipelineAgentPanelProps {
  readonly setup:               PipelineSetupFacts;
  /** The step whose questions the panel shows. */
  readonly step:                SetupQuestionStep;
  readonly variant:             PipelineAgentPanelVariant;
  readonly followTranscript:    TranscriptFollower;
  readonly todayCalendarDate:   string;
  /** The composer's example of what to tell the agent on this step. */
  readonly composerPlaceholder: string;
  /** What follows the chat before the composer, such as the agent's newest change with its links. */
  readonly afterChat?:          ReactNode;
}

export function PipelineAgentPanel({
  setup, step, variant, followTranscript, todayCalendarDate, composerPlaceholder, afterChat = null
}: PipelineAgentPanelProps) {
  const { record } = setup;
  const { agentJobId } = record;
  const entries = useTranscript(agentJobId, followTranscript);
  const cards = PipelineAgentPanelModel.questionCardsOf(record.questions, step, record.findings);
  const activityLine = PipelineAgentPanelModel.activityLineOf(entries);
  const turns = agentJobId === null ? [] : PipelineAgentPanelModel.chatTurnsOf(entries, agentJobId, todayCalendarDate);
  const composerLabel = 'Message the pipeline agent';
  return (
    <section className="bridge-pipeline-agent-panel" data-variant={variant} aria-label="Conversation with the pipeline agent">
      {cards.length === 0
        ? null
        : (
          <div className="bridge-pipeline-agent-questions">
            {cards.map((card) => (
              <SetupQuestionForm key={card.questionId} setupId={record.setupId} card={card} layout={variant === 'inline' ? 'columns' : 'stack'} />
            ))}
          </div>
        )}
      {turns.length === 0 ? null : <ChatThread label={`Conversation of ${agentJobId ?? PIPELINE_AGENT_SPEAKER}`} turns={turns} renderDecision={() => null} />}
      {afterChat}
      {activityLine === null ? null : <TypingIndicator text={activityLine} accessibleName={`${PIPELINE_AGENT_SPEAKER} is working`} />}
      <Composer
        label={composerLabel}
        recipientLabel={PIPELINE_AGENT_SPEAKER}
        recipientJobId={agentJobId}
        status={PipelineAgentPanelModel.composerTagOf(setup.agentJobState)}
        placeholder={composerPlaceholder}
        sendLabel="Send"
        commandOf={(text) => PipelineAgentPanelModel.messageCommandOf(agentJobId, text)}
      />
    </section>
  );
}
