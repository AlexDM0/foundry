/**
 * An agent's question request routed by its headers: only all-`system` or all-`ticket` questions reach the Assistant as an incident,
 * anything else is User's `agent-question`; either way the job waits keeping its build slot, a replayed or answered request opens nothing
 * twice, and the notes given with `question options` reach the options of the question they name.
 */
import { describe, expect, test } from 'bun:test';

import { QUESTIONS_FACT, REQUEST_ID_FACT } from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import type { AgentQuestion }              from '../../lib/agent-launch/AgentSessionEvent.ts';
import { boardFixture, ticketFixture }     from '../../testing/BoardFixtures.ts';
import { QuestionRouting }                 from './QuestionRouting.ts';

const AT = '2026-09-26T10:15:00+02:00';

function questionHeaded(header: string): AgentQuestion {
  return {
    question:    `Example question headed ${header}?`,
    header,
    multiSelect: false,
    options:     [
      { label: 'Yes', description: 'Go on', isRecommended: false },
      { label: 'No', description: 'Stop', isRecommended: false },
    ],
  };
}

function runningBuild(): ReturnType<typeof boardFixture> {
  const fixture = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })], concurrencyLimit: 1 });
  fixture.board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main',
  }, AT);
  fixture.board.moveJob('J1', 'running', AT);
  return fixture;
}

describe('the route of a request', () => {
  test.each([
    [['system'], 'system-question'],
    [['system', 'system'], 'system-question'],
    [['ticket'], 'malformed-ticket'],
    [['ticket', 'ticket'], 'malformed-ticket'],
    [['Format'], 'agent-question'],
    [['system', 'ticket'], 'agent-question'],
    [['system', 'Format'], 'agent-question'],
    [['ticket', 'Format'], 'agent-question'],
  ] as const)('headers %p route to %s', (headers, route) => {
    expect(QuestionRouting.routeOf(headers.map((header) => ({ header })))).toBe(route);
  });
});

describe('opening a question in the hold that reads it', () => {
  test('a user question opens an agent-question with exactly the agent\'s questions and options, and the job waits on its slot', () => {
    const { board } = runningBuild();
    const questions = [questionHeaded('Format'), questionHeaded('system')];
    QuestionRouting.openQuestion(board, 'J1', 'request-1', questions, AT);

    expect(board.decisions()).toMatchObject([{
      kind: 'agent-question', jobId: 'J1', askedBy: 'builder', requestId: 'request-1', ticketIds: ['001'], questions, context: '',
    }]);
    expect(board.incidents()).toEqual([]);
    // The waiting job stays live, and `src/domain/tracker-model/Playbook.spec.ts` holds that a waiting job keeps its slot.
    expect(board.jobs().map((job) => [job.id, job.state])).toEqual([['J1', 'waiting-for-answer']]);
  });

  test.each([['system', 'system-question'], ['ticket', 'malformed-ticket']] as const)('every question headed %s opens a %s incident for the Assistant', (header, kind) => {
    const { board } = runningBuild();
    const questions = [questionHeaded(header), questionHeaded(header)];
    QuestionRouting.openQuestion(board, 'J1', 'request-1', questions, AT);

    expect(board.decisions()).toEqual([]);
    expect(board.incidents()).toMatchObject([{
      kind, jobId: 'J1', ticketIds: ['001'], defaultMove: 'incident-escalate', facts: { [REQUEST_ID_FACT]: 'request-1', [QUESTIONS_FACT]: JSON.stringify(questions) },
    }]);
    expect(board.jobById('J1')?.state).toBe('waiting-for-answer');
  });

  test('a replayed request opens nothing twice, and an answered one opens nothing at all', () => {
    const { board } = runningBuild();
    QuestionRouting.openQuestion(board, 'J1', 'request-1', [questionHeaded('system')], AT);
    QuestionRouting.openQuestion(board, 'J1', 'request-1', [questionHeaded('system')], AT);
    expect(board.incidents()).toHaveLength(1);

    board.addAnsweredRequestId('J1', 'request-2');
    QuestionRouting.openQuestion(board, 'J1', 'request-2', [questionHeaded('Format')], AT);
    expect(board.decisions()).toEqual([]);
  });
});

describe('the option notes a job gave before it asked', () => {
  const notes = {
    question: 'Example question headed Format?',
    options:  [{ label: 'Yes', touches: ['src/basket/Basket.ts'], tradeOff: 'Faster, less checked.' }, { label: 'Maybe', acceptanceEffect: 'A1 fails.' }],
  };

  test('reach the options of the question whose text they name, by label, and leave the job', () => {
    const { board } = runningBuild();
    board.noteQuestionOptions('J1', notes);
    QuestionRouting.openQuestion(board, 'J1', 'request-1', [questionHeaded('Format')], AT);

    expect(board.decisions()[0]?.questions[0]?.options).toEqual([
      {
        label: 'Yes', description: 'Go on', isRecommended: false, touches: ['src/basket/Basket.ts'], tradeOff: 'Faster, less checked.'
      },
      { label: 'No', description: 'Stop', isRecommended: false },
    ]);
    expect(Object.hasOwn(board.jobById('J1') ?? {}, 'pendingOptionNotes')).toBe(false);
  });

  test('go with the questions an incident carries, so an escalation puts them to User', () => {
    const { board } = runningBuild();
    board.noteQuestionOptions('J1', { ...notes, question: 'Example question headed system?' });
    QuestionRouting.openQuestion(board, 'J1', 'request-1', [questionHeaded('system')], AT);

    const [incident] = board.incidents();
    expect(JSON.parse(incident?.facts[QUESTIONS_FACT] ?? '')).toMatchObject([{ options: [{ label: 'Yes', tradeOff: 'Faster, less checked.' }, { label: 'No' }] }]);
    board.escalateQuestionIncident(incident?.id ?? '', AT);
    expect(board.decisions()[0]?.questions[0]?.options[0]).toEqual({
      label: 'Yes', description: 'Go on', isRecommended: false, touches: ['src/basket/Basket.ts'], tradeOff: 'Faster, less checked.'
    });
  });

  test('for a question not asked stay on the job, and the question asked opens with its options alone', () => {
    const { board } = runningBuild();
    board.noteQuestionOptions('J1', { ...notes, question: 'Example question headed Colour?' });
    QuestionRouting.openQuestion(board, 'J1', 'request-1', [questionHeaded('Format')], AT);

    expect(board.decisions()[0]?.questions[0]?.options).toEqual([...questionHeaded('Format').options]);
    expect(board.jobById('J1')?.pendingOptionNotes?.map((pending) => pending.question)).toEqual(['Example question headed Colour?']);
  });
});
