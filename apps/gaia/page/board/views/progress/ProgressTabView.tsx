/** The Progress tab's Gantt as the board draws it, read at the board's moment; the finished tickets are Tickets' Finished segment. */
import type { BoardTabViewProps } from '../../shell/BoardTabViews.tsx';
import { useFinishedWorkWindow }  from '../../shell/FinishedWorkWindow.ts';
import { TimeUtil }               from '../../utils/TimeUtil.ts';
import { ProgressView }           from './ProgressView.tsx';

export function ProgressTabView({ board, boardStore }: BoardTabViewProps) {
  const { nowEpochMilliseconds } = useFinishedWorkWindow();
  return (
    <ProgressView
      board={board}
      boardStore={boardStore}
      nowEpochMilliseconds={nowEpochMilliseconds}
      todayCalendarDate={TimeUtil.calendarDateOf(nowEpochMilliseconds)}
    />
  );
}
