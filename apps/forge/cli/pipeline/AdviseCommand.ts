/**
 * `advise` opens an advise record on the stored pipeline and records its pipeline agent job, which the Overseer launches on a main-line
 * snapshot to propose edits of the record's draft.
 */
import { ControlService }          from '../../src/services/control/ControlService.ts';
import { PRODUCT_NAMES }           from '../../src/shared/constants/ProductNames.ts';
import { commandControlContextOf } from '../CommandControlContext.ts';
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
  const { setup, logged } = await openTrackerForWriting(
    commandArguments,
    context,
    (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result,
  );
  const jobId = setup.agentJobId ?? '';
  OutputUtil.printEntity(commandArguments, context, { setupId: setup.setupId, jobId, logged }, OutputUtil.loggedSentencesOf(logged));
  context.standardError(`The Overseer launches the pipeline agent of job ${jobId} for pipeline setup ${setup.setupId}; follow it with `
    + `\`${PROGRAM} job attach ${jobId}\`.`);
};
