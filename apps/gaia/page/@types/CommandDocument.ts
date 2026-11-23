/**
 * The page contract of `POST /api/commands` (`docs/architecture.md`, "A command, from button to forge"): the one command the page sends per
 * request, and Gaia's answer to it. The server reads the body in through its own ingestion and maps its verdict out to the answer, so the
 * page knows only these two shapes.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../src/shared/constants/PageContractVersions.ts';
import type { FleetDocumentSettings }  from './FleetDocument.ts';

export type ForgeStopAgents = 'keep' | 'stop-first';

export type PathChoiceTarget = 'folder' | 'file';

/** One settings key and its value, the pair kept together so a value never travels under another key. */
export type SettingsChange = { [Key in keyof FleetDocumentSettings]: { key: Key; value: FleetDocumentSettings[Key] } }[keyof FleetDocumentSettings];

/** What a resume of a forge's interrupted work names: one job, one ticket as it is written, or every job that waits for an instruction. */
export type InterruptedWorkTarget = { jobId: string } | { ticketReference: string } | 'all';

/** A command about one forge, named by its `trackerId`. `forge-unpause` undoes a pause; a resume restarts interrupted work. */
export type ForgeCommandBody =
  | {
    kind:
      | 'forge-start'
      | 'forge-pause'
      | 'forge-unpause'
      | 'forge-restart'
      | 'forge-talos-restart'
      | 'forge-update'
      | 'forge-hide'
      | 'forge-unhide';
    trackerId: string;
  }
  | { kind: 'forge-stop'; trackerId: string; agents: ForgeStopAgents }
  | { kind: 'forge-concurrency-set'; trackerId: string; limit: number }
  | { kind: 'forge-interrupted-work-resume'; trackerId: string; target: InterruptedWorkTarget };

/** A command about the fleet, the machine or Gaia itself, named by no forge. */
export type FleetCommandBody =
  | { kind: 'forge-add'; root: string; project: string }
  | { kind: 'machine-agent-limit-set'; limit: number }
  | ({ kind: 'settings-set' } & SettingsChange)
  | { kind: 'path-choose'; what: PathChoiceTarget }
  | { kind: 'fleet-look-again' }
  | { kind: 'fleet-outage-resume' };

export type CommandBody = ForgeCommandBody | FleetCommandBody;

export type CommandKind = CommandBody['kind'];

export type FleetCommandKind = FleetCommandBody['kind'];

export type CommandDocument = CommandBody & { commandVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaCommand };

/** `restart-pending`: a `forge-update` was done, and the forge's Hephaestus runs the old code until it restarts. */
export type CommandOutcome = 'done' | 'nothing-to-do' | 'restart-pending' | 'refused' | 'unreachable' | 'not-supported';

/** How one forge took `fleet-outage-resume`: it resumed its jobs a network outage stopped, held none, refused, or was not reached. */
export type OutageResumeOutcome = 'resumed' | 'nothing-to-do' | 'refused' | 'not-reached';

export interface CommandAnswerForgeDocument {
  trackerId:    string;
  outcome:      OutageResumeOutcome;
  /** Zero but for `resumed`: the jobs Gaia last read waiting in that forge. */
  resumedCount: number;
  /** The forge's sentence of a `refused`, unchanged; `null` otherwise. */
  refusalText:  string | null;
}

/**
 * `refusal` is the forge's own code, passed through unchanged, and `text` its sentence, in Gaia's words where the forge's names a command
 * (D10) and `null` where Gaia has none for it; `text` is the chosen path of a `path-choose`. `forges` holds one answer per registered forge
 * for `fleet-outage-resume`, `done` or, when every forge held nothing, `nothing-to-do`; it is empty for every other command.
 */
export interface CommandAnswerDocument {
  answerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaCommandAnswer;
  outcome:       CommandOutcome;
  refusal:       string | null;
  text:          string | null;
  forges:        readonly CommandAnswerForgeDocument[];
}
