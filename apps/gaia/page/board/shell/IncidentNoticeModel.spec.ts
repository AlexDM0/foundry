/**
 * The incident line and its drawer. What matters: the line is one sentence however many defaults, counting every default noticed since
 * the forge started and naming the last notice, never comparing stamps; an escalation is never a default; a seen list hides the line
 * until a new default, which brings it back counting all of them; "Mark defaults seen" stores exactly the defaults noticed now, so ids of
 * an earlier forge run drop out; the wording is singular for one and leaves out the open clause with none open; open incidents alone
 * raise no line; names come from the log, so a notice the log does not hold yet gives a row and a sentence without its tickets or stamp,
 * never a throw; the drawer lists open incidents in board order, saying what an undelivered one waits for, and defaults newest first, each
 * with its trail, the applied default marked, each default's cause in the words of the notice the forge serves for it; and the stamp
 * slices are the board's limits.
 */
import { describe, expect, test } from 'bun:test';

import {
  EXAMPLE_INCIDENT_DAY,
  EXAMPLE_INCIDENT_SLICES,
  exampleIncidentBoard,
  exampleIncidentDefault,
  exampleOpenIncident,
  incidentRecordOf
} from '../testing/IncidentNoticeFixture.ts';
import {
  IncidentNoticeModelUtil,
  type IncidentMetaPart,
  type IncidentNoticeBoard,
  type NoticeStampFormat
} from './IncidentNoticeModel.ts';

const FORMAT: NoticeStampFormat = { todayCalendarDate: EXAMPLE_INCIDENT_DAY, slices: EXAMPLE_INCIDENT_SLICES };

const BOARD = exampleIncidentBoard();

function modelOf(board: IncidentNoticeBoard, seen: readonly string[] = []) {
  return IncidentNoticeModelUtil.incidentNoticeModelOf(board, seen, FORMAT);
}

function metaText(parts: readonly IncidentMetaPart[]): string {
  return parts.map((part) => (part.kind === 'text' ? part.text : part.jobId)).join('');
}

const FIFTH_DEFAULT = exampleIncidentDefault({
  incidentId: 'I7', kind: 'quiet-job', ticketIds: ['012'], move: 'open-quiet-job-decision', cause: 'turn-closed', openedAt: '22:44', defaultAt: '22:50'
});

describe('the incident line', () => {
  test('four defaults and two open incidents are one sentence naming the last notice, its move, its ticket and its clock', () => {
    expect(modelOf(BOARD).banner).toEqual({
      leadText: '4 incident defaults, 2 open incidents.',
      newest:   {
        incidentId: 'I4', move: 'job-fresh', ticketIds: ['001'], at: { shortText: '22:40', fullText: '2026-10-29 22:40' }
      },
    });
  });

  test('an escalation is never counted as a default', () => {
    const escalated = {
      ...BOARD,
      questionHistory: [...BOARD.questionHistory, incidentRecordOf('incident-escalated', '2026-10-29T22:45:00+01:00', 'I5', { decisionId: 'E1' })],
    };
    expect(modelOf(escalated).banner?.leadText).toBe('4 incident defaults, 2 open incidents.');
    expect(modelOf(escalated).drawer.defaultedRows.map((row) => row.incidentId)).toEqual(['I4', 'I3', 'I2', 'I1']);
  });

  test('every default seen hides the line; a new notice brings it back, counting all five and naming the new one', () => {
    expect(modelOf(BOARD, ['I1', 'I2', 'I3', 'I4']).banner).toBeNull();
    const withFifth = {
      ...BOARD,
      notices:         [...BOARD.notices, FIFTH_DEFAULT.notice],
      questionHistory: [...BOARD.questionHistory, ...FIFTH_DEFAULT.history],
    };
    const model = modelOf(withFifth, ['I1', 'I2', 'I3', 'I4']);
    expect(model.banner?.leadText).toBe('5 incident defaults, 2 open incidents.');
    expect(model.banner?.newest.incidentId).toBe('I7');
    expect(model.drawer.defaultedRows.map((row) => [row.incidentId, row.unseen])).toEqual([['I7', true], ['I4', false], ['I3', false], ['I2', false], ['I1', false]]);
  });

  test('marking seen stores exactly the defaults noticed now, dropping ids of an earlier forge run', () => {
    expect(IncidentNoticeModelUtil.seenIdsAfterMarking(BOARD)).toEqual(['I1', 'I2', 'I3', 'I4']);
    expect(modelOf(BOARD, ['I0', ...IncidentNoticeModelUtil.seenIdsAfterMarking(BOARD)]).banner).toBeNull();
  });

  test('one default and one open incident read singular; none open leaves the open clause out', () => {
    const [firstDefault] = BOARD.notices;
    const single = { ...BOARD, notices: firstDefault === undefined ? [] : [firstDefault], incidents: BOARD.incidents.slice(0, 1) };
    expect(modelOf(single).banner?.leadText).toBe('1 incident default, 1 open incident.');
    expect(modelOf(single).drawer.summaryText).toBe('1 open · 1 default applied');
    expect(modelOf({ ...single, incidents: [] }).banner?.leadText).toBe('1 incident default.');
  });

  test('open incidents alone raise no line', () => {
    expect(modelOf({ ...BOARD, notices: [] }).banner).toBeNull();
  });

  test('a notice the log does not hold yet still makes a row and a sentence, with no tickets and no stamp', () => {
    const unlogged = { ...BOARD, notices: [...BOARD.notices, FIFTH_DEFAULT.notice] };
    const model = modelOf(unlogged);
    expect(model.banner?.newest).toEqual({
      incidentId: 'I7', move: 'open-quiet-job-decision', ticketIds: [], at: null
    });
    const [row] = model.drawer.defaultedRows;
    expect(row?.kind).toBe('');
    expect(row?.trail).toEqual([]);
    expect(metaText(row?.meta ?? [])).toBe('open-quiet-job-decision: its delivery turn closed');
  });
});

