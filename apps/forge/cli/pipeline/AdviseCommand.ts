/**
 * `advise` opens an advise record on the stored pipeline and records its pipeline agent job, which Hephaestus launches on a main-line
 * snapshot to propose edits of the record's draft.
 */
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }  from '../ApplyCommandOfVerb.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import { hatchWhenUnderJob }   from '../HatchUnderJob.ts';
import { OutputUtil }          from '../utils/OutputUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;

const ADVISE_USAGE = `${PROGRAM} advise [--json]`;

export const adviseCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], ADVISE_USAGE);
  commandArguments.rejectExtraPositionals(1, ADVISE_USAGE);
  const command = { kind: 'pipeline-agent-advise' } as const;
  await hatchWhenUnderJob(context, command);
  const { setup, logged } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  const jobId = setup.agentJobId ?? '';
  OutputUtil.printEntity(commandArguments, context, { setupId: setup.setupId, jobId, logged }, OutputUtil.loggedSentencesOf(logged));
  context.standardError(`Hephaestus launches the pipeline agent of job ${jobId} for pipeline setup ${setup.setupId}; follow it with `
    + `\`${PROGRAM} job attach ${jobId}\`.`);
};
