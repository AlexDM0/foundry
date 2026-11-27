/**
 * The board's notice about its agent, pure: a job whose launch the forge refused, or a forge with a pipeline and no agent, each with where it
 * is fixed. While the board has no readable pipeline, a job not launched for want of an agent says nothing: the setup is where it is chosen.
 */
import type { BoardDocument } from '../../@types/board/BoardDocument.ts';
import type { BoardRoute }    from '../../shared/BoardRouter.ts';
import { CountTextUtil }      from '../../shared/utils/CountTextUtil.ts';
import { PipelineViewModel }  from '../views/pipeline/PipelineViewModel.ts';

export interface AgentNoticeView {
  readonly tone:            'error' | 'warn';
  readonly text:            string;
  readonly actionLabel:     string;
  readonly actionRoute:     BoardRoute;
  /** A refused launch offers Look again: forge runs the program again and launches what stood. */
  readonly offersLookAgain: boolean;
}

export type AgentNoticeFacts = Pick<BoardDocument, 'jobs' | 'agent' | 'pipeline'>;

function notLaunchedTextOf(jobIds: readonly string[], reason: string): string {
  const { agreeingPhrase } = CountTextUtil;
  return `${agreeingPhrase(jobIds.length, 'Job', 'Jobs')} ${jobIds.join(', ')} ${agreeingPhrase(jobIds.length, 'is', 'are')} not launched: ${reason}.`;
}

function agentNoticeOf(facts: AgentNoticeFacts): AgentNoticeView | null {
  const { agent, pipeline } = facts;
  const setupMode = pipeline.setup?.record.mode ?? null;
  const isInSetup = PipelineViewModel.isInSetup(facts);
  const notLaunchedJobs = facts.jobs.filter((job) => job.notLaunched !== null
    && !(isInSetup && PipelineViewModel.isNotLaunchedForWantOfAnAgent(job.notLaunched.cause)));
  const [firstNotLaunched] = notLaunchedJobs;
  if (firstNotLaunched?.notLaunched !== undefined && firstNotLaunched.notLaunched !== null) {
    const fix = PipelineViewModel.notLaunchedFixOf(facts, firstNotLaunched.notLaunched.cause);
    return {
      tone:            'error',
      text:            notLaunchedTextOf(notLaunchedJobs.map((job) => job.id), firstNotLaunched.notLaunched.text),
      actionLabel:     fix.label,
      actionRoute:     fix.route,
      offersLookAgain: true,
    };
  }
  const agentIsMissing = agent.choice === null && !isInSetup && setupMode !== 'setup';
  if (!agentIsMissing) return null;
  return {
    tone:            'warn',
    text:            'No agent is chosen for this forge, so no job launches.',
    actionLabel:     'Choose this forge\'s agent',
    actionRoute:     PipelineViewModel.agentChoiceRouteOf(facts),
    offersLookAgain: false,
  };
}

export const AgentNoticeModel = Object.freeze({ agentNoticeOf });
