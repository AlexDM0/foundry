import type { RedHandoffFacts }         from '../../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { EntityKey, PipelineGate } from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { DocumentReading }         from '../../../domain/tracker-model/utils/TicketDocumentReadingUtil.ts';
import type { AgentConfinement }        from '../../../lib/agent-launch/AgentLaunchRequest.ts';
import type { AirlockAgentPhase }       from '../AirlockFactsFile.ts';
import type { AssistantFacts }          from '../AssistantBoot.ts';
import type { CrossingStageFacts }      from '../CrossingStages.ts';
import type { DocumentAgentFacts }      from '../DocumentAgentSessions.ts';
import type { EffectReadingFacts }      from '../EffectReadings.ts';
import type { IntakeFacts }             from '../IntakeSessions.ts';
import type { NeedsSettledFacts }       from '../NeedTickets.ts';
import type { PipelineAgentFacts }      from '../PipelineAgentSessions.ts';
import type { TargetCatchUpHandover }   from './BuildJobObservation.ts';

/** What a session is told at launch; worded by the command line, since services hold no words. */
export interface JobLaunchText {
  firstMessage: string;
  roleBrief:    string;
}

/** What the launch text is filled from: the job's tickets as stored, and the checks line its work is gated by. */
export interface JobLaunchFacts {
  /** `documents`: the ticket's spec and plan as the job's role reads them, absent for a ticket without documents. */
  tickets:                readonly { id: string; title: string; body: string; branch: string; documents?: readonly DocumentReading[] }[];
  /** The gates as the shell line's display render, which an agent reads and nothing spawns; `null` with no pipeline stored. */
  checksLine:             string | null;
  /** The stored gates in run order, which a builder is briefed on, each folder from where the session starts; `null` with no pipeline stored. */
  gates:                  readonly Readonly<PipelineGate>[] | null;
  /** The tracker's project folder from the worktree's root where the session starts; absent when the session starts in the project's folder. */
  projectFolder?:         string;
  /** The board's merge approval: on, a reviewer merges its target into the branch as its review's last step. Absent reads as off. */
  mergeApprovalIsOn?:     boolean;
  /** The job's work was last held by a session ended `replaced`, whose uncommitted changes are in the worktree it inherits. */
  earlierSessionReplaced: boolean;
  /** The red handoff a fresh session takes over from the session it replaces, which could not be resumed; `null` otherwise. */
  redHandoff?:            RedHandoffFacts | null;
  /** What a builder its review sent back is resumed with, in place of its build prompt; `null` for every other job. */
  reviewFindings?:        ReviewFindingsFacts | null;
  /** What a build that runs its stage again after the needs it declared are settled is told; `null` for every other job. */
  needsSettled?:          NeedsSettledFacts | null;
  /** What a job of an entity is told of the stage of a ticket that crosses into whitelisted packages; absent or `null` for every other job. */
  crossingStage?:         CrossingStageFacts | null;
  /** The key of the pipeline's root entity, on a pipeline with entities; absent where it is the default key. */
  rootEntityKey?:         EntityKey;
  /** A product owner's request, and what a fresh one takes over from the session it replaces; `null` for every other job. */
  intake:                 IntakeFacts | null;
  /** What a merge-gate fixer or a resolution reviewer is told of its Airlock; `null` for every other job. */
  airlock:                AirlockFacts | null;
  /** What a fresh Assistant boots with: the incidents of its first message, the newest incident records and the board; `null` otherwise. */
  assistant:              AssistantFacts | null;
  /** A pipeline agent's record, the stored pipeline and the gate history `advise` reads; `null` for every other job. */
  pipelineAgent?:         PipelineAgentFacts | null;
  /** A spec or plan agent's ticket, request and documents; absent or `null` for every other job. */
  documentAgent?:         DocumentAgentFacts | null;
  /** An effect reader's version and the main line's paths; absent or `null` for every other job. */
  effectReading?:         EffectReadingFacts | null;
  /** The role's instruction files as the pipeline names them, joined in order and unfilled; empty for a job no array speaks for. */
  instructions:           string;
  /** What the session runs under on this platform, the one fact its settings and its prompt's confinement claims both come from. */
  confinement:            AgentConfinement;
}

/** The review that did not hold, and which resume of the builder's handoff cycle this is. */
export interface ReviewFindingsFacts {
  reviewSection:  string;
  resume:         number;
  resumesAllowed: number;
  /** Set when the review ended before its reviewer, on bringing the branch up to the target: the conflict or the red gate. */
  targetCatchUp?: TargetCatchUpHandover | null;
}

/** What an Airlock agent is sent in for: the conflict of the merge-in, the re-review of its resolution, or the red gate on the merged tree. */
export interface AirlockFacts {
  /** `before-human-code-review` for a conflict re-reviewer under a build or review job in `merging-main`, outside any Airlock. */
  mergePlacement:      'airlock' | 'before-human-code-review';
  worktree:            string;
  branchTip:           string;
  targetTip:           string;
  phase:               AirlockAgentPhase;
  conflictedFiles:     readonly string[];
  /** The newest red gate on the merged tree; `null` before one. */
  redHandoff:          RedHandoffFacts | null;
  /** `false` for a fresh agent in place of a ticket agent whose session could not be resumed. */
  resumesSession:      boolean;
  /** A package's builder resolving its part of a crossing ticket's conflict: it leaves the merge open for the worker after it. */
  leavesTheMergeOpen?: true;
}
