/**
 * The code and the sentence a refusal shows for a command that did not succeed: the forge's as Gaia's server answered them when it refused,
 * and Gaia's own for the outcome when the answer carries no sentence or nothing answered.
 */
import type { CommandOutcome } from '../../@types/CommandDocument.ts';
import type { CommandFailure } from '../../api/CommandSender.ts';

export interface RefusalText {
  readonly code:     string;
  readonly sentence: string;
}

const OUTCOME_SENTENCES: Readonly<Record<CommandOutcome, string>> = {
  'done':            'The command was carried out.',
  'nothing-to-do':   'There was nothing to do.',
  'restart-pending': 'The forge was updated, and its Overseer runs the old code until it restarts.',
  'refused':         'The command was refused.',
  'unreachable':     'The forge\'s Overseer did not answer.',
  'not-supported':   'This forge does not take this command from Gaia.',
};

function refusalTextOf(failure: CommandFailure): RefusalText {
  const { result } = failure;
  switch (result.verdict) {
    case 'answered':
      return { code: result.answer.refusal ?? result.answer.outcome, sentence: result.answer.text ?? OUTCOME_SENTENCES[result.answer.outcome] };
    case 'server-unreachable':
      return { code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.' };
    case 'answer-not-understood':
      return { code: 'answer-not-understood', sentence: 'Gaia\'s server gave an answer this page does not understand.' };
  }
}

export const CommandFailureTextUtil = { refusalTextOf } as const;
