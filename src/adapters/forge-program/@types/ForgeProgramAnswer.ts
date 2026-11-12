/** The forge program's JSON answers (F8) mapped in, one per verb, and the verdict every run of the program ends in. */
import type { ForgeContracts } from '../../../shared/@types/ForgeReading.ts';

export type ForgeProgramOutcome = 'done' | 'nothing-to-do';

/** `started` is `false` when an Overseer was already live and the program started nothing. */
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

export interface ForgeInitAnswer {
  readonly outcome:   ForgeProgramOutcome;
  readonly trackerId: string;
  readonly project:   string;
  readonly root:      string;
}

export type ForgeBatonPass =
  | { readonly outcome: 'done' }
  | { readonly outcome: 'not-needed' }
  | { readonly outcome: 'failed'; readonly failedStep: string };

export interface ForgeUpdateAnswer {
  readonly outcome:        ForgeProgramOutcome;
  readonly installVersion: number;
  readonly batonPass:      ForgeBatonPass;
}

export interface ForgeVersionAnswer {
  readonly codeVersion:    string;
  readonly installVersion: number;
  readonly contracts:      ForgeContracts;
  readonly monitorFolder:  string;
}

export type ForgeLoginItemAction = 'add' | 'remove' | 'status';

/** Whether the repository's login item is in place after the verb. */
export interface ForgeLoginItemAnswer {
  readonly loginItem: 'present' | 'absent';
}

export interface ForgeMachineLimitAnswer {
  readonly outcome:    ForgeProgramOutcome;
  readonly agentLimit: number;
}

/** `forge open` runs detached and Gaia does not wait for its end, so its answer is the process it started. */
export interface ForgeOpenAnswer {
  readonly processId: number;
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
