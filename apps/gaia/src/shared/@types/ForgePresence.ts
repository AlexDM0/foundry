/**
 * A forge's presence as Gaia holds it: what the registry says the forge last wrote of itself, and what a live forge's presence document
 * serves of its supervision, its waiting work and its crash logs. Internal only, so it carries no version.
 */
import type { BoardInterruptionCause, BoardResumeWait } from './board/BoardVocabulary.ts';

export type ForgeRegistryPresenceState = 'serving' | 'stopped' | 'handed-over' | 'crashed';

/** The registry's summary of a crash: the component the forge names, and the error's name and message when it caught one. */
export interface ForgeCrashSummary {
  readonly component:    'overseer' | 'talos';
  /** A crash suspected before a reboot. */
  readonly suspected:    boolean;
  readonly errorName:    string | null;
  readonly errorMessage: string | null;
}

/** `crash` is `null` but for a crashed forge, and for a crashed one whose summary the registry does not hold whole. */
export interface ForgeRegistryPresence {
  readonly state:      ForgeRegistryPresenceState;
  readonly generation: number | null;
  /** When the forge wrote it: shown, never compared. */
  readonly at:         string | null;
  readonly crash:      ForgeCrashSummary | null;
}

export type ForgeSupervision = 'supervising' | 'stopped' | 'checking-after-a-gap' | 'not-yet-renewed' | 'no-talos';

/** One job of the forge's interrupted work, as its presence serves it. */
export interface ForgeWaitingJob {
  readonly jobId:     string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly cause:     BoardInterruptionCause;
  readonly waitsFor:  BoardResumeWait;
}

export type ForgeCrashedComponent = 'hephaestus' | 'talos' | 'unknown';

/** One crash log a live forge lists; the log itself is read on request by its `number`. */
export interface ForgeCrashLogEntry {
  readonly number:     number;
  readonly generation: number | null;
  readonly component:  ForgeCrashedComponent;
  readonly suspected:  boolean;
  /** Shown only. */
  readonly recordedAt: string;
}

export interface ForgePresenceReport {
  readonly supervision:     ForgeSupervision;
  readonly interruptedWork: readonly ForgeWaitingJob[];
  /** Oldest first, by number. */
  readonly crashLogs:       readonly ForgeCrashLogEntry[];
}

/**
 * How a forge is present, told from served facts alone: `crashed` the registry says so; `stopped` and `handed-over` the registry says so and
 * no Overseer answers; `down` the registry says serving and no Overseer answers, gone or hung; `hung` its API answers and its presence says
 * Talos stopped supervising; `unknown` the registry holds no presence of a forge that does not answer.
 */
export type ForgePresenceState = 'serving' | 'hung' | 'stopped' | 'handed-over' | 'crashed' | 'down' | 'unknown';

export interface ForgePresence {
  readonly state:      ForgePresenceState;
  readonly generation: number | null;
  readonly at:         string | null;
}

/** One forge's crash log, read through its API once it serves again. */
export interface ForgeCrashLogJob {
  readonly jobId:        string;
  readonly kind:         string;
  readonly ticketIds:    readonly string[];
  readonly state:        string;
  readonly interruption: string | null;
  readonly airlockPhase: string | null;
}

export interface ForgeCrashLog {
  readonly number:     number;
  readonly generation: number | null;
  readonly component:  ForgeCrashedComponent;
  readonly suspected:  boolean;
  readonly recordedAt: string;
  readonly error:      { readonly origin: string; readonly name: string; readonly message: string; readonly stack: string | null } | null;
  /** `null` when the board could not be read at the crash: never shown as a board with no jobs. */
  readonly activeJobs: readonly ForgeCrashLogJob[] | null;
  readonly logTail:    readonly string[] | null;
}
