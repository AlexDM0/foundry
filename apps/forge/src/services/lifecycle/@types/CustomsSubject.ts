import type { LaunchSnapshot }  from '../../../adapters/@types/LaunchSnapshot.ts';
import type { LogRecord }       from '../../../domain/tracker-model/@types/LogRecord.ts';
import type { PipelineGate }    from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { TicketStageName } from '../../../domain/tracker-model/@types/Task.ts';
import type { AgentAdapter }    from '../../../lib/agent-launch/AgentAdapter.ts';
import type { GitPathStyle }    from '../../../lib/git/GitPaths.ts';

import type { RefMovesAllowed } from './RefMoves.ts';

/** A fixer is a builder one attempt on, and is verified as one. */
/**
 * `airlock-agent` is the ticket's last worker resumed into the Airlock for a conflict or a red merged tree; a conflict re-reviewer in the
 * Airlock is verified as a `reviewer`.
 */
export type VerifiedRole = 'builder' | 'reviewer' | 'airlock-agent' | 'pipeline-agent' | 'document-agent';

/** The roles that end with a report: the pipeline agent and a document agent are sessions, verified at each turn end with no report. */
export type ReportingRole = Exclude<VerifiedRole, 'pipeline-agent' | 'document-agent'>;

export interface MergeUnderVerification {
  branchTip:       string;
  targetTip:       string;
  conflictedFiles: readonly string[];
}

/**
 * What a job of an entity may change. A path belongs to the deepest home that holds it, so a path that a deeper home of another
 * entity holds is that entity's, though one of `homes` holds it too. A `reach` path is writable wherever it lies; the pipeline's check
 * keeps it to paths the root entity owns.
 */
export interface WritableFolders {
  /** The stage entity's homes, repository folders leading with `/`; `/` among them for the root entity, which owns every path no home holds. */
  homes:          readonly string[];
  /** The stage entity's `reach`: repository paths outside its homes, each leading with `/`. */
  reach:          readonly string[];
  /** The homes of every other entity of the pipeline. */
  otherHomes:     readonly string[];
  /**
   * In stage 1 of an entity with a `whitelist`: the homes of its whitelisted packages, where the builder may write a proposal. A branch
   * that changed nothing in the entity's own homes and `reach` is still refused apart.
   */
  proposalHomes?: readonly string[];
}

/** A crossed package's sealed change: the pathspecs the seal covers and the hash its package review stored. */
export interface SealedChange {
  /** The package entity's key. */
  entity:    string;
  /**
   * Git pathspecs from the repository root: the package's homes, each deeper home of another entity excluded, and the `reach` paths
   * its package stages changed.
   */
  pathspecs: readonly string[];
  seal:      string;
}

/**
 * A job of a ticket whose row stores a stage, so the ticket crosses into whitelisted packages. The branch holds the earlier
 * stages' change, so every stage but `build` is judged on its own commits; a later job may not alter a sealed change.
 */
export interface CrossingStageScope {
  stageName:         TicketStageName;
  /** The seals of the crossed packages so far; the Airlock's merge and conflict work are exempt. */
  seals:             readonly SealedChange[];
  /**
   * The start of the first job of this run of the stage: a later stage answers for every commit since, so a retry after a refused job still
   * answers for that job's commits. The job's own start when absent.
   */
  stageStartCommit?: string;
}

/** An entity's constitution as a git path from the repository root, and the entity whose pipeline names it. */
export interface EntityConstitution {
  entity:  string;
  gitPath: string;
}

/**
 * Who may change a constitution on a pipeline with entities: only a job of a ticket of the constitution's own entity, and never a job of
 * a package stage, even where the ticket body names the file.
 */
export interface ConstitutionOwnership {
  ticketEntity:  string;
  constitutions: readonly EntityConstitution[];
}

/**
 * Where the tracker's project lies in its repository, and what a branch may change besides it. With the prefix `''` the whole repository
 * is the project, and every check judges it as it always has, unless the pipeline has entities.
 */
export interface ProjectScope {
  /** `ProjectLocation.projectPrefix`: the project's folder from the repository root, `/`-separated, `''` at the root. */
  projectPrefix:    string;
  /** The pipeline's `reach`: the repository paths besides the project a branch may change, each leading with `/`. */
  reach:            readonly string[];
  /** On a pipeline with entities: every entity's home, leading with `/`: `dataFolderUntouched` and `agentConfigUntouched` guard it as the root. */
  entityHomes?:     readonly string[];
  /** A job of an entity: `changesStayInHomeAndReach` holds its branch to these folders, in place of the project's folder and `reach`. */
  writableFolders?: WritableFolders;
  /** A job of a ticket of an entity: `changesStayInHomeAndReach` also refuses its change of a constitution its entity does not own. */
  constitutions?:   ConstitutionOwnership;
}

