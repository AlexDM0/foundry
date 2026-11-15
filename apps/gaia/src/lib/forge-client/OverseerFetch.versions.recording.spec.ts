/**
 * The real-system spec of overseer-fetch against a forge at another system version than the one Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-versions` with the program of such a forge. It starts that forge
 * under a scratch home in a scratch repository and records what it answers at `GET /api/versions` as the situation that answer names:
 * `versions-absent` for a forge that serves no versions, as every released forge answers any unknown API path (404, `not-found`), and
 * otherwise `versions-ahead`, `versions-newer` or `versions-older`; an ahead forge also at each versioned path Gaia calls. No forge at
 * those versions exists yet, so the recording is authored from the forge requirements V1 to V3, one forge per situation.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { ForgeVersionsUtil }                                                from '../../shared/utils/ForgeVersionsUtil.ts';
import { SystemVersionUtil }                                                from '../../shared/utils/SystemVersionUtil.ts';
import { recordAnswer, recordSystemVersion }                                from '../../testing/BoundaryRecordings.ts';
import { requestCallShapeOf, situationCallShapeOf, type VersionsSituation } from '../../testing/RecordedAnswers.ts';
import { createScratchForge, type ScratchForge }                            from '../../testing/ScratchForge.ts';
import { ApiPathUtil }                                                      from '../api-paths/ApiPathUtil.ts';
import { forgeEndpointVersionOf }                                           from './ForgeClient.ts';
import { realOverseerFetch, type OverseerAnswer, type OverseerRequest }     from './OverseerFetch.ts';
import { SUPPORTED_FORGE_VERSION }                                          from './constants/SupportedForgeVersions.ts';

const RECORDING_NAME = 'overseer-fetch-versions';
const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const NOT_FOUND_STATUS = 404;
const STOREFRONT = { root: '/Users/alexexample/development/example-storefront', trackerId: 'example-storefront-7c41', overseerAddress: '127.0.0.1:4951' } as const;

let scratchForge: ScratchForge;
let overseerUrl = '';
let bearerToken = '';
let situation: VersionsSituation = 'versions-absent';
const keptAnswers: { readonly callShape: string; readonly answer: OverseerAnswer }[] = [];

function requestOf(method: OverseerRequest['method'], path: string, token: string | null): OverseerRequest {
  return {
    overseerUrl, method, path, bearerToken: token, jsonBody: null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

async function keepAnswerTo(request: OverseerRequest): Promise<OverseerAnswer> {
  const answer = await realOverseerFetch().request(request);
  const exampleAnswer = answer.verdict === 'answered' ? { ...answer, bodyText: scratchForge.exampleTextOf(answer.bodyText) } : answer;
  keptAnswers.push({ callShape: requestCallShapeOf(request), answer: exampleAnswer });
  return answer;
}

beforeAll(async () => {
  scratchForge = createScratchForge(RECORDING_NAME);
  const repository = await scratchForge.createRepository('example-storefront');
  scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
  const trackerIdDrawn = String(initialised['trackerId']);
  scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
  await scratchForge.runForDocument(repository, ['start', '--json']);
  const overseer = scratchForge.registryEntryOf(trackerIdDrawn)?.['overseer'] as { url: string; tokenPath: string } | undefined;
  if (overseer === undefined) throw new Error('the registry names no live Overseer');
  overseerUrl = overseer.url;
  bearerToken = (await Bun.file(overseer.tokenPath).text()).trim();
  scratchForge.exampleValueFor({ drawn: new URL(overseer.url).host, example: STOREFRONT.overseerAddress });
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  for (const { callShape, answer } of keptAnswers.splice(0)) recordAnswer(RECORDING_NAME, situationCallShapeOf(situation, callShape), answer);
  await scratchForge.remove();
}, SETUP_TIMEOUT_MILLISECONDS);

describe('a forge at another system version than the one Gaia supports', () => {
  test('answers /api/versions with its versions, or as any unknown path when it serves none', async () => {
    const answer = await keepAnswerTo(requestOf('GET', ApiPathUtil.VERSIONS_PATH, null));
    expect(answer).toMatchObject({ verdict: 'answered' });
    const document = answer.verdict === 'answered' && answer.status !== NOT_FOUND_STATUS ? SystemVersionUtil.versionsDocumentOf(JSON.parse(answer.bodyText)) : null;
    if (document === null) {
      expect(answer).toMatchObject({ status: NOT_FOUND_STATUS });
      recordSystemVersion(RECORDING_NAME, 'no system version');
      return;
    }
    const { verdict } = ForgeVersionsUtil.forgeVersionsOf(document, SUPPORTED_FORGE_VERSION);
    expect(verdict).not.toBe('current');
    situation = `versions-${verdict === 'current' ? 'ahead' : verdict}`;
    recordSystemVersion(RECORDING_NAME, `system version ${SystemVersionUtil.textOf(document.current)}`);
  });

  test('answers its identity, its monitor and a session code at the versioned paths Gaia calls when it is ahead', async () => {
    if (situation !== 'versions-ahead') return;
    const identity = await keepAnswerTo(requestOf('GET', ApiPathUtil.versionedPathOf('identity', forgeEndpointVersionOf('identity')), null));
    const monitor = await keepAnswerTo(requestOf('GET', ApiPathUtil.versionedPathOf('monitor', forgeEndpointVersionOf('monitor')), bearerToken));
    const sessionCode = await keepAnswerTo(requestOf('POST', ApiPathUtil.versionedPathOf('session-codes', forgeEndpointVersionOf('sessionCodes')), bearerToken));
    for (const versionedAnswer of [identity, monitor, sessionCode]) expect(versionedAnswer).toMatchObject({ verdict: 'answered', status: 200 });
  });
});
