/** `advise` records a pipeline agent job on demand, which the Overseer launches on a main-line snapshot to advise on the stored pipeline. */
import { ControlService }          from '../../src/services/control/ControlService.ts';
import { PRODUCT_NAMES }           from '../../src/shared/constants/ProductNames.ts';
import { COMMAND_CONTROL_CONTEXT } from '../CommandControlContext.ts';
import type { CommandHandler }     from '../CommandHandler.ts';
import { hatchWhenUnderJob }       from '../HatchUnderJob.ts';
import { openTrackerForWriting }   from '../OpenTrackerForWriting.ts';
import { OutputUtil }              from '../utils/OutputUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;

const ADVISE_USAGE = `${PROGRAM} advise [--json]`;

export const adviseCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], ADVISE_USAGE);
  commandArguments.rejectExtraPositionals(1, ADVISE_USAGE);
  const command = { kind: 'pipeline-agent-advise' } as const;
  await hatchWhenUnderJob(context, command);
  const { job, logged } = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result);
  OutputUtil.printEntity(commandArguments, context, { jobId: job.id, logged }, OutputUtil.loggedSentencesOf(logged));
  context.standardError(`The Overseer launches the pipeline agent of job ${job.id}; follow it with \`${PROGRAM} job attach ${job.id}\`.`);
};
