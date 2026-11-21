/**
 * Makes the Progress chart the timeline habitat of Flint: a ticket that starts has Flint lay the bar along the last shown bar of its own
 * row, the row found by the `data-task-id` the chart gives it.
 */
import { useMemo, type RefObject } from 'react';

import type { BoardDocument }                      from '../../../@types/board/BoardDocument.ts';
import { useHabitatHappenings }                    from '../../flint/UseHabitatHappenings.ts';
import { TIMELINE_SPRITE_HABITAT }                 from './TimelineSpriteHabitat.ts';
import { TimelineSpriteModel, type TimelineFacts } from './TimelineSpriteModel.ts';

const TASK_ID_ATTRIBUTE = 'data-task-id';
const SHOWN_BAR_SELECTOR = '[data-bar-kind]:not([hidden])';

function shownBarOf(viewElement: HTMLElement, taskId: string): Element | null {
  const row = [...viewElement.querySelectorAll(`[${TASK_ID_ATTRIBUTE}]`)].find((element) => element.getAttribute(TASK_ID_ATTRIBUTE) === taskId);
  return [...row?.querySelectorAll(SHOWN_BAR_SELECTOR) ?? []].at(-1) ?? null;
}

export function useTimelineHabitat(viewElement: RefObject<HTMLElement | null>, board: BoardDocument): void {
  const facts = useMemo<TimelineFacts>(() => ({
    tickets:     board.page.tickets,
    ticketFacts: board.page.facts.tickets,
    tasks:       board.page.progress.tasks,
  }), [board]);
  useHabitatHappenings({
    viewElement,
    habitat:           TIMELINE_SPRITE_HABITAT,
    facts,
    happeningsBetween: TimelineSpriteModel.happeningsBetween,
    elementOf:         shownBarOf,
  });
}
