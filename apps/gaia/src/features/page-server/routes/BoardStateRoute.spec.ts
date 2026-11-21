/**
 * The board route over Example Storefront's recorded board. What matters: the board answers as the page's `BoardDocument`, mapped from
 * the forge's document as Gaia's model reads it, never stored; reads of one forge are shared, so a burst of requests while a read is on
 * its way costs one more read, never one each, and a request after it reads afresh; each way the forge cannot be read is its own refusal,
 * a document that does not ingest logged with its keys; a board with waiting work takes each job's wait from the presence the forge watch
 * reads, never a read of its own, and one without asks for none; and the token is in no answer and no log line.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import type { ForgePresenceDocument } from 'forge-contracts/ForgePresenceDocument';

import { BoardStateIngestion }                                                       from '../../../adapters/forge-api/BoardStateIngestion.ts';
import { PresenceIngestion, type PresenceReportReading }                             from '../../../adapters/forge-api/PresenceIngestion.ts';
import { recordedBoardDocumentOf }                                                   from '../../../adapters/forge-api/testing/BoardDocuments.ts';
import { BoardDocumentMapUtil }                                                      from '../../../adapters/page-api/BoardDocumentMapUtil.ts';
import { createMarkdownRenderer }                                                    from '../../../lib/markdown-render/MarkdownRenderer.ts';
import { recordedBoardAnswersOf, recordedOverseerFetch, type RecordedOverseerFetch } from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                                 from '../../../testing/ScratchRoot.ts';
import type { BoardRelayLogEntry }                                                   from '../@types/BoardRelayLogEntry.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  boardAnswering,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  stoppedForgeAnswering,
  type ExampleRelayForgeOptions,
} from '../testing/ExampleRelayForge.ts';
import { createBoardStateRoute, type BoardStateRoute } from './BoardStateRoute.ts';

const BOARD_CALL_SHAPE = 'GET /api/v1/board with bearer';
const BURST_OF_REQUESTS = 5;

let scratchFolder = '';
let tokenPath = '';
let logEntries: BoardRelayLogEntry[] = [];

beforeEach(() => {
  scratchFolder = createScratchDirectory('board-state-route');
  tokenPath     = exampleTokenFileIn(scratchFolder);
  logEntries    = [];
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

type PresenceReadAfterNow = (trackerId: string) => Promise<PresenceReportReading | null>;

function routeOver(overseerFetch: RecordedOverseerFetch, options: ExampleRelayForgeOptions = {}, presenceReadingAfterNow?: PresenceReadAfterNow): BoardStateRoute {
  const sources = relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), overseerFetch, undefined, presenceReadingAfterNow);
  return createBoardStateRoute(sources, (entry) => {
    logEntries.push(entry);
  });
}

async function expectedBoardDocumentOf(situation: 'board-at-work' | 'board-install-held'): Promise<unknown> {
  const reading = new BoardStateIngestion().boardOf(STOREFRONT_TRACKER_ID, await recordedBoardDocumentOf(situation));
  if (reading.board === null) throw new Error(`The ${situation} board does not ingest.`);
  return JSON.parse(JSON.stringify(BoardDocumentMapUtil.boardDocumentOf(reading.board, createMarkdownRenderer().renderMarkdown)));
}

describe('a forge\'s board', () => {
  test('answers the page\'s board document, mapped from the forge\'s, and never stored', async () => {
    const answer = await routeOver(boardAnswering('board-at-work')).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, answer.headers.get('cache-control'), answer.headers.get('content-type')]).toEqual([200, 'no-store', 'application/json;charset=utf-8']);
    expect(await answer.json()).toEqual(await expectedBoardDocumentOf('board-at-work'));
  });

  test('answers the board of a forge whose launches are held for an install change as the forge serves it', async () => {
    const answer = await routeOver(boardAnswering('board-install-held', (callShape) => callShape === BOARD_CALL_SHAPE)).answerFor(STOREFRONT_TRACKER_ID);
    expect(await answer.json()).toEqual(await expectedBoardDocumentOf('board-install-held'));
  });
});

describe('reads of one forge', () => {
  test('share one read for a burst of requests while a read is on its way, and map it once', async () => {
    const overseerFetch = boardAnswering('board-at-work');
    const route = routeOver(overseerFetch);
    const boardMapSpy = spyOn(BoardDocumentMapUtil, 'boardDocumentOf');
    try {
      const answers = await Promise.all(Array.from({ length: BURST_OF_REQUESTS }, () => route.answerFor(STOREFRONT_TRACKER_ID)));
      const documents = await Promise.all(answers.map((answer) => answer.json()));
      expect(new Set(documents.map((document) => JSON.stringify(document))).size).toBe(1);
      expect(overseerFetch.callsAnswered().map((call) => call.callShape)).toEqual([BOARD_CALL_SHAPE, BOARD_CALL_SHAPE]);
      expect(boardMapSpy).toHaveBeenCalledTimes(2);
    } finally {
      boardMapSpy.mockRestore();
    }
  });

  test('read afresh for a request that comes once the reads before it are done', async () => {
    const overseerFetch = boardAnswering('board-at-work');
    const route = routeOver(overseerFetch);
    await route.answerFor(STOREFRONT_TRACKER_ID);
    await route.answerFor(STOREFRONT_TRACKER_ID);
    expect(overseerFetch.callsAnswered()).toHaveLength(2);
  });
});

describe('a forge whose board cannot be read', () => {
  test('is forge-not-registered when the registry names no such forge, and is asked nothing', async () => {
    const overseerFetch = recordedOverseerFetch([]);
    const forge = exampleRelayForgeOf(scratchFolder, tokenPath);
    const route = createBoardStateRoute(relaySourcesOver(forge, overseerFetch, { verdict: 'readable', forges: [] }), () => undefined);
    const answer = await route.answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json(), overseerFetch.callsAnswered()]).toEqual([404, { refusal: 'forge-not-registered', refusedBy: 'gaia' }, []]);
  });

  test('is forge-unreachable when its Overseer does not answer', async () => {
    const answer = await routeOver(stoppedForgeAnswering([BOARD_CALL_SHAPE])).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }]);
  });

  test('is forge-version-unsupported for a forge at a version Gaia cannot talk to', async () => {
    const newer = { verdict: 'newer', current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } } as const;
    const answer = await routeOver(recordedOverseerFetch([]), { fidelity: 'newer-contract', versions: newer }).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json()]).toEqual([501, { refusal: 'forge-version-unsupported', refusedBy: 'gaia' }]);
  });

  test('is token-unreadable when the registry names no token file', async () => {
    const answer = await routeOver(recordedOverseerFetch([]), { tokenPath: null }).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'token-unreadable', refusedBy: 'gaia' }]);
  });

  test('is token-rejected when the Overseer refuses the token', async () => {
    const answer = await routeOver(boardAnswering('board-token-rejected', (callShape) => callShape === BOARD_CALL_SHAPE)).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'token-rejected', refusedBy: 'gaia' }]);
  });

  test('is forge-document-unreadable for a document that does not ingest, logged with the key it lacks', async () => {
    const recorded = recordedBoardAnswersOf('board-at-work').find(({ callShape }) => callShape === BOARD_CALL_SHAPE)?.answer;
    if (recorded?.verdict !== 'answered') throw new Error('The board-at-work situation holds no answered board.');
    const { overseer: _overseer, ...withoutOverseer } = JSON.parse(recorded.bodyText) as Record<string, unknown>;
    const notABoard = recordedOverseerFetch([{ callShape: BOARD_CALL_SHAPE, answer: { ...recorded, bodyText: JSON.stringify(withoutOverseer) } }]);
    const answer = await routeOver(notABoard).answerFor(STOREFRONT_TRACKER_ID);
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'forge-document-unreadable', refusedBy: 'gaia' }]);
    expect(logEntries).toEqual([{ kind: 'board-unreadable', trackerId: STOREFRONT_TRACKER_ID, invalidKeys: ['overseer'] }]);
  });
});

describe('a board that holds waiting work', () => {
  /** The forge watch's presence reader, served the document given: what it is asked for is counted by tracker id. */
  function watchPresenceServing(document: unknown): { readonly read: PresenceReadAfterNow; readonly askedFor: string[] } {
    const askedFor: string[] = [];
    const read: PresenceReadAfterNow = (trackerId) => {
      askedFor.push(trackerId);
      return Promise.resolve(new PresenceIngestion().presenceReportOf(document));
    };
    return { read, askedFor };
  }

  function boardAnswerWith(changeDocument: (document: Record<string, unknown> & { jobs: Record<string, unknown>[] }) => unknown) {
    const recorded = recordedBoardAnswersOf('board-at-work').find(({ callShape }) => callShape === BOARD_CALL_SHAPE)?.answer;
    if (recorded?.verdict !== 'answered') throw new Error('The board-at-work situation holds no answered board.');
    const document = JSON.parse(recorded.bodyText) as Record<string, unknown> & { jobs: Record<string, unknown>[] };
    return { recorded, bodyText: JSON.stringify(changeDocument(document)) };
  }

  function interruptedEveryJob(document: Record<string, unknown> & { jobs: Record<string, unknown>[] }, interruption: string): unknown {
    const jobs = document.jobs.map((job) => ({ ...job, state: 'interrupted', interruption }));
    return { ...document, jobs };
  }

  function presenceListing(jobId: string): ForgePresenceDocument {
    return {
      generation:  3,
      processId:   4242,
      codeVersion: 'example-code',
      startedAt:   '2026-11-21T01:00:00+01:00',
      startOrigin: 'user',
      lastStart:   {
        kind: 'first-start', previousGeneration: null, crashSuspected: false, crashLogNumber: null
      },
      heartbeat:       null,
      supervision:     'supervising',
      abandonedPasses: { inARow: 0, lastReason: null, lastAt: null },
      interruptedWork: [{
        jobId, kind: 'build', ticketIds: [], cause: 'network-outage', waitsFor: 'instruction', crashResumes: 0, automaticRestartsLeft: null
      }],
      heldMerges: [],
      crashLogs:  [],
      talos:      null,
    };
  }

  test('takes what each waiting job follows from the presence the forge watch reads, and a board without waiting work asks for none', async () => {
    const { recorded, bodyText } = boardAnswerWith((document) => interruptedEveryJob(document, 'network-outage'));
    const jobIds = (JSON.parse(bodyText) as { jobs: { id: string }[] }).jobs.map((job) => job.id);
    const [firstJobId] = jobIds;
    if (firstJobId === undefined) throw new Error('The recorded board holds a job.');
    const overseerFetch = recordedOverseerFetch([{ callShape: BOARD_CALL_SHAPE, answer: { ...recorded, bodyText } }]);
    const watchPresence = watchPresenceServing(presenceListing(firstJobId));
    const answer = await routeOver(overseerFetch, {}, watchPresence.read).answerFor(STOREFRONT_TRACKER_ID);
    const { jobs } = await answer.json() as { jobs: { id: string; waitsFor: string | null }[] };
    expect(jobs.map((job) => job.waitsFor)).toEqual(jobIds.map((jobId) => (jobId === firstJobId ? 'instruction' : null)));
    expect([overseerFetch.callsAnswered().map((call) => call.callShape), watchPresence.askedFor]).toEqual([[BOARD_CALL_SHAPE], [STOREFRONT_TRACKER_ID]]);
    const atWork = boardAnswering('board-at-work');
    const presenceOfBoardAtWork = watchPresenceServing(presenceListing(firstJobId));
    await routeOver(atWork, {}, presenceOfBoardAtWork.read).answerFor(STOREFRONT_TRACKER_ID);
    expect([atWork.callsAnswered().map((call) => call.callShape), presenceOfBoardAtWork.askedFor]).toEqual([[BOARD_CALL_SHAPE], []]);
  });

  test('leaves every wait unknown when the presence does not ingest, logged with the key it lacks', async () => {
    const { recorded, bodyText } = boardAnswerWith((document) => interruptedEveryJob(document, 'lease-ended'));
    const { interruptedWork: _interruptedWork, ...withoutWork } = presenceListing('J1');
    const overseerFetch = recordedOverseerFetch([{ callShape: BOARD_CALL_SHAPE, answer: { ...recorded, bodyText } }]);
    const route = routeOver(overseerFetch, {}, watchPresenceServing(withoutWork).read);
    const { jobs } = await (await route.answerFor(STOREFRONT_TRACKER_ID)).json() as { jobs: { waitsFor: string | null }[] };
    expect(jobs.every((job) => job.waitsFor === null)).toBe(true);
    expect(logEntries).toEqual([{ kind: 'presence-unreadable', trackerId: STOREFRONT_TRACKER_ID, invalidKeys: ['interruptedWork'] }]);
  });

  test('leaves every wait unknown when the forge watch follows no monitor of the forge', async () => {
    const { recorded, bodyText } = boardAnswerWith((document) => interruptedEveryJob(document, 'lease-ended'));
    const overseerFetch = recordedOverseerFetch([{ callShape: BOARD_CALL_SHAPE, answer: { ...recorded, bodyText } }]);
    const { jobs } = await (await routeOver(overseerFetch).answerFor(STOREFRONT_TRACKER_ID)).json() as { jobs: { waitsFor: string | null }[] };
    expect([jobs.every((job) => job.waitsFor === null), logEntries]).toEqual([true, []]);
  });
});

describe('the token', () => {
  test('is in no answer and no log line, whichever way the read ends', async () => {
    const routes = [
      routeOver(boardAnswering('board-at-work')),
      routeOver(boardAnswering('board-token-rejected', (callShape) => callShape === BOARD_CALL_SHAPE)),
      routeOver(stoppedForgeAnswering([BOARD_CALL_SHAPE])),
    ];
    const answerTexts = await Promise.all(routes.map(async (route) => {
      const answer = await route.answerFor(STOREFRONT_TRACKER_ID);
      return `${[...answer.headers.entries()].flat().join('\n')}\n${await answer.text()}`;
    }));
    expect(answerTexts.join('\n')).not.toContain(EXAMPLE_FORGE_TOKEN);
    expect(JSON.stringify(logEntries)).not.toContain(EXAMPLE_FORGE_TOKEN);
  });
});
