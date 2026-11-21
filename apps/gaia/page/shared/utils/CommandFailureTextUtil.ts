/**
 * Who refused, the code and the sentence a refusal shows for a command that did not succeed: the forge's as Gaia's server answered them when
 * it refused, and Gaia's own for the outcome when the answer carries no sentence or nothing answered.
 */
import type { CommandKind, CommandOutcome } from '../../@types/CommandDocument.ts';
import type { CommandFailure }              from '../../api/CommandSender.ts';
import type { RefusedBy }                   from '../../components/Refusal.tsx';

export interface RefusalText {
  readonly refusedBy: RefusedBy;
  readonly code:      string;
  readonly sentence:  string;
}

/** Commands Gaia carries out itself, asking no forge; every other command's refusal is a forge's. */
const COMMANDS_GAIA_CARRIES_ITSELF: ReadonlySet<CommandKind> = new Set<CommandKind>(['settings-set', 'path-choose', 'fleet-look-again']);

const OUTCOME_SENTENCES: Readonly<Record<CommandOutcome, string>> = {
  'done':            'The command was carried out.',
  'nothing-to-do':   'There was nothing to do.',
  'restart-pending': 'The forge was updated, and its Hephaestus runs the old code until it restarts.',
  'refused':         'The command was refused.',
  'unreachable':     'The forge\'s Hephaestus did not answer.',
  'not-supported':   'This forge does not take this command from Gaia.',
};

function refusalTextOf(failure: CommandFailure): RefusalText {
  const { result } = failure;
  switch (result.verdict) {
    case 'answered':
      return {
        refusedBy: result.answer.outcome === 'refused' && !COMMANDS_GAIA_CARRIES_ITSELF.has(failure.kind) ? 'forge' : 'gaia',
        code:      result.answer.refusal ?? result.answer.outcome,
        sentence:  result.answer.text ?? OUTCOME_SENTENCES[result.answer.outcome],
      };
    case 'server-unreachable':
      return { refusedBy: 'gaia', code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.' };
    case 'answer-not-understood':
      return { refusedBy: 'gaia', code: 'answer-not-understood', sentence: 'Gaia\'s server gave an answer this page does not understand.' };
    case 'session-lost':
      return { refusedBy: 'gaia', code: 'session-lost', sentence: 'Gaia\'s server no longer knows this window.' };
  }
}

export const CommandFailureTextUtil = { refusalTextOf } as const;
