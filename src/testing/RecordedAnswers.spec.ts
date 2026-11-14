/**
 * The overseer-fetch mock must answer exactly what was recorded for a situation, and fail the spec on everything it cannot
 * answer from a recording: a call with no answer, an address the real boundary throws on, a bound of zero, an answer set with two answers
 * or a misfitting answer for one call shape, and an OS with no recording. A recorded stream is replayed chunk by chunk, and a stream left
 * open is counted until it is closed or read to its end, as the real connection stays open. Every number of the monitor and control
 * contracts Gaia knows, reads or builds toward has a recording, and each state of Flint's brain a whole answer set at monitor 3.
 */
import { describe, expect, test } from 'bun:test';

import type { OverseerRequest, OverseerStreamRequest } from '../lib/forge-client/OverseerFetch.ts';

import { CONTRACT_VERSIONS, OLDER_CONTRACT_VERSIONS_READ, UPCOMING_CONTRACT_VERSIONS } from '../shared/constants/ContractVersions.ts';

import {
  everyRecordedMonitorOneAnswerOf,
  everyRecordedMonitorThreeAnswerOf,
  everyRecordedOverseerAnswerOf,
  FLINT_BRAIN_SITUATIONS,
  OVERSEER_SITUATIONS,
  recordedFlintBrainAnswersOf,
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type RecordedOverseerAnswer,
} from './RecordedAnswers.ts';

const OVERSEER_URL = 'http://127.0.0.1:4951/';
const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token';

function identityRequest(): OverseerRequest {
  return {
    overseerUrl: OVERSEER_URL, method: 'GET', path: '/api/identity', bearerToken: null, jsonBody: null, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS,
  };
}

function monitorStreamRequest(): OverseerStreamRequest {
  return {
    overseerUrl: OVERSEER_URL, path: '/api/monitor/events', bearerToken: EXAMPLE_TOKEN, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS,
  };
}

const MONITOR_STREAM_CALL_SHAPE = 'STREAM /api/monitor/events with bearer';

function streamAnswers(chunks: readonly string[], ending: 'closed' | 'broken' | 'stays-open'): RecordedOverseerAnswer[] {
  return [{ callShape: MONITOR_STREAM_CALL_SHAPE, answer: { verdict: 'streaming', chunks, ending } }];
}

describe('the call shapes', () => {
  test('name the method, the path and whether a bearer travels, and the stream apart', () => {
    expect(requestCallShapeOf(identityRequest())).toBe('GET /api/identity');
    expect(requestCallShapeOf({ method: 'POST', path: '/api/commands', bearerToken: EXAMPLE_TOKEN })).toBe('POST /api/commands with bearer');
    expect(streamCallShapeOf(monitorStreamRequest())).toBe(MONITOR_STREAM_CALL_SHAPE);
    expect(situationCallShapeOf('stopped', 'GET /api/identity')).toBe('stopped: GET /api/identity');
  });
});

describe('the recorded overseer answers', () => {
  test('lead every call shape with a known situation, once over both recordings', () => {
    const callShapes = everyRecordedOverseerAnswerOf().map(({ callShape }) => callShape);
    for (const callShape of callShapes) expect(OVERSEER_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, '')))).toBe(true);
    expect(new Set(callShapes).size).toBe(callShapes.length);
  });

  test('hold an answer of each situation', () => {
    for (const situation of OVERSEER_SITUATIONS) expect(recordedOverseerAnswersOf(situation).length).toBeGreaterThan(0);
  });

  test('fail the spec for an OS with no recording, naming the command that takes it', () => {
    expect(() => recordedOverseerAnswersOf('serving', 'example-os')).toThrow('overseer-fetch has no recording for example-os');
    expect(() => recordedOverseerAnswersOf('serving', 'example-os')).toThrow('`bun run record overseer-fetch`');
  });
});

