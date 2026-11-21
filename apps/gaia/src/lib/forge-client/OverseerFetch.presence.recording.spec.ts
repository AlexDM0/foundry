/**
 * The real-system spec of overseer-fetch against a forge's presence and crash logs, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-presence`. It starts Example Storefront under a scratch home, its fake
 * agent playing every session, readies a ticket, and records its presence while it serves and a crash log it has none of; then kills its
 * Overseer from outside, starts it as User does, and records its presence after the crash and the crash log it wrote. Neither recorded
 * presence lists interrupted work: the crash log's only active job is the Assistant launching, so the waiting work rests on written
 * documents. The values the run draws are recorded as example values; the forge's install and code versions stamp it.
 */
import { readFileSync } from 'node:fs';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { recordAnswer, recordSystemVersion } from '../../testing/BoundaryRecordings.ts';
import {
  recordedFormOf,
  requestCallShapeOf,
  situationCallShapeOf,
  type PresenceSituation,
} from '../../testing/RecordedAnswers.ts';
import { createScratchForge, type ScratchForge }                        from '../../testing/ScratchForge.ts';
import { scratchRoot }                                                  from '../../testing/ScratchRoot.ts';
import { forgeEndpointPathOf }                                          from './ForgeClient.ts';
import { realOverseerFetch, type OverseerAnswer, type OverseerRequest } from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch-presence';
const SETUP_TIMEOUT_MILLISECONDS = 240_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUCCESS_STATUS = 200;
const STARTING_STATUS = 503;
const PRESENCE_LOOKS_AT_MOST = 120;
/** How long a look at a starting presence waits before the next: the forge classifies its start within its first pass. */
const PRESENCE_LOOK_INTERVAL_MILLISECONDS = 250;
const STOREFRONT = {
  root:            '/Users/alexexample/development/example-storefront',
  trackerId:       'example-storefront-7c41',
  overseerAddress: '127.0.0.1:4951',
  processId:       48_107,
} as const;
/** Forge's test setting that keeps each fake agent's session working until it is stopped, so a session that began is not done when the Overseer dies. */
const FAKE_AGENT_KEEPS_WORKING_VARIABLE = 'FORGE_FAKE_AGENT_KEEPS_WORKING';
const READY_TICKET_BODY = '## Brief\nPay for an example order in one step.\n\n## Acceptance\nA1. The example order is paid.\n';
/** A number no crash log of a fresh board has. */
const ABSENT_CRASH_LOG_NUMBER = 1;
const NUDGE_PATH = '/api/nudge';

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    OverseerAnswer;
}

let scratchForge: ScratchForge;
let repository = '';
let trackerIdDrawn = '';
let overseerUrl = '';
let bearerToken = '';
const keptAnswers: KeptAnswer[] = [];

