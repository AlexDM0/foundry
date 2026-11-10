/**
 * The incident trail. What matters: an open incident shows its default, its facts and whether it was delivered; a settled one is read
 * back from the log alone, newest first, with every move, note and escalation and the settlement of its last settling record; an incident
 * still open is never also settled; the pill reads an open incident as waiting until delivered and an applied default in the draft rose;
 * and a default's cause is worded, an unknown cause, also one named like an object property, reading as itself.
 */
import { describe, expect, test } from 'bun:test';

import type { HistoryRecordDocument, IncidentDocument } from '../@types/ConversationDocuments.ts';
import { IncidentTrailUtil, type IncidentEntry }        from './IncidentTrailUtil.ts';

const AT = '2026-10-29T20:00:00+01:00';

const OPEN_INCIDENT: IncidentDocument = {
  id: 'I3', kind: 'setup-failed', ticketIds: ['042'], jobId: 'J4', facts: { step: 'install' }, defaultMove: 'worktree-repair', deliveredInTurn: null, openedAt: AT
};

const HISTORY: readonly HistoryRecordDocument[] = [
  {
    kind: 'incident-opened', at: AT, incidentId: 'I1', fields: { kind: 'gate-cannot-run', ticketIds: ['040'] }
  },
  {
    kind: 'incident-opened', at: AT, incidentId: 'I2', fields: { kind: 'system-question', ticketIds: ['041'] }
  },
  {
    kind: 'incident-opened', at: AT, incidentId: 'I3', fields: { kind: 'setup-failed', ticketIds: ['042'] }
  },
  {
    kind: 'incident-noted', at: AT, incidentId: 'I2', fields: { text: 'Needs the owner' }
  },
  {
    kind: 'incident-escalated', at: AT, incidentId: 'I2', fields: { decisionId: 'E5' }
  },
  {
    kind: 'incident-defaulted', at: AT, incidentId: 'I1', fields: { move: 'merge-abort', cause: 'no-assistant' }
  },
];

describe('IncidentTrailUtil.openIncidentEntriesOf', () => {
  test('an open incident carries its default, its facts and whether it was delivered', () => {
    expect(IncidentTrailUtil.openIncidentEntriesOf([OPEN_INCIDENT], HISTORY)).toEqual([{
      incidentId: 'I3', kind: 'setup-failed', ticketIds: ['042'], settlement: 'open', defaultMove: 'worktree-repair', delivered: false, facts: [['step', 'install']], steps: []
    }]);
  });

  test('an incident that went out in an Assistant\'s chat reads as delivered', () => {
    const delivered = { ...OPEN_INCIDENT, deliveredInTurn: { jobId: 'J9', chatSequence: 2 } };
    expect(IncidentTrailUtil.openIncidentEntriesOf([delivered], HISTORY).map((entry) => entry.delivered)).toEqual([true]);
  });
});

describe('IncidentTrailUtil.settledIncidentEntriesOf', () => {
  test('settled incidents come back from the log, newest first, with their moves, notes and escalations', () => {
    const settled = IncidentTrailUtil.settledIncidentEntriesOf(HISTORY, new Set(['I3']));
    expect(settled.map(({ incidentId, settlement, steps }) => ({ incidentId, settlement, steps: steps.map((step) => step.text) }))).toEqual([
      { incidentId: 'I2', settlement: 'escalated', steps: ['note: Needs the owner', 'escalated to User as E5'] },
      { incidentId: 'I1', settlement: 'defaulted', steps: ['default applied: merge-abort (no-assistant)'] },
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

describe('IncidentTrailUtil.defaultCauseTextOf', () => {
  test('each known cause is worded', () => {
    expect(['turn-closed', 'turn-budget', 'no-assistant'].map(IncidentTrailUtil.defaultCauseTextOf)).toEqual([
      'its delivery turn closed', 'the turn budget ran out', 'no Assistant was up',
    ]);
  });

  test('an unknown cause, also one named like an object property, reads as itself', () => {
    expect(['someday', 'constructor', 'toString'].map(IncidentTrailUtil.defaultCauseTextOf)).toEqual(['someday', 'constructor', 'toString']);
  });
});