/** What the agent's adapter names: `agentConfigUntouched` protects its configuration, `noAiAttributionInRange` refuses its attribution. */
export type AgentNaming = Pick<AgentAdapter, 'configurationNames' | 'attributionPatterns'>;

export interface CustomsSubject {
  role:                      VerifiedRole;
  worktreePath:              string;
  /** The worktree's HEAD at launch, the branch tip with `MERGE_HEAD` at the target tip for an Airlock agent, the merged commit after it. */
  startCommit:               string;
  /** `aCommitSinceTheStart` measures from it when set: the start of the failed build attempts this one retries, already on its branch. */
  workStartCommit?:          string;
  /** The report as parsed from the session's structured output, unvalidated. */
  report:                    unknown;
  /** The ticket's body, and for a ticket with documents its spec and plan beside it: `checksDefinitionUnchanged` lets through a path it names. */
  ticketBody:                string;
  /** `everyAcceptanceItemAccountedFor` reads the Acceptance here when set, the approved spec of a ticket with documents; else `ticketBody`. */
  acceptanceText?:           string;
  /**
   * `ticketDocumentsUnchanged` compares the ticket's document heads as the job's start recorded them and as they stand as the job ends;
   * both absent or empty for a ticket without documents.
   */
  documentVersionsAtLaunch?: string;
  ticketDocumentVersions?:   string;
  /** The ticket's content hash as the job's start recorded it; empty for a job with no ticket or a ticket that holds none. */
  contentHashAtLaunch:       string;
  /** The ticket's content hash as the job ends, empty likewise: `ticketContentUnchanged` compares the two. */
  ticketContentHash:         string;
  /** The merge `mergeIsResolved` judges, for an Airlock agent. */
  merge?:                    MergeUnderVerification;
  /**
   * The gate catalogue, every gate whatever phases run it: `checksDefinitionUnchanged` reads each one's `definedBy`,
   * `everyAgentGateClaimedOnHead` the ones an agent runs; absent or empty, both pass.
   */
  gates?:                    readonly Readonly<PipelineGate>[];
  /**
   * For `checksDefinitionUnchanged`: the tracked files, as repository paths, each role's resolved instruction list names, the
   * constitution's path among them, which a branch changes only where its ticket names them (`InstructionFiles.trackedInstructionPathsOf`).
   */
  instructionFiles?:         readonly string[];
  /**
   * For `checksDefinitionUnchanged`: the line the branch lands on. When set, an instruction file counts as changed only where the branch
   * changed it itself; a change that reached the branch through a merge of this line, such as a constitution commit, is not the worker's edit.
   */
  target?:                   string;
  /** For `filedFindingsWereFiledByThisJob`: the job being verified, and the log as stored plus this hold's records. */
  jobId?:                    string;
  logRecords?:               readonly LogRecord[];
  /** The launch snapshot `agentConfigUntouched` and `onlyOwnRefsMoved` read; without it the latter refuses, since nothing proves no ref moved. */
  launchSnapshot?:           LaunchSnapshot;
  refMovesAllowed?:          RefMovesAllowed;
  /** How a path compares with git's spelling, from the `DataFolders` port; the host's path module without case folding when absent. */
  pathStyle?:                GitPathStyle;
  /**
   * For `dataFolderUntouched`, `checksDefinitionUnchanged`, `agentConfigUntouched` and `changesStayInHomeAndReach`; absent for a tracker
   * at its repository's root whose pipeline has no entities. `worktreePath` is the worktree's root either way.
   */
  projectScope?:             ProjectScope;
  /** A job of a ticket that crosses into whitelisted packages, once its row stores a stage; absent for every other job. */
  crossingStage?:            CrossingStageScope;
  /** The agent's configuration, which `agentConfigUntouched` protects, and attribution, which `noAiAttributionInRange` refuses beside forge's. */
  agentNaming:               AgentNaming;
}

export type RangeSubject = Pick<CustomsSubject, 'worktreePath' | 'startCommit' | 'merge'>;