function requestOf(path: string): OverseerRequest {
  return {
    overseerUrl, method: 'GET', path, bearerToken, jsonBody: null, byteBody: null, answerAs: 'text', timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function crashLogPathOf(crashLogNumber: number): string {
  return `${forgeEndpointPathOf('crashLog')}?${new URLSearchParams({ number: String(crashLogNumber) }).toString()}`;
}

async function keptAnswerOf(situation: PresenceSituation, path: string): Promise<OverseerAnswer> {
  const request = requestOf(path);
  const answer = await realOverseerFetch().request(request);
  keptAnswers.push({ callShape: situationCallShapeOf(situation, requestCallShapeOf(request)), answer });
  return answer;
}

/** Follows the Overseer the registry names now: its address, its token and the example values its start drew. */
function followTheLiveOverseer(): void {
  const overseer = scratchForge.registryEntryOf(trackerIdDrawn)?.['overseer'] as { url: string; processId: number; tokenPath: string } | undefined;
  if (overseer === undefined) throw new Error('the registry names no live Overseer');
  overseerUrl = overseer.url;
  bearerToken = readFileSync(overseer.tokenPath, 'utf8').trim();
  scratchForge.exampleValueFor({ drawn: new URL(overseer.url).host, example: STOREFRONT.overseerAddress });
  scratchForge.exampleValueFor({ drawn: `"processId":${overseer.processId}`, example: `"processId":${STOREFRONT.processId}` });
  scratchForge.exampleValueFor({ drawn: bearerToken, example: 'example-token' });
}

/** The presence once the serving generation classified its start: before, it answers 503 `starting`. */
async function servedPresence(wanted: string, presenceShows: (presence: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  for (let look = 0; look < PRESENCE_LOOKS_AT_MOST; look += 1) {
    const answer = await realOverseerFetch().request(requestOf(forgeEndpointPathOf('presence')));
    if (answer.verdict === 'answered' && answer.status === SUCCESS_STATUS) {
      const presence = JSON.parse(answer.bodyText) as Record<string, unknown>;
      if (presenceShows(presence)) return presence;
    } else if (answer.verdict !== 'answered' || answer.status !== STARTING_STATUS) {
      throw new Error(`The presence answered ${JSON.stringify(answer)}`);
    }
    await realOverseerFetch().request({ ...requestOf(NUDGE_PATH), method: 'POST' });
    await Bun.sleep(PRESENCE_LOOK_INTERVAL_MILLISECONDS);
  }
  throw new Error(`The presence did not show ${wanted}.`);
}

function jobsOf(presence: Record<string, unknown>, key: string): unknown[] {
  const value = presence[key];
  return Array.isArray(value) ? value : [];
}

beforeAll(async () => {
  scratchForge = createScratchForge(RECORDING_NAME, { forgeVariables: { [FAKE_AGENT_KEEPS_WORKING_VARIABLE]: '1' } });
  repository = await scratchForge.createRepository('example-storefront');
  scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
  trackerIdDrawn = String(initialised['trackerId']);
  scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
  const added = await scratchForge.runForDocument(repository, ['ticket', 'add', 'Example checkout page', '--type', 'ticket', '--body', READY_TICKET_BODY, '--json']);
  const addedTicket = added['ticket'] as Record<string, unknown> | undefined;
  await scratchForge.runForDocument(repository, ['ticket', 'ready', String(addedTicket?.['id'] ?? added['id']), '--json']);
  await scratchForge.runForDocument(repository, ['start', '--json']);
  followTheLiveOverseer();
  const resumed = await realOverseerFetch().request({ ...requestOf(forgeEndpointPathOf('commands')), method: 'POST', jsonBody: JSON.stringify({ kind: 'overseer-resume' }) });
  expect(resumed).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
  const { installVersion, codeVersion } = await scratchForge.runForDocument(repository, ['version', '--json']);
  recordSystemVersion(RECORDING_NAME, `install version ${String(installVersion)}, code ${String(codeVersion)}`);
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  const recorded = keptAnswers.splice(0).map(({ callShape, answer }) => {
    const recordedAnswer = recordedFormOf(answer);
    return { callShape, answer: recordedAnswer.verdict === 'answered' ? { ...recordedAnswer, bodyText: scratchForge.exampleTextOf(recordedAnswer.bodyText) } : recordedAnswer };
  });
  const scratchPathsLeft = recorded.filter(({ answer }) => JSON.stringify(answer).includes(scratchRoot()));
  for (const { callShape, answer } of scratchPathsLeft.length === 0 ? recorded : []) recordAnswer(RECORDING_NAME, callShape, answer);
  await scratchForge.remove();
  if (scratchPathsLeft.length > 0) throw new Error(`A scratch path is left in ${scratchPathsLeft.map(({ callShape }) => callShape).join(', ')}: nothing is recorded.`);
}, SETUP_TIMEOUT_MILLISECONDS);

describe('a forge\'s presence and crash logs', () => {
  test('serves its presence while it supervises, and refuses a crash log it does not have', async () => {
    await servedPresence('a supervised board', (presence) => presence['supervision'] === 'supervising');
    const presenceAnswer = await keptAnswerOf('presence-serving', forgeEndpointPathOf('presence'));
    expect(presenceAnswer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    const absentLog = await keptAnswerOf('presence-serving', crashLogPathOf(ABSENT_CRASH_LOG_NUMBER));
    expect(absentLog).toMatchObject({ verdict: 'answered', status: 404 });
  }, SETUP_TIMEOUT_MILLISECONDS);

  test('lists the crash log of a crash after User started it again, and serves that log', async () => {
    const overseer = scratchForge.registryEntryOf(trackerIdDrawn)?.['overseer'] as { processId: number } | undefined;
    if (overseer === undefined) throw new Error('the registry names no live Overseer to crash');
    process.kill(overseer.processId, 'SIGKILL');
    await scratchForge.runForDocument(repository, ['start', '--json']);
    followTheLiveOverseer();
    const presence = await servedPresence('the crash log of the crash', (served) => jobsOf(served, 'crashLogs').length > 0);
    const presenceAnswer = await keptAnswerOf('started-after-a-crash', forgeEndpointPathOf('presence'));
    expect(presenceAnswer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    const [crashLogEntry] = jobsOf(presence, 'crashLogs') as { number: number }[];
    const crashLog = await keptAnswerOf('started-after-a-crash', crashLogPathOf(crashLogEntry?.number ?? ABSENT_CRASH_LOG_NUMBER));
    expect(crashLog).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    console.log(`The presence after the crash lists ${jobsOf(presence, 'interruptedWork').length} interrupted jobs.`);
  }, SETUP_TIMEOUT_MILLISECONDS);
});
