/**
 * The crash log route over Example Storefront's recorded crash log (`overseer-fetch-presence`). What matters: a live forge's log answers as
 * the page's `CrashLogDocument`, mapped from the forge's log as Gaia reads it; it is read once per start of the forge's Overseer, however
 * often it is asked; a log the forge does not have and a number that is none are not found; a forge whose Overseer does not answer, the one
 * off after a crash included, is refused and asked nothing more; and the token is in no answer.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { CrashLogIngestion }                                                            from '../../../adapters/forge-api/CrashLogIngestion.ts';
import { PRESENCE_RECORDING_CALL_SHAPES, recordedCrashLogBodyOf }                       from '../../../adapters/forge-api/testing/PresenceDocuments.ts';
import { CrashLogDocumentMapUtil }                                                      from '../../../adapters/page-api/CrashLogDocumentMapUtil.ts';
import { recordedOverseerFetch, recordedPresenceAnswersOf, type RecordedOverseerFetch } from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                                    from '../../../testing/ScratchRoot.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  stoppedForgeAnswering,
  type ExampleRelayForgeOptions,
} from '../testing/ExampleRelayForge.ts';
import { createForgeCrashLogRoute, type ForgeCrashLogRoute } from './ForgeCrashLogRoute.ts';

let scratchFolder = '';
let tokenPath = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('forge-crash-log-route');
  tokenPath     = exampleTokenFileIn(scratchFolder);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

function presenceAnswering(situation: 'presence-serving' | 'started-after-a-crash'): RecordedOverseerFetch {
  return recordedOverseerFetch(recordedPresenceAnswersOf(situation).filter(({ callShape }) => callShape === PRESENCE_RECORDING_CALL_SHAPES.crashLog));
}

function routeOver(overseerFetch: RecordedOverseerFetch, options: ExampleRelayForgeOptions = {}): ForgeCrashLogRoute {
  return createForgeCrashLogRoute(relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), overseerFetch), () => undefined);
}

describe('a crash log of a forge that serves again', () => {
  test('answers the log as the page reads it, read once however often it is asked', async () => {
    const overseerFetch = presenceAnswering('started-after-a-crash');
    const route = routeOver(overseerFetch);
    const { crashLog } = new CrashLogIngestion().crashLogOf(recordedCrashLogBodyOf('started-after-a-crash'));
    if (crashLog === null) throw new Error('the recorded crash log does not ingest');
    for (let ask = 0; ask < 2; ask += 1) {
      const answer = await route.answerFor(STOREFRONT_TRACKER_ID, '1');
      const body = await answer.text();
      expect([answer.status, JSON.parse(body)]).toEqual([200, CrashLogDocumentMapUtil.crashLogDocumentOf(crashLog)]);
      expect(body).not.toContain(EXAMPLE_FORGE_TOKEN);
    }
    expect(overseerFetch.callsAnswered()).toHaveLength(1);
  });

  test('is not found for a log the forge does not have, and for a number that is no whole number from one', async () => {
    const answer = await routeOver(presenceAnswering('presence-serving')).answerFor(STOREFRONT_TRACKER_ID, '1');
    expect([answer.status, await answer.json()]).toEqual([404, { refusal: 'not-found', refusedBy: 'gaia' }]);
    for (const writtenNumber of ['0', 'one', '-1']) {
      const refused = await routeOver(recordedOverseerFetch([])).answerFor(STOREFRONT_TRACKER_ID, writtenNumber);
      expect(refused.status).toBe(404);
    }
  });
});

describe('a forge that does not answer', () => {
  test('is forge-unreachable when its Overseer is gone, as after a crash', async () => {
    const answer = await routeOver(stoppedForgeAnswering([PRESENCE_RECORDING_CALL_SHAPES.crashLog])).answerFor(STOREFRONT_TRACKER_ID, '1');
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }]);
  });

  test('is refused and asked nothing when the watch reads it unreachable', async () => {
    const overseerFetch = recordedOverseerFetch([]);
    const answer = await routeOver(overseerFetch, { fidelity: 'unreachable' }).answerFor(STOREFRONT_TRACKER_ID, '1');
    expect([answer.status, await answer.json(), overseerFetch.callsAnswered()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }, []]);
  });
});
