/**
 * `question options <J> -- <json>` keeps an agent's notes for the options of the question it asks next on its job: what each option
 * touches, its trade-off and its effect on the Acceptance. The decision the question opens takes them. Under the asking job it names no
 * job: the Overseer stamps it.
 */
import type { QuestionOptionNotes } from '../../src/lib/tracker-model/@types/OptionConsequences.ts';
import { OptionConsequencesUtil }   from '../../src/lib/tracker-model/utils/OptionConsequencesUtil.ts';
import { ControlService }           from '../../src/services/control/ControlService.ts';
import type { ControlCommandOf }    from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }         from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }            from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }      from '../CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }  from '../CommandControlContext.ts';
import type { CommandHandler }      from '../CommandHandler.ts';
import { hatchWhenUnderJob }        from '../HatchUnderJob.ts';
import { openTrackerForWriting }    from '../OpenTrackerForWriting.ts';
import { jobIdOf, refuseUsage }     from '../RecordedIncidentMove.ts';
import type { ArgumentParser }      from '../arguments/ArgumentParser.ts';
import { OutputUtil }               from '../utils/OutputUtil.ts';

const OPTIONS_USAGE = `${PRODUCT_NAMES.PROGRAM} question options <J> -- <json> [--json]`;

const JSON_EXAMPLE = '{"question": "<the question>", "options": [{"label": "<label>", "touches": ["<path>"], "tradeOff": "<text>", "acceptanceEffect": "<text>"}]}';

function parsedJsonAfter(commandArguments: ArgumentParser, positionalsBeforeJson: number): unknown {
  if (commandArguments.positionalsBeforeSeparator().length > positionalsBeforeJson) refuseUsage(`Write the notes as JSON after --: ${JSON_EXAMPLE}.`, OPTIONS_USAGE);
  const written = commandArguments.positionals().slice(positionalsBeforeJson).join(' ').trim();
  try {
    return JSON.parse(written);
  } catch {
    return refuseUsage(`The notes after -- are not JSON. Write them as ${JSON_EXAMPLE}.`, OPTIONS_USAGE);
  }
}

/** Read here as the Board reads them, so a session sees a malformed note at once rather than in a reply that may come late. */
function notesOf(parsed: unknown, jobId: string): QuestionOptionNotes {
  const reading = OptionConsequencesUtil.notesReadingOf(parsed);
  if (reading.verdict === 'read') return reading.notes;
  throw new OperationRefusal('refused', {
    kind:         'board-refusal',
    boardRefusal: {
      reason: 'question-options-malformed', jobId, field: reading.field, problem: reading.problem
    }
  });
}

async function noteOptions(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  if (context.job !== undefined) {
    const { question, options } = notesOf(parsedJsonAfter(commandArguments, 1), context.job.jobId);
    await hatchWhenUnderJob(context, { kind: 'question-options', question, options });
    return;
  }
  const jobId                 = jobIdOf(commandArguments.positionalsBeforeSeparator()[1], OPTIONS_USAGE);
  const { question, options } = notesOf(parsedJsonAfter(commandArguments, 2), jobId);
  const command: ControlCommandOf<'question-options'> = {
    kind: 'question-options', jobId, question, options
  };
  await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result);
  OutputUtil.printEntity(commandArguments, context, { jobId, question, options }, `Job ${jobId} keeps the option notes for its question "${question}".`);
}

export const questionCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], OPTIONS_USAGE);
  const subcommand = commandArguments.positionalsBeforeSeparator()[0];
  if (subcommand !== 'options') refuseUsage('Name the subcommand: question options.', OPTIONS_USAGE);
  await noteOptions(commandArguments, context);
};

export const QUESTION_SUBCOMMAND_NAMES: readonly string[] = Object.freeze(['options']);
