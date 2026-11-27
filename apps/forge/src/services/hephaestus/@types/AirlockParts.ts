import type { DecisionKind }                 from '../../../domain/tracker-model/@types/Decision.ts';
import type { Job, JobEnding, AirlockPhase } from '../../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                    from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { BranchTreeOf, MergeTargetOf }  from '../../../domain/tracker-model/AirlockClaims.ts';
import type { SharedRepositoryLanding }      from '../../lifecycle/Landing.ts';
import type { RedGateOwner }                 from '../../lifecycle/MergeRun.ts';
import type { AirlockAgentScope }            from './AirlockAgents.ts';
import type { AirlockHold, HeldTarget }      from './Airlocks.ts';

export interface StaleGreenRed {
  treeId:  string;
  step:    string;
  /** The entity whose gate went red, on a pipeline with entities. */
  entity?: EntityKey;
  output:  string;
  commit:  string;
}

/** What every phase of a slot shares: the target rule, the held targets, and the slot's decision, phase, freeing and refusal. */
export interface AirlockSlots {
  targetOf:              MergeTargetOf;
  groupOf:               (target: string) => string;
  branchTreeOf:          BranchTreeOf;
  heldTargets:           ReadonlyMap<string, HeldTarget>;
  sharedLanding:         Readonly<{ sharedRepository?: SharedRepositoryLanding }>;
  holdTarget:            (heldTarget: HeldTarget, commitItWaitsToLand: string) => void;
  recheckHeldTargets:    () => void;
  slotWorktreeOf:        (job: Readonly<Job>) => string;
  openDecision:          (hold: AirlockHold, kind: DecisionKind, ticketIds: readonly string[], decisionContext: string) => void;
  setPhase:              (hold: AirlockHold, job: Readonly<Job>, phase: AirlockPhase) => void;
  removeRefreshWorktree: (job: Readonly<Job>) => void;
  freeSlot:              (job: Readonly<Job>, ending: JobEnding, inHold?: (hold: AirlockHold) => void) => Promise<void>;
  refuseMerge:           (job: Readonly<Job>, cause: string, notes: string, reportKind?: unknown) => Promise<void>;
}

/** The merged-tree red the ticket's last worker is resumed with in the Airlock. */
export interface AirlockRed {
  step:     string;
  entity?:  EntityKey;
  output:   string;
  worktree: string;
}

export interface AirlockAgents {
  launchAirlockAgent:    (hold: AirlockHold, job: Readonly<Job>, attempt: number, scope: AirlockAgentScope) => void;
  resumeOrSpendTheAgent: (hold: AirlockHold, job: Readonly<Job>, agent: Readonly<Job> | undefined, red: AirlockRed) => boolean;
  runAirlockAgent:       (job: Readonly<Job>, hasOpenIncident: boolean) => Promise<boolean>;
}

export interface StaleGreenRegates {
  settleTicketsAwaitingGreen: (target: string) => Promise<boolean>;
  returnRedGateToItsOwner:    (hold: AirlockHold, ticketId: string, route: Readonly<{ owner: RedGateOwner; homeEntity: EntityKey }>, red: StaleGreenRed) => void;
}

export interface MergedTreeGating {
  runGate: (job: Readonly<Job>, hasOpenIncident: boolean) => Promise<boolean>;
}

export interface AirlockMergeIn {
  runMergeIn: (job: Readonly<Job>) => Promise<boolean>;
}

export interface AirlockLandings {
  runLanding:              (job: Readonly<Job>) => Promise<boolean>;
  redoReleaseCleanupsOnce: () => Promise<void>;
}

export interface ConstitutionCommitAirlock {
  runConstitutionCommit:      (job: Readonly<Job>) => Promise<boolean>;
  runConstitutionLanding:     (job: Readonly<Job>) => Promise<boolean>;
  endConstitutionCommit:      (job: Readonly<Job>, ending: JobEnding, requestMove?: (hold: AirlockHold, setupId: string) => void) => Promise<boolean>;
  allocateConstitutionCommit: () => Promise<'none' | 'waits' | 'allocated'>;
}

export interface AirlockAllocation {
  allocate: (target: string) => Promise<boolean>;
}
