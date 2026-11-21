/**
 * The page contract of `POST /api/commands` (PLAN 6.3 and 8.2): the one command the page sends per request, and Gaia's answer to it. The
 * server reads the body in through its own ingestion and maps its verdict out to the answer, so the page knows only these two shapes.
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
      | 'forge-update'
      | 'forge-open-in-browser'
      | 'forge-hide'
      | 'forge-unhide'
      | 'forge-brain-start'
      | 'forge-brain-stop';
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
  | { kind: 'fleet-look-again' };

export type CommandBody = ForgeCommandBody | FleetCommandBody;

export type CommandKind = CommandBody['kind'];

export type FleetCommandKind = FleetCommandBody['kind'];

export type CommandDocument = CommandBody & { commandVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaCommand };

/** `restart-pending`: a `forge-update` was done, and the forge's Overseer runs the old code until it restarts. */
export type CommandOutcome = 'done' | 'nothing-to-do' | 'restart-pending' | 'refused' | 'unreachable' | 'not-supported';

/**
 * `refusal` is the forge's own code, passed through unchanged, and `text` its sentence, in Gaia's words where the forge's names a command
 * (D10) and `null` where Gaia has none for it; `text` is the chosen path of a `path-choose`.
 */
export interface CommandAnswerDocument {
  answerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaCommandAnswer;
  outcome:       CommandOutcome;
  refusal:       string | null;
  text:          string | null;
}
