import type { HephaestusLog }                          from '../../../adapters/@types/HephaestusLogRecord.ts';
import type { MergeDecisionProblem }                   from '../../../adapters/MergeDecisionWording.ts';
import type { PipelineCheckProblem }                   from '../../../adapters/pipeline/PipelineCheckProblemWording.ts';
import type { StartClassificationVerdict }             from '../../../adapters/presence/@types/StartClassificationVerdict.ts';
import type { RedHandoffFacts }                        from '../../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { TurboConfigurationProblem }              from '../../../adapters/turbo-configuration/@types/TurboConfigurationProblem.ts';
import type { DecisionAnswer }                         from '../../../domain/tracker-model/@types/Decision.ts';
import type { Job }                                    from '../../../domain/tracker-model/@types/Job.ts';
import type { DecisionDraft, DecisionWording }         from '../../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                  from '../../../domain/tracker-model/Board.ts';
import type { AgentAdapter }                           from '../../../lib/agent-launch/AgentAdapter.ts';
import type { PlatformPorts }                          from '../../../lib/platform-ports/PlatformPortsFor.ts';
import type { ConstitutionCommitProblem }              from '../../../shared/@types/ConstitutionCommitProblem.ts';
import type { SetupMessage }                           from '../../../shared/@types/ControlContext.ts';
import type { BranchNames }                            from '../../../shared/BranchNames.ts';
import type { AgentProgramResolution }                 from '../../control/AgentPrograms.ts';
import type { LineRunner }                             from '../../lifecycle/GateRun.ts';
import type { BoardStore }                             from '../../store/BoardStore.ts';
import type { LockTaker }                              from '../../tracker/GenerationLock.ts';
import type { Workspace }                              from '../../tracker/Workspace.ts';
import type { AssistantChatFacts }                     from '../AssistantSession.ts';
import type { BoardChildren }                          from '../BoardChildren.ts';
import type { DependentFixFacts, DependentFixWording } from '../DependentFixTickets.ts';
import type { PackageNeedFacts, PackageNeedWording }   from '../EntityDecisionAnswers.ts';
import type { ProcessStarts }                          from '../ProcessStarts.ts';
import type { UnreadableBoardFiles }                   from '../UnreadableBoardFiles.ts';
import type { FolderMaker }                            from '../WorkerProfiles.ts';
import type { JobLaunchFacts, JobLaunchText }          from './JobLaunchFacts.ts';

