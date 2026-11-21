/**
 * The board route over Example Storefront's recorded board. What matters: the board answers as the page's `BoardDocument`, mapped from
 * the forge's document as Gaia's model reads it, never stored; reads of one forge are shared, so a burst of requests while a read is on
 * its way costs one more read, never one each, and a request after it reads afresh; each way the forge cannot be read is its own refusal,
 * a document that does not ingest logged with its keys; and the token is in no answer and no log line.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { BoardStateIngestion }                                                       from '../../../adapters/forge-api/BoardStateIngestion.ts';
import { recordedBoardDocumentOf }                                                   from '../../../adapters/forge-api/testing/BoardDocuments.ts';
import { BoardDocumentMapUtil }                                                      from '../../../adapters/page-api/BoardDocumentMapUtil.ts';
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

function routeOver(overseerFetch: RecordedOverseerFetch, options: ExampleRelayForgeOptions = {}): BoardStateRoute {
  return createBoardStateRoute(relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), overseerFetch), (entry) => {
    logEntries.push(entry);
  });
}

async function expectedBoardDocumentOf(situation: 'board-at-work' | 'board-install-held'): Promise<unknown> {
  const reading = new BoardStateIngestion().boardOf(STOREFRONT_TRACKER_ID, await recordedBoardDocumentOf(situation));
  if (reading.board === null) throw new Error(`The ${situation} board does not ingest.`);
  return JSON.parse(JSON.stringify(BoardDocumentMapUtil.boardDocumentOf(reading.board)));
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
