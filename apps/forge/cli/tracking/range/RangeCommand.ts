/**
 * `range` builds a `chart-range-set` command from its options and applies it in a hold of its own, as the Bridge's control does; the
 * bounds are read and judged by the control, the usage and the tick here.
 */
import { LocalTimeUtil }                            from '../../../src/lib/local-time/LocalTimeUtil.ts';
import { ControlService }                           from '../../../src/services/control/ControlService.ts';
import type { ChartRangeRequest, ControlCommandOf } from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                         from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                            from '../../../src/shared/constants/ProductNames.ts';
import { commandControlContextOf }                  from '../../CommandControlContext.ts';
import type { CommandHandler }                      from '../../CommandHandler.ts';
import { openTrackerForWriting }                    from '../../OpenTrackerForWriting.ts';
import { OutputUtil }                               from '../../utils/OutputUtil.ts';

const USAGE = [
  '--from <iso|-2h|start> --to <iso|now|+30m> [--tick 15m|1h|1d]',
  '--auto',
].map((usage) => `${PRODUCT_NAMES.PROGRAM} range ${usage}`).join('\n         ');

const KNOWN_OPTION_NAMES = ['from', 'to', 'tick', 'auto', 'json'];

function tickMinutesOf(writtenTick: string | undefined): number | null {
  if (writtenTick === undefined) return null;
  const tickMinutes = LocalTimeUtil.parseDurationMinutes(writtenTick);
  if (tickMinutes === null) {
    throw new OperationRefusal('refused', `--tick "${writtenTick}" is not a duration. Write it as \`15m\`, \`1h\`, \`1d\`, or a whole number of minutes.`);
  }
  return tickMinutes;
}

export const rangeCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const resetsToAutomatic = commandArguments.flag('auto');
  const writtenFrom       = commandArguments.option('from');
  const writtenTo         = commandArguments.option('to');
  const writtenTick       = commandArguments.option('tick');

  if (resetsToAutomatic && (writtenFrom !== undefined || writtenTo !== undefined || writtenTick !== undefined)) {
    throw new OperationRefusal('refused', `--auto sets the axis on its own, tick included; drop --from, --to and --tick.\n  Usage: ${USAGE}`);
  }
  if (!resetsToAutomatic && (writtenFrom === undefined || writtenTo === undefined)) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} range needs either --auto or both --from and --to.\n  Usage: ${USAGE}`);
  }

  const range: ChartRangeRequest = resetsToAutomatic || writtenFrom === undefined || writtenTo === undefined
    ? { kind: 'automatic' }
    : {
      kind: 'window', from: writtenFrom, to: writtenTo, tickMinutes: tickMinutesOf(writtenTick)
    };
  const command: ControlCommandOf<'chart-range-set'> = { kind: 'chart-range-set', range };
  const { view, logged } = await openTrackerForWriting(
    commandArguments,
    context,
    (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result,
  );

  OutputUtil.printEntity(commandArguments, context, view, OutputUtil.loggedSentencesOf(logged));
};
