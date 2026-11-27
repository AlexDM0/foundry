/**
 * The board's notice about its agent, pure: a job whose launch forge refused, worded with forge's own reason, or a forge with a pipeline
 * and no agent, which launches nothing; each with where it is fixed (`PipelineViewModel.notLaunchedFixOf`), the setup landing on a forge
 * with no pipeline and no setup. `null` while every job launched and the forge has an agent. While the board has no readable pipeline a
 * job not launched for want of an agent says nothing: the setup on screen is where the agent is chosen.
 */
import type { BoardDocument } from '../../@types/board/BoardDocument.ts';
import type { BoardRoute }    from '../../shared/BoardRouter.ts';
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
  if (jobIds.length === 1) return `Job ${jobIds[0] ?? ''} is not launched: ${reason}.`;
  return `Jobs ${jobIds.join(', ')} are not launched: ${reason}.`;
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
