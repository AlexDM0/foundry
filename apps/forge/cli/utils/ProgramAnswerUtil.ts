/**
 * The versioned JSON answers of the verbs a program outside the board runs, such as one that monitors several boards: each one document on
 * standard output carrying `answerVersion`, and a refusal under `--json` as `{answerVersion, refusal, text}`, the refusal's code and its API
 * sentence, which names no command line, since that program shows it to User as it is.
 */
import { OperationRefusalWordingUtil }         from '../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { reasonCodeOf, type OperationRefusal } from '../../src/shared/OperationRefusal.ts';
import { JsonTextUtil }                        from '../../src/shared/utils/JsonTextUtil.ts';
import type { CommandContext }                 from '../CommandContext.ts';
import type { ArgumentParser }                 from '../arguments/ArgumentParser.ts';

export const ANSWER_VERSION = 2;

/** The verbs whose `--json` output is a versioned answer, a refusal included; `machine` and `login-item` with their subcommand. */
export const VERBS_THAT_ANSWER_IN_VERSIONED_JSON: ReadonlySet<string> = new Set(['start', 'stop', 'init', 'update', 'version', 'machine', 'login-item']);

/** A refusal built from words carries no code of its own: the verb's arguments were refused. */
const ARGUMENTS_REFUSED_CODE = 'arguments-refused';

function answerOf(entity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { answerVersion: ANSWER_VERSION, ...entity };
}

function printAnswer(commandArguments: ArgumentParser, context: CommandContext, entity: Readonly<Record<string, unknown>>, humanLine: string): void {
  if (commandArguments.flag('json')) {
    context.standardOutput(JsonTextUtil.indentedTextOf(answerOf(entity)));
    return;
  }
  context.standardOutput(humanLine);
}

function refusalAnswerTextOf(refusal: OperationRefusal): string {
  const refusalCode = refusal.detail === null ? ARGUMENTS_REFUSED_CODE : reasonCodeOf(refusal.detail);
  // `update`'s answer names how its Baton pass went, also when the pass failed and the refusal is the answer.
  const batonPassFacts = refusal.detail?.kind === 'baton-pass-failed' ? { batonPass: 'failed', batonPassStep: refusal.detail.step } : {};
  return JsonTextUtil.indentedTextOf({
    answerVersion: ANSWER_VERSION, refusal: refusalCode, text: OperationRefusalWordingUtil.apiMessageOf(refusal), ...batonPassFacts
  });
}

export const ProgramAnswerUtil = { answerOf, printAnswer, refusalAnswerTextOf } as const;
