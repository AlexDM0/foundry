/** `unpause [--json]`: undoes a pause by storing `hephaestusState` `running`; `resume` is the other verb, which restarts interrupted work. */
import type { ControlCommandOf } from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }         from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }    from '../ApplyCommandOfVerb.ts';
import type { CommandHandler }   from '../CommandHandler.ts';
import { hatchWhenUnderJob }     from '../HatchUnderJob.ts';
import { OutputUtil }            from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} unpause [--json]`;

export const unpauseCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const command: ControlCommandOf<'hephaestus-unpause'> = { kind: 'hephaestus-unpause' };
  await hatchWhenUnderJob(context, command);
  const { logged, previousState } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  OutputUtil.printEntity(commandArguments, context, { hephaestusState: 'running', previousState }, `${OutputUtil.loggedSentencesOf(logged)} (was ${previousState}).`);
};
