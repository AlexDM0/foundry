import type { HephaestusLog }                  from '../../../adapters/@types/HephaestusLogRecord.ts';
import type { InterruptionCause }              from '../../../domain/tracker-model/@types/Job.ts';
import type { DecisionDraft, DecisionWording } from '../../../domain/tracker-model/@types/PlaybookStep.ts';
import type { AgentAdapter }                   from '../../../lib/agent-launch/AgentAdapter.ts';
import type { PlatformPorts }                  from '../../../lib/platform-ports/PlatformPortsFor.ts';
import type { BranchNames }                    from '../../../shared/BranchNames.ts';
import type { SharedRepositoryLanding }        from '../../lifecycle/Landing.ts';
import type { Workspace }                      from '../../tracker/Workspace.ts';
import type { BoardChildren }                  from '../BoardChildren.ts';
import type { GateRunSlots }                   from '../GateRunSlots.ts';

export interface JobLaunchContext {
  platformPorts:        PlatformPorts;
  workspace:            Workspace;
  agentAdapter:         AgentAdapter;
  monitorFolder:        string;
  homeDirectory:        string;
  inheritedEnvironment: Readonly<Record<string, string | undefined>>;
  mainLine:             string;
  branchNames:          BranchNames;
  boardChildren:        BoardChildren;
  /** Hephaestus's own runtime, isolating arguments and entry script, which a job's network guard hook runs. */
  programCommand:       readonly string[];
  codeVersion:          string;
  gateSlots:            GateRunSlots;
  windDownMessage:      string;
  decisionWordingOf:    (draft: DecisionDraft) => DecisionWording;
  log:                  HephaestusLog;
  /** The lines the merge commit at the worktree's HEAD changed against git's automatic merge; `null` when git cannot tell. */
  resolutionLinesOf:    (worktreePath: string) => number | null;
  /** Absent for a tracker at its repository's root, which shares no landing journal with siblings. */
  sharedRepository?:    SharedRepositoryLanding;
  /**
   * The cause an install or gate line found lost in this pass is logged with, so its job waits for User's resume: the start's, while a
   * start that leaves work waiting reconciles; `null` or absent otherwise, and a lost line then runs again by itself.
   */
  lostLineCause?:       () => InterruptionCause | null;
}

/** The profile a gate or prepare step runs under in `worktree`: the step's own network and `writes`, and the job's denies. */
export type SandboxContext = Pick<JobLaunchContext, 'homeDirectory' | 'inheritedEnvironment' | 'platformPorts'>;

export type GateEnvironmentContext = SandboxContext & Pick<JobLaunchContext, 'monitorFolder' | 'workspace'>;
