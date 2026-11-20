/** The by-hand epic kinds: an epic's title or description edited, or the epic removed, by User outside a job. */
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';

/** The answer carries the epic's rollup as this hold left it, which the verb prints beside the epic. */
function editEpic(command: CommandOf<'epic-edit'>, change: BoardTransaction) {
  const { title, body } = command;
  const result = change.board.editEpic(command.key, {
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
  }, change.at);
  return { ...result, rollup: change.board.epicRollupOf(result.epic) };
}

export const EPIC_BY_HAND_CONTROLS = {
  'epic-edit':   editEpic,
  'epic-remove': (command: CommandOf<'epic-remove'>, change: BoardTransaction) => change.board.removeEpic(command.key, change.at),
} as const;
