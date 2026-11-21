/**
 * How an answered question reaches a live session. What matters: when the session's agent takes live answers, the answer goes to the live
 * session as the adapter's answer line and is marked delivered; when it does not, Hephaestus stops the live session, marking the stop as
 * its own so the next pass resumes it with the answer, and writes no line.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentQuestion }                             from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { ChildInput }                                from '../../lib/talos/@types/TalosFrame.ts';
import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                                     from '../../lib/tracker-model/Board.ts';
import { SESSION_STOP_GRACE_MILLISECONDS }                from '../../shared/constants/HephaestusLimits.ts';
import { fakeAgentAdapter, fakeQuestionLine }             from '../../testing/FakeAgentAdapter.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AnswerDelivery }                                 from './AnswerDelivery.ts';
import type { BoardChildren }                             from './BoardChildren.ts';

const REQUEST_ID = 'request-1';
const QUESTION: AgentQuestion = {
  question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.', isRecommended: false }]
};
const ANSWER = { 'Which colour?': 'Blue' };
const ANSWERED: LogRecord = {
  at: '2026-11-19T09:30:00+01:00', kind: 'decision-answered', decisionId: 'E1', fields: { answer: ANSWER, requestId: REQUEST_ID }
} as LogRecord;
const RUNNING_JOB = {
  id: 'J1', kind: 'build', state: 'running', childInstance: 1, answeredRequestIds: [REQUEST_ID]
} as unknown as Readonly<Job>;

interface PlantedSession {
  readonly children:   BoardChildren;
  readonly inputsSent: ChildInput[];
  readonly stopsAsked: number[];
}

let trackerDirectory = '';

beforeEach(() => {
  trackerDirectory = createScratchDirectory('answer-delivery');
  mkdirSync(join(trackerDirectory, RUNNING_JOB.id));
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
});

/** A live session whose event log holds the question it asked, taking every frame Hephaestus sends it. */
function plantedLiveSession(): PlantedSession {
  const inputsSent: ChildInput[] = [];
  const stopsAsked: number[] = [];
  const children = {
    jobFolderOf: (jobId: string) => join(trackerDirectory, jobId),
    livenessOf:  () => ({ verdict: 'live', state: 'running' }),
    eventsAfter: () => [{ sequence: 1, origin: 'agent', line: fakeQuestionLine(REQUEST_ID, [QUESTION]) }],
    sendInput:   (_childFolder: string, _instance: number, input: ChildInput) => {
      inputsSent.push(input);
      return Promise.resolve(true);
    },
    stop: (_childFolder: string, _instance: number, graceMilliseconds: number) => {
      stopsAsked.push(graceMilliseconds);
      return Promise.resolve(true);
    },
  } as unknown as BoardChildren;
  return { children, inputsSent, stopsAsked };
}

function boardWithTheAnswer(): Board {
  return { jobs: () => [RUNNING_JOB], logRecordsSoFar: () => [ANSWERED] } as unknown as Board;
}

async function deliverTo(session: PlantedSession, deliversLive: boolean): Promise<void> {
  await AnswerDelivery.deliverAnswers({
    boardChildren:   session.children,
    board:           boardWithTheAnswer(),
    adapter:         fakeAgentAdapter(),
    deliversLive,
    answerMessageOf: (answer) => `Answered: ${JSON.stringify(answer)}`,
  });
}

describe('an answer to a live session', () => {
  test('goes to an agent that takes live answers as the adapter\'s answer line, marked delivered, with no stop', async () => {
    const session = plantedLiveSession();
    await deliverTo(session, true);

    expect(session.inputsSent).toEqual([{ act: 'write-line', line: fakeAgentAdapter().answerLineOf(REQUEST_ID, [QUESTION], ANSWER) }]);
    expect(session.stopsAsked).toEqual([]);
    expect(AnswerDelivery.answerAwaitsDelivery(session.children, RUNNING_JOB)).toBe(false);
  });

  test('stops an agent that takes no live answer, once, as Hephaestus\'s own stop, so a resume carries the answer', async () => {
    const session = plantedLiveSession();
    await deliverTo(session, false);
    await deliverTo(session, false);

    expect(session.inputsSent).toEqual([]);
    expect(session.stopsAsked).toEqual([SESSION_STOP_GRACE_MILLISECONDS]);
    expect(AnswerDelivery.stoppedForAnswerDelivery(session.children, RUNNING_JOB)).toBe(true);
    expect(AnswerDelivery.answerAwaitsDelivery(session.children, RUNNING_JOB)).toBe(true);
  });
});
