/**
 * Every status has its own verb, so a refusal's subcommand reaches exactly one status, and every wording stays byte for byte what the command
 * line printed: frozen at 9c7a8e2 from `src/shared/constants/StatusVerbs.ts`, `cli/task/TaskCommand.ts` and `src/adapters/utils/LogUtil.ts`,
 * and at 75548d8 from `cli/tickets/TicketReading.ts` and `cli/tracking/status/StatusCommand.ts`.
 */
import { expect, test } from 'bun:test';

import type { TaskStatus }                from '../../lib/tracker-model/@types/Task.ts';
import { TASK_STATUSES, TICKET_STATUSES } from '../../lib/tracker-model/constants/Statuses.ts';
import type { MovedToStatus }             from './StatusWordingUtil.ts';
import { StatusWordingUtil }              from './StatusWordingUtil.ts';

const EXPECTED_VERB_FOR_STATUS: Readonly<Record<TaskStatus, string>> = Object.freeze({
  'committed':   'reopen',
  'in-progress': 'start',
  'paused':      'pause',
  'in-review':   'finish',
  're-review':   'rereview',
  'reviewed':    'approve',
  'delivered':   'deliver',
  'abandoned':   'abandon',
});

const EXPECTED_MOVED_PHRASE_FOR_STATUS: Readonly<Record<MovedToStatus, string>> = Object.freeze({
  'committed':   'reopened',
  'in-progress': 'started',
  'paused':      'paused',
  'in-review':   'in review',
  're-review':   'under review again',
  'reviewed':    'reviewed',
  'delivered':   'delivered',
});

test('every row status and every ticket status has a lowercase verb', () => {
  expect(TASK_STATUSES.length, 'the statuses were enumerated').toBeGreaterThan(5);
  const rowedTicketStatuses = TICKET_STATUSES.filter((candidate) => candidate !== 'draft' && candidate !== 'ready-for-review');
  for (const status of [...TASK_STATUSES, ...rowedTicketStatuses]) expect(StatusWordingUtil.verbFor(status), status).toMatch(/^[a-z]+$/);
});

test('no two statuses share a verb, so a verb names exactly one status', () => {
  const verbs = TASK_STATUSES.map((status) => StatusWordingUtil.verbFor(status));
  expect(new Set(verbs).size).toBe(TASK_STATUSES.length);
});

test('each status is worded as the verb it has always been', () => {
  expect(Object.keys(EXPECTED_VERB_FOR_STATUS).sort()).toEqual([...TASK_STATUSES].sort());
  for (const status of TASK_STATUSES) expect(StatusWordingUtil.verbFor(status), status).toBe(EXPECTED_VERB_FOR_STATUS[status]);
});

test('each status a move reaches is worded as the phrase it has always been', () => {
  const movedToStatuses = TASK_STATUSES.filter((status): status is MovedToStatus => status !== 'abandoned');
  expect(Object.keys(EXPECTED_MOVED_PHRASE_FOR_STATUS).sort()).toEqual([...movedToStatuses].sort());
  for (const status of movedToStatuses) expect(StatusWordingUtil.movedPhraseFor(status), status).toBe(EXPECTED_MOVED_PHRASE_FOR_STATUS[status]);
});

test('a draft ticket is worded as "a draft ticket", so a sentence never calls a filing draft and a ticket the same, and every other status as its value', () => {
  expect(StatusWordingUtil.statusTextFor('draft')).toBe('a draft ticket');
  for (const status of TASK_STATUSES) expect(StatusWordingUtil.statusTextFor(status), status).toBe(status);
});
