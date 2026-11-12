/** `pipeline answer <S> <Q>`: User's answer to a setup question, option letters or free text after `--`; answering again replaces it. */
import type { DecisionAnswerForm }                    from '../../src/lib/tracker-model/@types/Decision.ts';
import type { CommandContext }                        from '../CommandContext.ts';
import { refuseUsage }                                from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                        from '../arguments/ArgumentParser.ts';
import { applySetupCommand, questionIdOf, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                             from './constants/PipelineUsage.ts';

const OPTION_LETTERS_PATTERN = /^[a-z]+$/;

/** The words a setup and a question id take before the letters. */
const POSITIONALS_BEFORE_THE_LETTERS = 3;

function answerFormOf(letters: readonly string[], text: string, usage: string): DecisionAnswerForm {
  if (letters.length > 0 && text !== '') refuseUsage('Answer with option letters or with free text after --, not both.', usage);
  if (text !== '') return { form: 'text', text };
  if (letters.length === 0) refuseUsage('Name the option letters, as a or a c, or give free text after --.', usage);
  const malformed = letters.find((letter) => !OPTION_LETTERS_PATTERN.test(letter));
  if (malformed !== undefined) refuseUsage(`"${malformed}" is not option letters, as b or ac.`, usage);
  return { form: 'letters', choices: letters };
}

export async function answerPipelineQuestion(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.answer;
  commandArguments.rejectUnknownOptions(['json'], usage);
  const beforeSeparator = commandArguments.positionalsBeforeSeparator();
  const [, setupWord, questionWord] = beforeSeparator;
  const letters = beforeSeparator.slice(POSITIONALS_BEFORE_THE_LETTERS);
  const text    = commandArguments.positionals().slice(beforeSeparator.length).join(' ').trim();
  await applySetupCommand(commandArguments, context, {
    kind:       'pipeline-setup-answer',
    setupId:    setupIdOf(setupWord, usage),
    questionId: questionIdOf(questionWord, usage),
    answer:     answerFormOf(letters, text, usage),
  });
}
