import type { IncidentDefaultCause, IncidentMove } from '../../../domain/tracker-model/@types/Incident.ts';
import type { JobNotLaunchedCause }                from '../../../domain/tracker-model/@types/Job.ts';
import type { AgentProgramRepair }                 from '../../../lib/agent-launch/AgentAdapter.ts';
import type { GitProblem }                         from '../../../lib/git/@types/GitProblem.ts';
import type { PassThrowReading }                   from '../AbandonedPassReason.ts';
import type { DeclinedCleanup }                    from './Airlocks.ts';

/** Derived each pass from the board, git and Hephaestus's state, never stored. */
export type HephaestusNotice =
  | { kind: 'install-version-changed' }
  | { kind: 'new-code' }
  | { kind: 'attribution-found'; ticketId: string }
  // The ticket's newest review reworked past the threshold and was refused another round: User decides whether an invariant ticket is wanted.
  | { kind: 'rounds-not-converging'; ticketId: string }
  // A landing found the main checkout off the main line or dirty: that target's landings wait, builds and reviews launch on.
  | { kind: 'dirty-main-checkout'; target: string; branch: string | null; blockingFiles: readonly string[] }
  // A landing's fast-forward found a file of the target's checkout held open by another process, on every try: that target's landings wait.
  | { kind: 'target-file-held'; target: string; heldFiles: readonly string[] }
  // An incident took its default since Hephaestus started: shown as a warning.
  | { kind: 'incident-defaulted'; incidentId: string; move: IncidentMove; cause: IncidentDefaultCause }
  // Git declined a removal after a refresh or a release; shown while what it would have removed stands.
  | { kind: 'cleanup-declined'; cleanup: DeclinedCleanup['cleanup']; groupBranch: string; problem: GitProblem }
  // A job's launch was refused, nothing spawned, because an instruction file its pipeline names is missing; retried each pass.
  | { kind: 'instructions-missing'; jobId: string; path: string }
  // A job stands not launched, nothing spawned, because its agent's program does not run; read each pass from the job's stored fact.
  | { kind: 'agent-program-refused'; jobId: string; cause: JobNotLaunchedCause; agentName: string; programPath: string | null; repair: AgentProgramRepair | null }
  // Passes in a row abandoned on one of the tracker lock's expected conditions; the forge keeps running and tries at each wake-up.
  | { kind: 'passes-abandoned'; inARow: number; reason: AbandonedPass['reason'] };

export type AbandonedPass = Extract<PassThrowReading, { verdict: 'abandoned' }>;

/** What a pass knows of the runtime state; Hephaestus adds `restarting` around a restart. */
export type PassRuntimeState = 'serving' | 'held-by-install-change';

export interface HephaestusStateDocument {
  generation:                   number;
  passes:                       number;
  runtimeState:                 PassRuntimeState;
  notices:                      HephaestusNotice[];
  /** The tickets the last pass would have launched but for the machine-wide agent limit. */
  ticketsWaitingForMachineSlot: number;
}
