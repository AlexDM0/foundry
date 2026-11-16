/**
 * The overseer-fetch mock must answer exactly what was recorded for a situation, and fail the spec on everything it cannot
 * answer from a recording: a call with no answer, an address the real boundary throws on, a bound of zero, an answer set with two answers
 * or a misfitting answer for one call shape, and an OS with no recording. A recorded stream is replayed chunk by chunk, and a stream left
 * open is counted until it is closed or read to its end, as the real connection stays open. Every forge situation is a forge at a system
 * version: at the one Gaia supports, which answers its versions first and every endpoint at its versioned path, at the monitor and control
 * contracts Gaia reads and sends; the same forge in each state of Flint's brain, each a whole answer set; and forges ahead of the one Gaia
 * supports, newer, older, or serving none.
 */
import { describe, expect, test } from 'bun:test';

import type { OverseerRequest, OverseerStreamRequest } from '../lib/forge-client/OverseerFetch.ts';

import { CONTRACT_VERSIONS } from '../shared/constants/ContractVersions.ts';

import {
  everyRecordedOverseerAnswerOf,
  everyRecordedVersionsAnswerOf,
  FLINT_BRAIN_SITUATIONS,
  OVERSEER_SITUATIONS,
  recordedFlintBrainAnswersOf,
  recordedOverseerAnswersOf,
  recordedVersionsAnswersOf,
  recordedOverseerFetch,
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  VERSIONS_SITUATIONS,
  type FlintBrainSituation,
  type RecordedOverseerAnswer,
} from './RecordedAnswers.ts';

const OVERSEER_URL = 'http://127.0.0.1:4951/';
const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token';

function identityRequest(): OverseerRequest {
  return {
    overseerUrl: OVERSEER_URL, method: 'GET', path: '/api/v1/identity', bearerToken: null, jsonBody: null, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS,
  };
}

function monitorStreamRequest(): OverseerStreamRequest {
  return {
    overseerUrl: OVERSEER_URL, path: '/api/v2/monitor/events', bearerToken: EXAMPLE_TOKEN, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS,
  };
}

const MONITOR_STREAM_CALL_SHAPE = 'STREAM /api/v2/monitor/events with bearer';

function streamAnswers(chunks: readonly string[], ending: 'closed' | 'broken' | 'stays-open'): RecordedOverseerAnswer[] {
  return [{ callShape: MONITOR_STREAM_CALL_SHAPE, answer: { verdict: 'streaming', chunks, ending } }];
}

describe('the call shapes', () => {
  test('name the method, the path and whether a bearer travels, and the stream apart', () => {
    expect(requestCallShapeOf(identityRequest())).toBe('GET /api/v1/identity');
    expect(requestCallShapeOf({ method: 'POST', path: '/api/commands', bearerToken: EXAMPLE_TOKEN })).toBe('POST /api/commands with bearer');
    expect(streamCallShapeOf(monitorStreamRequest())).toBe(MONITOR_STREAM_CALL_SHAPE);
    expect(situationCallShapeOf('stopped', 'GET /api/identity')).toBe('stopped: GET /api/identity');
  });
});

