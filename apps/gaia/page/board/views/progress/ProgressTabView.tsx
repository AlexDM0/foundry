/**
 * The Progress tab as the board draws it: the chart, then the finished-work card under it, both read at the board's moment and through
 * the finished-work window the shell provides.
 */
import type { BoardTabViewProps } from '../../shell/BoardTabViews.tsx';
import { useFinishedWorkWindow }  from '../../shell/FinishedWorkWindow.ts';
import { TimeUtil }               from '../../utils/TimeUtil.ts';
import { FinishedWorkView }       from '../finished-work/FinishedWorkView.tsx';
import { ProgressView }           from './ProgressView.tsx';

export function ProgressTabView({ board, boardStore }: BoardTabViewProps) {
  const { choice, nowEpochMilliseconds } = useFinishedWorkWindow();
  return (
    <>
      <ProgressView
        board={board}
        boardStore={boardStore}
        nowEpochMilliseconds={nowEpochMilliseconds}
        todayCalendarDate={TimeUtil.calendarDateOf(nowEpochMilliseconds)}
      />
      <FinishedWorkView tickets={board.page.tickets} choice={choice} nowEpochMilliseconds={nowEpochMilliseconds} />
    </>
  );
}
