/** `pause [--json]`: stores `hephaestusState` `paused`, so no new job starts; it works with Hephaestus up or down. */
import type { ControlCommandOf } from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }         from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }    from '../ApplyCommandOfVerb.ts';
import type { CommandHandler }   from '../CommandHandler.ts';
import { hatchWhenUnderJob }     from '../HatchUnderJob.ts';
import { OutputUtil }            from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} pause [--json]`;

export const pauseCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const command: ControlCommandOf<'hephaestus-pause'> = { kind: 'hephaestus-pause' };
  await hatchWhenUnderJob(context, command);
  const { logged, previousState } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  OutputUtil.printEntity(commandArguments, context, { hephaestusState: 'paused', previousState }, `${OutputUtil.loggedSentencesOf(logged)} (was ${previousState}).`);
};
