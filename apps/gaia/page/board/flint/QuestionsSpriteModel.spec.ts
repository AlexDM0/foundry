/**
 * What the questions habitat cues between two payloads (Flint's board wiring design, "New habitats", `questions`). What matters: each row of the
 * table is cued from its change, once, and not from a fact that only stays; asking begins only when a decision is open and none is
 * selected; after User selected another decision than the oldest two times under the same oldest decision since the last ask it is a
 * knock in place of an ask, while a look at the oldest itself counts nothing, and the count starts again at each ask and knock and when
 * the oldest decision changes; an incident that opens lights the fuse; an incident settles on a record that closes it, never on an
 * escalation; only a waiver that is answered signs, any other decision that is answered is a happy answer of its own, and neither when it
 * was answered before; and several changes come in the order of the table.
 */
import { describe, expect, test } from 'bun:test';

import { QuestionsSpriteModel, type QuestionsFacts, type QuestionsReading } from './QuestionsSpriteModel.ts';

const OLDEST = { id: 'D1', openedAt: '2026-11-10T09:00:00' };
const NEWER = { id: 'D2', openedAt: '2026-11-10T10:00:00' };

function facts(changes: Partial<QuestionsFacts> = {}): QuestionsFacts {
  return {
    decisions: [], selectedDecisionId: null, incidents: [], history: [], ...changes
  };
}

/** Each payload after the first, and the cues of each step. */
function cuesOver(payloads: readonly QuestionsFacts[]): readonly (readonly string[])[] {
  const [first, ...later] = payloads;
  let reading: QuestionsReading = QuestionsSpriteModel.firstReadingOf(first ?? facts());
  return later.map((next) => {
    const { reading: nextReading, cueNames } = QuestionsSpriteModel.stepOf(reading, next);
    reading = nextReading;
    return cueNames;
  });
}

const opened = (decisionId: string, kind: string) => ({ kind: 'decision-opened', decisionId, fields: { kind, ticketIds: [] } });
const answered = (decisionId: string) => ({ kind: 'decision-answered', decisionId, fields: { answer: {} } });
const incidentRecord = (kind: string) => ({ kind, incidentId: 'I1', fields: {} });

describe('asking', () => {
  test('a decision that opens with none selected is asked about', () => {
    expect(cuesOver([facts(), facts({ decisions: [OLDEST] })])).toEqual([['decision-waits']]);
  });

  test('a decision that opens shown in the panel, and a decision that stays open unselected, are no change', () => {
    expect(cuesOver([facts(), facts({ decisions: [OLDEST], selectedDecisionId: 'D1' })])).toEqual([[]]);
    expect(cuesOver([facts({ decisions: [OLDEST] }), facts({ decisions: [OLDEST, NEWER] })])).toEqual([[]]);
  });

  test('two selections of another decision than the oldest since the last ask make the next ask a knock, each time', () => {
    const newest = { id: 'D3', openedAt: '2026-11-10T11:00:00' };
    const waiting = facts({ decisions: [OLDEST, NEWER, newest] });
    const showing = (decisionId: string): QuestionsFacts => facts({ decisions: [OLDEST, NEWER, newest], selectedDecisionId: decisionId });
    expect(cuesOver([waiting, showing('D2'), showing('D3'), waiting, showing('D2'), showing('D1'), showing('D2'), waiting])).toEqual([
      [], [], ['oldest-decision-passed'], [], [], [], ['oldest-decision-passed'],
    ]);
  });

  test('opening and closing the oldest decision itself passes nothing: the next ask is an ask', () => {
    const waiting = facts({ decisions: [OLDEST, NEWER] });
    const showing = (decisionId: string): QuestionsFacts => facts({ decisions: [OLDEST, NEWER], selectedDecisionId: decisionId });
    expect(cuesOver([waiting, showing('D1'), waiting, showing('D1'), waiting])).toEqual([[], ['decision-waits'], [], ['decision-waits']]);
  });

  test('a new oldest decision starts the count again', () => {
    const later = { id: 'D3', openedAt: '2026-11-10T11:00:00' };
    expect(cuesOver([
      facts({ decisions: [OLDEST, later], selectedDecisionId: 'D1' }),
      facts({ decisions: [OLDEST, later], selectedDecisionId: 'D3' }),
      facts({ decisions: [later], selectedDecisionId: null }),
    ])).toEqual([[], ['decision-waits']]);
  });

  test('the oldest decision is the first opened, then the lowest id', () => {
    const sameMoment = { id: 'D0', openedAt: OLDEST.openedAt };
    const showing = (decisionId: string): QuestionsFacts => facts({ decisions: [NEWER, OLDEST, sameMoment], selectedDecisionId: decisionId });
    expect(cuesOver([showing('D2'), showing('D1'), showing('D2'), facts({ decisions: [NEWER, OLDEST, sameMoment] })])).toEqual([[], [], ['oldest-decision-passed']]);
  });
});

describe('incidents and waivers', () => {
  test('an incident that opens lights the fuse; one that stays or goes is no change', () => {
    const incident = { id: 'I1', defaultMove: 'retry' };
    expect(cuesOver([facts(), facts({ incidents: [incident] }), facts({ incidents: [incident] }), facts()])).toEqual([['incident-opened'], [], []]);
  });

  test('an incident that is handled, answered or takes its default move settles; one that escalates, or settled before, does not', () => {
    const open = facts({ history: [incidentRecord('incident-opened')] });
    for (const settlingKind of ['incident-handled', 'incident-answered', 'incident-defaulted']) {
      const settled = facts({ history: [...open.history, incidentRecord(settlingKind)] });
      expect(cuesOver([open, settled, facts({ history: [...settled.history] })])).toEqual([['incident-settled'], []]);
    }
    expect(cuesOver([open, facts({ history: [...open.history, incidentRecord('incident-escalated')] })])).toEqual([[]]);
  });

  test('a waiver that is answered signs, and another kind that is answered is a decision answered; neither when answered before', () => {
    const waiverOpen = facts({ history: [opened('D1', 'waiver'), opened('D2', 'agent-question')] });
    const questionAnswered = facts({ history: [...waiverOpen.history, answered('D2')] });
    expect(cuesOver([waiverOpen, questionAnswered, facts({ history: [...questionAnswered.history] })])).toEqual([['decision-answered'], []]);
    const waiverAnswered = facts({ history: [...waiverOpen.history, answered('D1')] });
    expect(cuesOver([waiverOpen, waiverAnswered, facts({ history: [...waiverAnswered.history] })])).toEqual([['waiver-answered'], []]);
  });
});

test('several changes come in the order of the table', () => {
  const next = facts({
    decisions: [OLDEST],
    incidents: [{ id: 'I2', defaultMove: 'retry' }],
    history:   [opened('D0', 'waiver'), answered('D0'), opened('D9', 'agent-question'), answered('D9'), incidentRecord('incident-handled')],
  });
  const previous = facts({ history: [opened('D0', 'waiver'), opened('D9', 'agent-question')] });
  expect(cuesOver([previous, next])).toEqual([['decision-waits', 'incident-opened', 'incident-settled', 'waiver-answered', 'decision-answered']]);
});
