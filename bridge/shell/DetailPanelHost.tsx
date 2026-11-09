/**
 * The one detail panel of the board tabs, mounted by the shell over Kanban, Waves, Progress, Epics and Tickets while the route names a
 * detail: it closes on Esc and hands the panel what it shows. Each detail form reaches the panel as the ticket it shows.
 */
import { useEffect } from 'react';

import type { BoardStateDocument } from '../@types/BoardStateDocument.ts';
import { DetailPanel }             from '../views/detail-panel/DetailPanel.tsx';
import { TicketsModel }            from '../views/tickets/TicketsModel.ts';
import type { DetailItem }         from './DetailRoute.ts';
import { useDetailRouting }        from './DetailRouting.ts';

export interface DetailPanelHostProps {
  readonly boardState:        BoardStateDocument;
  readonly item:              DetailItem;
  readonly todayCalendarDate: string;
}

/** The ticket a detail shows: a row's own ticket, else the one it reviews, else the row's id, which the panel then names as not found. */
function ticketIdOf(item: DetailItem, boardState: BoardStateDocument): string {
  switch (item.form) {
    case 'ticket':
    case 'ticket-row':
      return item.ticketId;
    case 'task-row': {
      const task = boardState.page?.payload.progress.tasks.find((candidate) => candidate.id === item.taskId);
      return task?.ticket ?? task?.reviewOf ?? String(item.taskId);
    }
    case 'draft':
      return item.draftId;
    default:
      return '';
  }
}

export function DetailPanelHost({ boardState, item, todayCalendarDate }: DetailPanelHostProps) {
  const routing = useDetailRouting();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) routing.close();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [routing]);
  const ticketsBoardState = TicketsModel.ticketsBoardStateOf(boardState);
  if (ticketsBoardState === null) return null;
  return <DetailPanel boardState={ticketsBoardState} ticketId={ticketIdOf(item, boardState)} todayCalendarDate={todayCalendarDate} tab={routing.tab} />;
}