describe('the recorded overseer answers', () => {
  test('lead every call shape with a known situation, once over both recordings', () => {
    const callShapes = everyRecordedOverseerAnswerOf().map(({ callShape }) => callShape);
    const situations = [...OVERSEER_SITUATIONS, ...FLINT_BRAIN_SITUATIONS];
    for (const callShape of callShapes) expect([callShape, situations.some((situation) => callShape.startsWith(situationCallShapeOf(situation, '')))]).toEqual([callShape, true]);
    expect(new Set(callShapes).size).toBe(callShapes.length);
  });

  test('call every endpoint at its versioned path, and only /api/versions unversioned', () => {
    const paths = new Set(everyRecordedOverseerAnswerOf().map(({ callShape }) => callShape.split(' ')[2]));
    expect([...paths].filter((path) => path !== '/api/versions' && !/^\/api\/v[1-9]\d*\//.test(path ?? ''))).toEqual([]);
  });

  test('answer the versions in every situation whose identity is recorded, since a watch asks them first', () => {
    const callShapes = new Set(everyRecordedOverseerAnswerOf().map(({ callShape }) => callShape));
    for (const identityShape of [...callShapes].filter((callShape) => callShape.endsWith(': GET /api/v1/identity'))) {
      const versionsShape = identityShape.replace(': GET /api/v1/identity', ': GET /api/versions');
      expect([versionsShape, callShapes.has(versionsShape)]).toEqual([versionsShape, true]);
    }
  });

  test('hold an answer of each situation', () => {
    for (const situation of OVERSEER_SITUATIONS) expect(recordedOverseerAnswersOf(situation).length).toBeGreaterThan(0);
  });

  test('fail the spec for an OS with no recording, naming the command that takes it', () => {
    expect(() => recordedOverseerAnswersOf('serving', 'example-os')).toThrow('overseer-fetch-supported-forge has no recording for example-os');
    expect(() => recordedOverseerAnswersOf('serving', 'example-os')).toThrow('`bun run record overseer-fetch-supported-forge`');
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
  const programsThatAreNoForge = ['port-held-by-another-program', 'snapshot-unreadable', 'stream-cut-inside-event'] as const;
  const everyDocument = (): readonly Record<string, unknown>[] => documentsAnsweredIn(
    [...everyRecordedOverseerAnswerOf(), ...everyRecordedVersionsAnswerOf()]
      .filter(({ callShape }) => !programsThatAreNoForge.some((situation) => callShape.startsWith(situationCallShapeOf(situation, '')))),
  );

  test('hold every forge snapshot at the one monitor number Gaia reads', () => {
    const monitorVersions = new Set(everyDocument().flatMap((document) => (Object.hasOwn(document, 'monitorVersion') ? [document['monitorVersion']] : [])));
    expect([...monitorVersions]).toEqual([CONTRACT_VERSIONS.forgeMonitor]);
  });

  test('hold every forge identity naming, and every command answered at, the one control number Gaia sends', () => {
    // Forge 1.1 carries Flint's brain's commands under the control number it froze for clients built for 1.0.
    const documents = everyDocument();
    const controlOf = (document: Record<string, unknown>): unknown => (document['contracts'] as { control?: unknown }).control;
    const identityControlVersions = new Set(documents.flatMap((document) => (Object.hasOwn(document, 'contracts') ? [controlOf(document)] : [])));
    const answerControlVersions = new Set(documents.flatMap((document) => (Object.hasOwn(document, 'controlVersion') ? [document['controlVersion']] : [])));
    expect([[...identityControlVersions], [...answerControlVersions]]).toEqual([[CONTRACT_VERSIONS.forgeControl], [CONTRACT_VERSIONS.forgeControl]]);
  });
});

describe('the recorded states of Flint\'s brain', () => {
  test('hold for each state the versions, the identity, the monitor, its stream and the command that brought the brain there', () => {
    for (const situation of FLINT_BRAIN_SITUATIONS) {
      expect([situation, recordedFlintBrainAnswersOf(situation).map(({ callShape }) => callShape).sort()]).toEqual([situation, [
        'GET /api/v1/identity',
        'GET /api/v2/monitor with bearer',
        'GET /api/versions',
        'POST /api/v1/commands with bearer',
        MONITOR_STREAM_CALL_SHAPE,
      ]]);
    }
  });

  test('serve the brain running with a move, ended, refused with overseer-paused, and absent as null, each at monitor 3 and the control Gaia sends', () => {
    const brainOf = (situation: FlintBrainSituation): unknown => {
      const answers = recordedFlintBrainAnswersOf(situation);
      const answersOfCall = (callShape: string): readonly RecordedOverseerAnswer[] => answers.filter((answer) => answer.callShape === callShape);
      const [identity] = documentsAnsweredIn(answersOfCall('GET /api/v1/identity'));
      const [command] = documentsAnsweredIn(answersOfCall('POST /api/v1/commands with bearer'));
      expect([situation, identity?.['contracts'], command?.['controlVersion']]).toEqual([
        situation,
        expect.objectContaining({ monitor: CONTRACT_VERSIONS.forgeMonitor, control: CONTRACT_VERSIONS.forgeControl }),
        CONTRACT_VERSIONS.forgeControl,
      ]);
      const [monitorSnapshot] = documentsAnsweredIn(answersOfCall('GET /api/v2/monitor with bearer'));
      // A stream read from a forge may carry earlier states before the one the brain was brought into; its last event holds that one.
      const lastStreamSnapshot = documentsAnsweredIn(answersOfCall(MONITOR_STREAM_CALL_SHAPE)).at(-1);
      for (const snapshot of [monitorSnapshot, lastStreamSnapshot]) expect(snapshot?.['monitorVersion']).toBe(CONTRACT_VERSIONS.forgeMonitor);
      return [monitorSnapshot?.['flintBrain'], lastStreamSnapshot?.['flintBrain']];
    };
    expect(brainOf('brain-running')).toEqual([
      expect.objectContaining({ state: 'running', startedBy: 'api', recentMoves: [expect.objectContaining({ intent: expect.any(String) })] }),
      expect.objectContaining({ state: 'running' }),
    ]);
    expect(brainOf('brain-ended')).toEqual([expect.objectContaining({ state: 'ended', endedReason: 'stopped' }), expect.objectContaining({ state: 'ended' })]);
    expect(brainOf('brain-refused')).toEqual([
      expect.objectContaining({ state: 'refused', refusal: expect.objectContaining({ code: 'overseer-paused' }) }),
      expect.objectContaining({ state: 'refused' }),
    ]);
    expect(brainOf('no-flint')).toEqual([null, null]);
  });
});

describe('the recorded versions of forges', () => {
  test('lead every call shape with a versions situation, once', () => {
    const callShapes = everyRecordedVersionsAnswerOf().map(({ callShape }) => callShape);
    const ledBySituation = (callShape: string): boolean => VERSIONS_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, '')));
    for (const callShape of callShapes) expect([callShape, ledBySituation(callShape)]).toEqual([callShape, true]);
    expect(new Set(callShapes).size).toBe(callShapes.length);
  });

  test('hold, for a forge ahead that Gaia talks to, each endpoint at its versioned path, and only the versions for a forge it cannot talk to', () => {
    expect(recordedVersionsAnswersOf('versions-ahead').map(({ callShape }) => callShape).sort()).toEqual([
      'GET /api/v1/identity',
      'GET /api/v2/monitor with bearer',
      'GET /api/versions',
      'POST /api/v1/commands with bearer',
      'POST /api/v1/session-codes with bearer',
      'STREAM /api/v2/monitor/events with bearer',
    ]);
    for (const situation of ['versions-newer', 'versions-older', 'versions-absent'] as const) {
      expect([situation, recordedVersionsAnswersOf(situation).map(({ callShape }) => callShape)]).toEqual([situation, ['GET /api/versions']]);
    }
  });

  test('answer a forge that serves no versions as every forge before 1.0 answers an unknown path', () => {
    expect(recordedVersionsAnswersOf('versions-absent').map(({ answer }) => answer)).toEqual([{ verdict: 'answered', status: 404, bodyText: '{"refusal":"not-found"}' }]);
  });
});

describe('the recorded overseer fetch', () => {
  test('answers the identity of a forge that serves with the answer recorded for it', async () => {
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
      ...identityRequest(), method: 'POST', path: '/api/v1/commands', bearerToken: EXAMPLE_TOKEN, jsonBody: '{"kind":"overseer-pause"}',
    };
    await overseerFetch.request(commandRequest);
    await overseerFetch.openStream(monitorStreamRequest());
    expect(overseerFetch.callsAnswered()).toEqual([
      { callShape: 'POST /api/v1/commands with bearer', bearerToken: EXAMPLE_TOKEN, jsonBody: '{"kind":"overseer-pause"}' },
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
