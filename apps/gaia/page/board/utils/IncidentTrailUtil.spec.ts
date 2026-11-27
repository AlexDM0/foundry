/**
 * The incident trail, read from the board and the log alone: an open incident's opening, delivery and notes; a settled one read back from
 * the log, newest first, ending in its settling record; escalations as decision ids; a default's cause in the forge's notice words; the pill.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardQuestionHistoryEntryDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardNoticeDocument }               from '../../@types/board/BoardFactDocuments.ts';
import type { BoardIncidentDocument }             from '../../@types/board/BoardIncidentDocument.ts';
import { IncidentTrailUtil, type IncidentEntry }  from './IncidentTrailUtil.ts';

const AT = '2026-10-29T20:00:00+01:00';

const LATER = '2026-10-29T20:05:00+01:00';

const OPEN_INCIDENT: BoardIncidentDocument = {
  id: 'I3', kind: 'setup-failed', ticketIds: ['042'], jobId: 'J4', facts: { step: 'install' }, defaultMove: 'worktree-repair', deliveredInTurn: null, openedAt: AT
};

/** The notice the forge serves for `I1`'s default, whose cause sentence the trail shows. */
const NOTICES: readonly BoardNoticeDocument[] = [{
  kind:      'incident-defaulted',
  facts:     { incidentId: 'I1', move: 'merge-abort', cause: 'no-assistant' },
  text:      'incident I1 took its default, merge-abort: no Assistant was up',
  causeText: 'no Assistant was up',
}];

const HISTORY: readonly BoardQuestionHistoryEntryDocument[] = [
  {
    kind: 'incident-opened', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] }
  },
  {
    kind: 'incident-opened', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] }
  },
  {
    kind: 'incident-opened', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I3', fields: { kind: 'setup-failed', ticketIds: ['042'] }
  },
  {
    kind: 'incident-noted', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I2', fields: { text: 'Needs the owner' }
  },
  {
    kind: 'incident-noted', at: LATER, jobId: null, ticketId: null, decisionId: null, incidentId: 'I3', fields: { text: 'The lock file is gone' }
  },
  {
    kind: 'incident-escalated', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I2', fields: { decisionId: 'E5' }
  },
  {
    kind: 'incident-defaulted', at: LATER, jobId: null, ticketId: null, decisionId: null, incidentId: 'I1', fields: { move: 'merge-abort', cause: 'no-assistant' }
  },
];

describe('IncidentTrailUtil.openIncidentEntriesOf', () => {
  test('an undelivered open incident carries its default and facts, is opened with them, then shows its notes, and has no delivery', () => {
    expect(IncidentTrailUtil.openIncidentEntriesOf([OPEN_INCIDENT], HISTORY, NOTICES)).toEqual([{
      incidentId:      'I3',
      kind:            'setup-failed',
      ticketIds:       ['042'],
      jobId:           'J4',
      settlement:      'open',
      defaultMove:     'worktree-repair',
      delivered:       false,
      deliveredInChat: null,
      facts:           [['step', 'install']],
      openedAt:        AT,
      settledAt:       null,
      settlingMove:    null,
      steps:           [
        { at: AT, form: 'opened', text: 'opened: setup-failed on #042 (step install)' },
        { at: LATER, form: 'noted', text: 'note: The lock file is gone' },
      ],
    }]);
  });

  test('an incident that went out in an Assistant\'s chat reads as delivered, its delivery step naming the job and the chat', () => {
    const delivered = { ...OPEN_INCIDENT, deliveredInTurn: { jobId: 'J9', chatSequence: 14 } };
    const [entry] = IncidentTrailUtil.openIncidentEntriesOf([delivered], HISTORY, NOTICES);
    expect(entry?.delivered).toBe(true);
    expect(entry?.deliveredInChat).toEqual({ jobId: 'J9', chatSequence: 14 });
    expect(entry?.steps.map((step) => step.form)).toEqual(['opened', 'delivered', 'noted']);
    expect(entry?.steps[1]).toEqual({
      at: null, form: 'delivered', text: 'delivered in chat 14 to', jobId: 'J9'
    });
  });
});

describe('IncidentTrailUtil.settledIncidentEntriesOf', () => {
  test('settled incidents come back from the log, newest first, each ending in its settling record and never delivered again', () => {
    const settled = IncidentTrailUtil.settledIncidentEntriesOf(HISTORY, new Set(['I3']), NOTICES);
    expect(settled.map(({
      incidentId, settlement, settledAt, settlingMove, steps
    }) => ({
      incidentId, settlement, settledAt, settlingMove, steps
    }))).toEqual([
      {
        incidentId:   'I2',
        settlement:   'escalated',
        settledAt:    AT,
        settlingMove: null,
        steps:        [
          { at: AT, form: 'opened', text: 'opened: system-question on #041' },
          { at: AT, form: 'noted', text: 'note: Needs the owner' },
          {
            at: AT, form: 'escalated', text: 'escalated to User as', decisionId: 'E5'
          },
        ],
      },
      {
        incidentId:   'I1',
        settlement:   'defaulted',
        settledAt:    LATER,
        settlingMove: 'merge-abort',
        steps:        [
          { at: AT, form: 'opened', text: 'opened: gate-cannot-run on #040' },
          { at: LATER, form: 'defaulted', text: 'default applied: merge-abort, as no Assistant was up' },
        ],
      },
    ]);
  });

  test('a default whose notice the forge no longer serves names its cause as recorded', () => {
    const defaulted = IncidentTrailUtil.settledIncidentEntriesOf(HISTORY, new Set(['I3']), []).find((entry) => entry.incidentId === 'I1');
    expect(defaulted?.steps.at(-1)).toEqual({ at: LATER, form: 'defaulted', text: 'default applied: merge-abort, as no-assistant' });
  });

  test('an escalation with no decision on its record says so without an id', () => {
    const history: BoardQuestionHistoryEntryDocument[] = [
      {
        kind: 'incident-opened', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I7', fields: { kind: 'system-question', ticketIds: [] }
      },
      {
        kind: 'incident-escalated', at: AT, jobId: null, ticketId: null, decisionId: null, incidentId: 'I7', fields: {}
      },
    ];
    expect(IncidentTrailUtil.settledIncidentEntriesOf(history, new Set(), []).flatMap((entry) => entry.steps)).toEqual([
      { at: AT, form: 'opened', text: 'opened: system-question' },
      { at: AT, form: 'escalated', text: 'escalated to User' },
    ]);
  });
});

describe('IncidentTrailUtil.incidentPillOf', () => {
  test('an open incident reads as waiting until delivered, a settled one by its settlement, a default in the draft rose', () => {
    const incidents: readonly Pick<IncidentEntry, 'settlement' | 'delivered'>[] = [
      { settlement: 'open', delivered: false },
      { settlement: 'open', delivered: true },
      { settlement: 'handled', delivered: true },
      { settlement: 'escalated', delivered: true },
      { settlement: 'defaulted', delivered: true },
    ];
    expect(incidents.map(IncidentTrailUtil.incidentPillOf)).toEqual([
      { state: 'in-progress', label: 'waiting for the Assistant' },
      { state: 'in-review', label: 'delivered' },
      { state: 'reviewed', label: 'handled' },
      { state: 're-review', label: 'escalated' },
      { state: 'draft', label: 'defaulted' },
    ]);
  });
});
