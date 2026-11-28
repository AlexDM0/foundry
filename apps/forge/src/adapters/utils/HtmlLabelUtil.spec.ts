/**
 * Every priority has a Kanban group title and every mark title stays byte for byte what the page printed before it moved here: frozen
 * from `git show 4ebbb73:page/kanban/KanbanMarkup.ts` and `page/utils/WorkItemMarkupUtil.ts`, the low title since reworded to say done.
 */
import { expect, test } from 'bun:test';

import type { TicketPriority } from '../../domain/tracker-model/@types/Ticket.ts';
import { TICKET_PRIORITIES }   from '../../domain/tracker-model/constants/TicketFields.ts';
import { HtmlLabelUtil }       from './HtmlLabelUtil.ts';

const EXPECTED_GROUP_TITLE_FOR_PRIORITY: Readonly<Record<TicketPriority, string>> = Object.freeze({
  high:   'High',
  normal: 'Normal',
  low:    'Low',
});

const EXPECTED_MARK_TITLE_FOR_PRIORITY: Readonly<Record<'low' | 'high', string>> = Object.freeze({
  low:  'Low priority: no row on the chart until it is started, and ordered last among the ready tickets',
  high: 'High priority: dispatched before every normal ticket',
});

test('each priority is titled as the lane group it has always headed', () => {
  expect(Object.keys(EXPECTED_GROUP_TITLE_FOR_PRIORITY).sort()).toEqual([...TICKET_PRIORITIES].sort());
  for (const priority of TICKET_PRIORITIES) expect(HtmlLabelUtil.priorityGroupTitleOf(priority), priority).toBe(EXPECTED_GROUP_TITLE_FOR_PRIORITY[priority]);
});

test('a low and a high mark carry the titles they have always carried', () => {
  expect(HtmlLabelUtil.priorityMarkTitleOf('low')).toBe(EXPECTED_MARK_TITLE_FOR_PRIORITY.low);
  expect(HtmlLabelUtil.priorityMarkTitleOf('high')).toBe(EXPECTED_MARK_TITLE_FOR_PRIORITY.high);
});
