/**
 * The real-system spec of overseer-fetch against a forge that publishes its system version (V1 to V3), run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-versions` with the program of such a forge. It starts that forge
 * under a scratch home in a scratch repository and records `GET /api/versions` and each endpoint at its versioned path as
 * `versions-current`. Until a forge serves them, the recording is authored from those requirements: also the forges ahead of, behind and
 * too new for this Gaia, and what a forge before V1 answers `GET /api/versions` in each situation of the other recordings, as forge
 * `317e5de1` answers any unknown API path (404, `not-found`), which a recording of those forges then takes over.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { recordAnswer, recordSystemVersion }                            from '../../testing/BoundaryRecordings.ts';
import { requestCallShapeOf, situationCallShapeOf }                     from '../../testing/RecordedAnswers.ts';
import { createScratchForge, type ScratchForge }                        from '../../testing/ScratchForge.ts';
import { ApiPathUtil }                                                  from '../api-paths/ApiPathUtil.ts';
import { forgeEndpointVersionOf }                                       from './ForgeClient.ts';
import { realOverseerFetch, type OverseerAnswer, type OverseerRequest } from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch-versions';
const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const STOREFRONT = { root: '/Users/alexexample/development/example-storefront', trackerId: 'example-storefront-7c41', overseerAddress: '127.0.0.1:4951' } as const;

let scratchForge: ScratchForge;
let overseerUrl = '';
let bearerToken = '';
const keptAnswers: { readonly callShape: string; readonly answer: OverseerAnswer }[] = [];

function requestOf(method: OverseerRequest['method'], path: string, token: string | null): OverseerRequest {
  return {
    overseerUrl, method, path, bearerToken: token, jsonBody: null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

async function keepAnswerTo(request: OverseerRequest): Promise<OverseerAnswer> {
  const answer = await realOverseerFetch().request(request);
  const exampleAnswer = answer.verdict === 'answered' ? { ...answer, bodyText: scratchForge.exampleTextOf(answer.bodyText) } : answer;
  keptAnswers.push({ callShape: situationCallShapeOf('versions-current', requestCallShapeOf(request)), answer: exampleAnswer });
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
  for (const { callShape, answer } of keptAnswers.splice(0)) recordAnswer(RECORDING_NAME, callShape, answer);
  await scratchForge.remove();
}, SETUP_TIMEOUT_MILLISECONDS);

describe('a forge that publishes its versions', () => {
  test('answers its system version and its minimum supported at the unversioned /api/versions', async () => {
    const answer = await keepAnswerTo(requestOf('GET', ApiPathUtil.VERSIONS_PATH, null));
    expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
    const versions = answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as { current: { major: number; minor: number } } : null;
    expect(versions).toMatchObject({ current: { major: expect.any(Number), minor: expect.any(Number) }, minimumSupported: expect.any(Object) });
    recordSystemVersion(RECORDING_NAME, `system version ${String(versions?.current.major)}.${String(versions?.current.minor)}`);
  });

  test('answers its identity, its monitor and a session code at the versioned paths this Gaia calls', async () => {
    const identity = await keepAnswerTo(requestOf('GET', ApiPathUtil.versionedPathOf('identity', forgeEndpointVersionOf('identity')), null));
    const monitor = await keepAnswerTo(requestOf('GET', ApiPathUtil.versionedPathOf('monitor', forgeEndpointVersionOf('monitor')), bearerToken));
    const sessionCode = await keepAnswerTo(requestOf('POST', ApiPathUtil.versionedPathOf('session-codes', forgeEndpointVersionOf('sessionCodes')), bearerToken));
    for (const answer of [identity, monitor, sessionCode]) expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
  });
});