function documentsAnsweredIn(answers: readonly RecordedOverseerAnswer[]): readonly Record<string, unknown>[] {
  return answers.flatMap(({ answer }) => {
    const bodyTexts = answer.verdict === 'answered' ? [answer.bodyText] : [];
    const streamLines = answer.verdict === 'streaming' ? answer.chunks.join('').split('\n') : [];
    const eventTexts = streamLines.filter((line) => line.startsWith('data: ')).map((line) => line.slice('data: '.length));
    return [...bodyTexts, ...eventTexts].flatMap((documentText) => {
      try {
        const document: unknown = JSON.parse(documentText);
        return typeof document === 'object' && document !== null && !Array.isArray(document) ? [document as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
  });
}

describe('the recorded forge contracts', () => {
  const everyDocument = (): readonly Record<string, unknown>[] => documentsAnsweredIn([
    ...everyRecordedOverseerAnswerOf(),
    ...everyRecordedMonitorOneAnswerOf(),
    ...everyRecordedMonitorThreeAnswerOf(),
  ]);

  test('hold a snapshot at every monitor number Gaia reads, still reads or builds toward', () => {
    const monitorVersions = new Set(everyDocument().map((document) => document['monitorVersion']));
    const knownVersions = [CONTRACT_VERSIONS.forgeMonitor, ...OLDER_CONTRACT_VERSIONS_READ.forgeMonitor, UPCOMING_CONTRACT_VERSIONS.forgeMonitor];
    for (const version of knownVersions) expect([version, monitorVersions.has(version)]).toEqual([version, true]);
  });

  test('hold an identity naming, and a command answered at, every control number Gaia sends or builds toward', () => {
    const documents = everyDocument();
    const identityControlVersions = new Set(documents.map((document) => (document['contracts'] as { control?: unknown } | undefined)?.control));
    const answerControlVersions = new Set(documents.map((document) => document['controlVersion']));
    for (const version of [CONTRACT_VERSIONS.forgeControl, UPCOMING_CONTRACT_VERSIONS.forgeControl]) {
      expect([version, identityControlVersions.has(version), answerControlVersions.has(version)]).toEqual([version, true, true]);
    }
  });
});

describe('the recorded states of Flint\'s brain', () => {
  test('lead every call shape with a state of the brain, once', () => {
    const callShapes = everyRecordedMonitorThreeAnswerOf().map(({ callShape }) => callShape);
    for (const callShape of callShapes) expect(FLINT_BRAIN_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, '')))).toBe(true);
    expect(new Set(callShapes).size).toBe(callShapes.length);
  });

  test('hold for each state the identity, the monitor, its stream and the command that brought the brain there', () => {
    for (const situation of FLINT_BRAIN_SITUATIONS) {
      expect([situation, recordedFlintBrainAnswersOf(situation).map(({ callShape }) => callShape).sort()]).toEqual([situation, [
        'GET /api/identity',
        'GET /api/monitor with bearer',
        'POST /api/commands with bearer',
        MONITOR_STREAM_CALL_SHAPE,
      ]]);
    }
  });

  test('serve the brain running, ended, refused with usage-limit-holds, and absent as null, each at monitor 3 beside control 2', () => {
    const brainOf = (situation: typeof FLINT_BRAIN_SITUATIONS[number]): unknown => {
      const snapshots = documentsAnsweredIn(recordedFlintBrainAnswersOf(situation)).filter((document) => Object.hasOwn(document, 'monitorVersion'));
      for (const snapshot of snapshots) expect(snapshot['monitorVersion']).toBe(UPCOMING_CONTRACT_VERSIONS.forgeMonitor);
      return snapshots.map((snapshot) => snapshot['flintBrain']);
    };
    expect(brainOf('brain-running')).toEqual([expect.objectContaining({ state: 'running', startedBy: 'gaia' }), expect.objectContaining({ state: 'running' })]);
    expect(brainOf('brain-ended')).toEqual([expect.objectContaining({ state: 'ended', endedReason: 'stopped' }), expect.objectContaining({ state: 'ended' })]);
    expect(brainOf('brain-refused')).toEqual([
      expect.objectContaining({ state: 'refused', refusal: expect.objectContaining({ code: 'usage-limit-holds' }) }),
      expect.objectContaining({ state: 'refused' }),
    ]);
    expect(brainOf('no-flint')).toEqual([null, null]);
  });
});

describe('the recorded overseer fetch', () => {
  test('answers the identity of a forge that serves with the answer recorded from a real forge', async () => {
    const overseerFetch = recordedOverseerFetch(recordedOverseerAnswersOf('serving'));
    const answer        = await overseerFetch.request(identityRequest());
    expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
    expect(answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : null).toMatchObject({ application: 'forge' });
  });

  test('answers unreachable for a forge that has stopped', async () => {
    const overseerFetch = recordedOverseerFetch(recordedOverseerAnswersOf('stopped'));
    expect(await overseerFetch.request(identityRequest())).toEqual({ verdict: 'unreachable' });
    expect(await overseerFetch.openStream(monitorStreamRequest())).toEqual({ verdict: 'unreachable' });
  });

  test('fails a call with no answer in its situation and names its call shape', async () => {
    const overseerFetch = recordedOverseerFetch(recordedOverseerAnswersOf('starting'));
    await expect(overseerFetch.openStream(monitorStreamRequest())).rejects.toThrow(`No recorded answer for ${MONITOR_STREAM_CALL_SHAPE}`);
  });

  test('fails a call to an address the real boundary cannot parse, and one with a bound of zero', async () => {
    const overseerFetch = recordedOverseerFetch(recordedOverseerAnswersOf('serving'));
    await expect(overseerFetch.request({ ...identityRequest(), overseerUrl: 'no address' })).rejects.toThrow('which is no address');
    await expect(overseerFetch.request({ ...identityRequest(), timeoutMilliseconds: 0 })).rejects.toThrow('the real boundary times out at once');
  });

  test('lists the calls it answered, in order, with the token and the body each carried', async () => {
    const overseerFetch  = recordedOverseerFetch(recordedOverseerAnswersOf('token-rejected'));
    const commandRequest: OverseerRequest = {
      ...identityRequest(), method: 'POST', path: '/api/commands', bearerToken: EXAMPLE_TOKEN, jsonBody: '{"kind":"overseer-pause"}',
    };
    await overseerFetch.request(commandRequest);
    await overseerFetch.openStream(monitorStreamRequest());
    expect(overseerFetch.callsAnswered()).toEqual([
      { callShape: 'POST /api/commands with bearer', bearerToken: EXAMPLE_TOKEN, jsonBody: '{"kind":"overseer-pause"}' },
      { callShape: MONITOR_STREAM_CALL_SHAPE, bearerToken: EXAMPLE_TOKEN, jsonBody: null },
    ]);
  });

  test('refuses an answer set with two answers for one call shape', () => {
    const unreachableIdentity: RecordedOverseerAnswer = { callShape: 'GET /api/identity', answer: { verdict: 'unreachable' } };
    const answers = [unreachableIdentity, unreachableIdentity];
    expect(() => recordedOverseerFetch(answers)).toThrow('Two recorded answers for GET /api/identity');
  });

  test('refuses a stream answer recorded for a request', () => {
    expect(() => recordedOverseerFetch([{ callShape: 'GET /api/identity', answer: { verdict: 'streaming', chunks: [], ending: 'closed' } }]))
      .toThrow('The answer recorded for GET /api/identity is no overseer-fetch answer for that call');
  });
});

describe('a recorded stream', () => {
  test('hands on its chunks in order, then its ending, and the ending again after it', async () => {
    const overseerFetch = recordedOverseerFetch(streamAnswers([': ping\n\n', 'data: one\n\n'], 'broken'));
    const answer        = await overseerFetch.openStream(monitorStreamRequest());
    if (answer.verdict !== 'streaming') throw new Error(`The stream answered ${JSON.stringify(answer)}`);
    expect(await answer.stream.nextChunk()).toEqual({ kind: 'text', text: ': ping\n\n' });
    expect(await answer.stream.nextChunk()).toEqual({ kind: 'text', text: 'data: one\n\n' });
    expect(await answer.stream.nextChunk()).toEqual({ kind: 'ended', ending: 'broken' });
    expect(await answer.stream.nextChunk()).toEqual({ kind: 'ended', ending: 'broken' });
  });

  test('that stays open ends closed only when it is closed, and counts as left open until then', async () => {
    const overseerFetch = recordedOverseerFetch(streamAnswers([': ping\n\n'], 'stays-open'));
    const answer        = await overseerFetch.openStream(monitorStreamRequest());
    if (answer.verdict !== 'streaming') throw new Error(`The stream answered ${JSON.stringify(answer)}`);
    expect(await answer.stream.nextChunk()).toEqual({ kind: 'text', text: ': ping\n\n' });
    const pendingChunk = answer.stream.nextChunk();
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
    answer.stream.close();
    expect(await pendingChunk).toEqual({ kind: 'ended', ending: 'closed' });
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('counts a stream read to its end as no longer open, and one closed before its end ends closed', async () => {
    const overseerFetch = recordedOverseerFetch(streamAnswers(['data: one\n\n'], 'closed'));
    const readToItsEnd  = await overseerFetch.openStream(monitorStreamRequest());
    const closedEarly   = await overseerFetch.openStream(monitorStreamRequest());
    if (readToItsEnd.verdict !== 'streaming' || closedEarly.verdict !== 'streaming') throw new Error('A recorded stream did not open');
    await readToItsEnd.stream.nextChunk();
    expect(overseerFetch.streamsLeftOpen()).toBe(2);
    await readToItsEnd.stream.nextChunk();
    closedEarly.stream.close();
    expect(await closedEarly.stream.nextChunk()).toEqual({ kind: 'ended', ending: 'closed' });
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });
});