export interface DrivePassRequest {
  platformPorts:                 PlatformPorts;
  workspace:                     Workspace;
  /** The pass changes the board only through its transactions and reads it only through its read side. */
  boardStore:                    BoardStore;
  now:                           () => Date;
  formatStamp:                   (moment: Date) => string;
  hephaestusDirectory:           string;
  generation:                    number;
  boardChildren:                 BoardChildren;
  /** Runs Hephaestus's own gate lines (merged-tree gates, gate profiles, pipeline checks) as line children of the board's Talos. */
  lineRunner:                    LineRunner;
  /** Called as each pass begins: Hephaestus starts or attaches to a Talos there once its connection to the last one closed. */
  ensureTalosIfLost?:            () => Promise<void>;
  /** The board-wide files Hephaestus could not read, which the board header warns of until it restarts. */
  unreadableBoardFiles:          UnreadableBoardFiles;
  /** The runtime, isolating arguments and entry script this Hephaestus was started with, which a job's network guard hook runs. */
  programCommand:                readonly string[];
  codeVersion:                   string;
  agentAdapter:                  AgentAdapter;
  /** The machine's monitor folder: `<home>/<monitor folder>`. */
  monitorFolder:                 string;
  /** Narrowed to the launch allowlist before any session sees it. */
  inheritedEnvironment:          Readonly<Record<string, string | undefined>>;
  mainLine:                      string;
  /** Read from the board when Hephaestus starts; the namespace changes only while no Hephaestus runs. */
  branchNames:                   BranchNames;
  installVersionChanged:         () => boolean;
  /** Resolves once the install versions a pass reads are known, such as after a landing; the event loop runs while it waits. */
  installVersionsKnown?:         () => Promise<void>;
  /** Whether Hephaestus's environment holds the variable, such as the key a billing's way needs before any session starts. */
  agentVariableIsSet:            (variableName: string) => boolean;
  /** Code on disk differs from the code in memory while the install version does not: a notice only. */
  newCodeOnDisk?:                () => boolean;
  decisionWordingOf:             (draft: DecisionDraft) => DecisionWording;
  /** A git or report problem as the stored note of a merge-refused decision names it. */
  mergeDecisionSentenceOf:       (problem: MergeDecisionProblem) => string;
  /** A constitution commit's git problem as the stored Apply refusal's `gitFailure` names it. */
  applyRefusalSentenceOf:        (problem: ConstitutionCommitProblem) => string;
  /** Why a pipeline check could not run, as its stored `cannot-run` reason names it. */
  checkReasonSentenceOf:         (problem: PipelineCheckProblem) => string;
  /** An unreadable turbo configuration as the stored value of a gate profile's research finding names it. */
  findingSentenceOf:             (problem: TurboConfigurationProblem) => string;
  /** The ticket a crossing ticket's package change becomes once User turns it into a need (E19, E22). */
  packageNeedWordingOf:          (facts: PackageNeedFacts) => PackageNeedWording;
  /** The ticket of a dependent that a crossing ticket's package change breaks, once User has it fixed in the group (E26). */
  dependentFixWordingOf:         (facts: DependentFixFacts) => DependentFixWording;
  launchTextOf:                  (job: Readonly<Job>, facts: JobLaunchFacts) => JobLaunchText;
  /** One numbered chat to the Assistant listing the incidents it delivers, their facts and allowed moves. */
  assistantChatTextOf:           (facts: AssistantChatFacts) => string;
  /** Sent to a session that reached its role's call budget. */
  windDownMessage:               string;
  /** The first line of every resumed session. */
  resumeMessage:                 string;
  /** The first line of a session resumed to fix its red handoff, and the opening of a fresh one taking the handoff over. */
  redHandoffMessageOf:           (facts: Readonly<RedHandoffFacts>) => string;
  /** An answer worded as a plain user message, for a resumed session that no longer holds the question's request. */
  answerMessageOf:               (answer: DecisionAnswer) => string;
  /** What the pipeline agent reads when User's check of its setup record ends. */
  setupMessageWordingOf:         (message: SetupMessage) => string;
  homeDirectory:                 string;
  log:                           HephaestusLog;
  /** Where a stale landing lock record the pass took over goes, so the caller words it into its log. */
  onStaleLockTakenOver:          LockTaker['onStaleTakenOver'];
  /** The pass stops acting at once; the caller ends Hephaestus `hephaestus-lock-taken`. */
  onHephaestusLockTakenOver:     (refusal: unknown) => void;
  /** A pass threw what no abandoned pass names: the caller runs the crash path and ends Hephaestus `crashed`; no pass runs after it. */
  onPassCrashed:                 (thrown: unknown) => Promise<void>;
  /** Called for each job's Hatch folder as the launch makes it, so a relayed request wakes a pass where no recursive watch sees the folder. */
  watchHatchFolder?:             (hatchDirectory: string) => void;
  /** Called for the Hatch folder of each job the pass saw launched, once the job is gone from the board. */
  unwatchHatchFolder?:           (hatchDirectory: string) => void;
  /** Overridden by specs, which refuse to make an Airlock agent worktree's denied root. */
  folderMaker?:                  FolderMaker;
  /** Called inside the hold after each of its three phases, on the Board being changed; the step a spec reads the order at. */
  afterHoldPhase?:               (phase: 'relayed-commands' | 'child-events' | 'lifecycle', board: Board) => void;
  /** After each pass that ran to its end or was abandoned, outside the hold: Hephaestus publishes its state to the event stream there. */
  afterPass?:                    () => void;
  processStarts?:                ProcessStarts;
  /** Overridden by specs, which cannot wait out the production retry of a merge gate looking for a free gate slot. */
  gateSlotRetryMilliseconds?:    number;
  /** The CPU count the machine agent limit is capped at; the runtime's when not given. */
  machineAgentCeiling?:          number;
  /** Overridden by specs, which cannot wait out the production grace a stopped session gets to end by itself. */
  sessionStopGraceMilliseconds?: number;
  /** The program a job's session starts, or why it is not launched; absent reads the forge's agent through the machine's config. */
  agentProgramOf?:               (board: Board, job: Readonly<Job>) => AgentProgramResolution;
  /** The program a launch starts when the forge names no agent: the fake agent's runtime in a scratch forge; absent in production. */
  agentProgramWhenNoneIsChosen?: string;
  /** What kind of start the start gate judged this serving period's; the reconcile at start reads it. */
  startClassification?:          StartClassificationVerdict;
}
