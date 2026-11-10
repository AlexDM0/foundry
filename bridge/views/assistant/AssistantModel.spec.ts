/**
 * The Assistant view's model. What matters: no live Assistant reads as booting; an incident on the board is open and never also settled,
 * though the log opened it; and a message stays queued until a `user` line of the transcript carries it. How each incident reads is
 * `IncidentTrailUtil`'s, held by its own spec.
 */
import { describe, expect, test } from 'bun:test';

import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import { AssistantModelUtil }             from './AssistantModel.ts';

const AT = '2026-10-29T20:00:00+01:00';

const BOARD: ConversationBoardDocument = {
  jobs: [{
    id: 'J9', kind: 'assistant', ticketIds: [], state: 'running'
  }],
  decisions: [],
  incidents: [{
    id: 'I3', kind: 'setup-failed', ticketIds: ['042'], jobId: 'J4', facts: { step: 'install' }, defaultMove: 'worktree-repair', deliveredInTurn: null, openedAt: AT
  }],
  questionHistory: [
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
  ],
};

describe('AssistantModelUtil.assistantModelOf', () => {
  test('a running Assistant job is the session, and one still launching reads as booting', () => {
    expect(AssistantModelUtil.assistantModelOf(BOARD).assistantJobId).toBe('J9');
    expect(AssistantModelUtil.assistantModelOf({
      ...BOARD,
      jobs: [{
        id: 'J10', kind: 'assistant', ticketIds: [], state: 'launching'
      }]
    }).assistantJobId).toBeNull();
    expect(AssistantModelUtil.assistantModelOf({ ...BOARD, jobs: [] }).assistantJobId).toBeNull();
  });

  test('an incident on the board is open and not settled, and the ones the log opened that left the board are settled', () => {
    const model = AssistantModelUtil.assistantModelOf(BOARD);
    expect(model.openIncidents.map((incident) => incident.incidentId)).toEqual(['I3']);
    expect(model.settledIncidents.map((incident) => incident.incidentId)).toEqual(['I2', 'I1']);
  });
});

describe('AssistantModelUtil.queuedMessagesOf', () => {
  test('a sent message is queued until a user line carries it', () => {
    const entries = [{
      cursor: '1.4', entryKey: '1.4.0', at: null, role: 'user', text: 'User says: look at 042 first'
    }];
    expect(AssistantModelUtil.queuedMessagesOf(['look at 042 first', 'then 043'], entries)).toEqual(['then 043']);
  });
});