describe('the drawer', () => {
  test('sums up, lists the open incidents in board order and the defaults newest first', () => {
    const { drawer } = modelOf(BOARD);
    expect(drawer.summaryText).toBe('2 open · 4 defaults applied');
    expect(drawer.openRows.map((row) => [row.incidentId, row.kind, row.pill.label])).toEqual([
      ['I5', 'system-question', 'delivered'],
      ['I6', 'sandbox-unavailable', 'waiting for the Assistant'],
    ]);
    expect(drawer.defaultedRows.map((row) => [row.incidentId, row.kind, row.pill.label, metaText(row.meta)])).toEqual([
      ['I4', 'resume-failed', 'defaulted', '22:40 · job-fresh: its delivery turn closed'],
      ['I3', 'gate-cannot-run', 'defaulted', '22:30 · gate-retry: no Assistant was up'],
      ['I2', 'setup-failed', 'defaulted', '22:21 · worktree-repair: its delivery turn closed'],
      ['I1', 'gate-cannot-run', 'defaulted', '22:16 · gate-retry: its delivery turn closed'],
    ]);
  });

  test('an open incident says when it opened, its default, and the chat it went out in or the Assistant turn it waits for', () => {
    const { drawer } = modelOf(BOARD);
    expect(drawer.openRows.map((row) => metaText(row.meta))).toEqual([
      'opened 22:38 · default incident-escalate · with J1, chat 14',
      'opened 22:42 · default gate-retry · waits for J1\'s next turn',
    ]);
    expect(drawer.openRows[1]?.meta).toContainEqual({ kind: 'job', jobId: 'J1' });
    const noAssistant = modelOf({ ...BOARD, jobs: [] });
    expect(metaText(noAssistant.drawer.openRows[1]?.meta ?? [])).toBe('opened 22:42 · default gate-retry · waits for a fresh Assistant');
  });

  test('a default\'s trail lists its steps in order with their clocks, the applied default alone marked', () => {
    const [newest] = modelOf(BOARD).drawer.defaultedRows;
    expect(newest?.trail.map((line) => [line.at?.shortText, line.step.text, line.alert])).toEqual([
      ['22:33', 'opened: resume-failed on #001', false],
      ['22:40', 'default applied: job-fresh, as its delivery turn closed', true],
    ]);
  });

  test('an incident from another day shows its month and day before the clock', () => {
    const lastYear = exampleOpenIncident('I8', { openedClock: '09:00' });
    const board = { ...BOARD, incidents: [{ ...lastYear.incident, openedAt: '2026-10-28T09:00:00+01:00' }] };
    expect(metaText(modelOf(board).drawer.openRows[0]?.meta ?? [])).toStartWith('opened 10-28 09:00 · ');
  });

  test('without stamp limits no clock is shown', () => {
    const model = IncidentNoticeModelUtil.incidentNoticeModelOf(BOARD, [], null);
    expect(model.banner?.newest.at).toBeNull();
    expect(metaText(model.drawer.defaultedRows[0]?.meta ?? [])).toBe('job-fresh: its delivery turn closed');
  });
});

describe('a default\'s cause', () => {
  test('reads in the words of the notice the forge serves for it, and as recorded where the forge words none', () => {
    const [firstDefault] = BOARD.notices;
    if (firstDefault === undefined) throw new Error('the incident board serves notices');
    const worded = { ...BOARD, notices: [{ ...firstDefault, causeText: 'Example: the forge\'s own cause sentence' }] };
    expect(metaText(modelOf(worded).drawer.defaultedRows[0]?.meta ?? [])).toBe('22:16 · gate-retry: Example: the forge\'s own cause sentence');
    const unworded = { ...BOARD, notices: [{ ...firstDefault, causeText: null }] };
    expect(metaText(modelOf(unworded).drawer.defaultedRows[0]?.meta ?? [])).toBe('22:16 · gate-retry: turn-closed');
  });
});
