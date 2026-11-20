import type { ControlCommandOf } from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }         from '../../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }    from '../../ApplyCommandOfVerb.ts';
import type { CommandHandler }   from '../../CommandHandler.ts';
import { OutputUtil }            from '../../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} log "<text>" [--at <when>]`;

const KNOWN_OPTION_NAMES = ['at', 'json'];

export const logCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);

  // Joined from every positional, so an unquoted sentence is recorded whole rather than truncated to its first word.
  const text = commandArguments.joinedPositionalsFrom(0);
  if (text === undefined || text.trim() === '') {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} log needs something to record.\n  Usage: ${USAGE}`);
  }

  const command: ControlCommandOf<'log-note'> = { kind: 'log-note', text };
  const entry = (await applyCommandOfVerb(commandArguments, context, command)).result;

  OutputUtil.printEntity(commandArguments, context, entry, `Logged: ${entry.text}`);
};
