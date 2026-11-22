/** The forge program's JSON answers (F8) mapped in, one per verb, and the verdict every run of the program ends in. */
import type { ForgeContracts } from '../../../shared/@types/ForgeReading.ts';

export type ForgeProgramOutcome = 'done' | 'nothing-to-do';

/** `started` is `false` when a Hephaestus was already live and the program started nothing. */
export interface ForgeStartAnswer {
  readonly started:        boolean;
  readonly url:            string;
  readonly generation:     number;
  readonly trackerId:      string;
  readonly codeVersion:    string;
  readonly installVersion: number;
  readonly contracts:      ForgeContracts;
}

export interface ForgeStopAnswer {
  readonly outcome: ForgeProgramOutcome;
}

/** `created` for a new tracker; `refreshed` when the root was tracked already and only what `update` writes was refreshed. */
export type ForgeInitOutcome = 'created' | 'refreshed';

export interface ForgeInitAnswer {
  readonly outcome:   ForgeInitOutcome;
  readonly trackerId: string;
  readonly project:   string;
  readonly root:      string;
}

/**
 * A failed restart names its step: `restart-not-taken` when the live Hephaestus did not take the restart and the old one still drives, at
 * exit 0; a restart whose preflight failed is the refusal `restart-failed`.
 */
export type ForgeRestart =
  | { readonly outcome: 'done' }
  | { readonly outcome: 'not-needed' }
  | { readonly outcome: 'failed'; readonly failedStep: string };

export interface ForgeUpdateAnswer {
  readonly outcome:        ForgeProgramOutcome;
  readonly installVersion: number;
  readonly restart:        ForgeRestart;
}

/** The installed program's versions: its code, its install version, its contracts and the protocol version of the Talos it starts. */
export interface ForgeVersionAnswer {
  readonly codeVersion:          string;
  readonly installVersion:       number;
  readonly contracts:            ForgeContracts;
  readonly talosProtocolVersion: number;
  readonly monitorFolder:        string;
}

export interface ForgeMachineLimitAnswer {
  readonly outcome:    ForgeProgramOutcome;
  readonly agentLimit: number;
}

/**
 * `no-json`: standard output is not one JSON object. `other-answer-version`: `answerVersion` is absent or not the known number. `malformed`:
 * a done answer lacks a key it needs, or a refusal lacks its code or sentence.
 */
export type ForgeAnswerNotUnderstoodReason = 'no-json' | 'other-answer-version' | 'malformed';

export type ForgeProgramVerdict<Answer> =
  | { readonly verdict: 'done'; readonly answer: Answer }
  /** The forge's code and its sentence, unchanged. */
  | { readonly verdict: 'refused'; readonly refusal: string; readonly text: string }
  /** `program` is the path that was tried, `null` when neither the registry nor the settings name a program. */
  | { readonly verdict: 'program-not-found'; readonly program: string | null }
  | { readonly verdict: 'root-missing'; readonly root: string }
  | { readonly verdict: 'timed-out' }
  | { readonly verdict: 'answer-not-understood'; readonly reason: ForgeAnswerNotUnderstoodReason; readonly exitCode: number };
