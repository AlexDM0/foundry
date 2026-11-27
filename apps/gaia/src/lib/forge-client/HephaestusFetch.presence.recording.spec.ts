/**
 * The real-system spec of hephaestus-fetch against a forge's presence and crash logs, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record hephaestus-fetch-presence`. It starts Example Storefront under a scratch home, its fake
 * agent playing every session, with a draft ticket, an empty gate list stored, the Assistant switched on and the agent its board offers
 * chosen, and records its presence while it serves and a crash log it has none of; then, once the Assistant's job runs, kills its Hephaestus
 * from outside, starts it as User does, and records its presence after the crash and the crash log it wrote, which names the Assistant's job
 * as active. Neither recorded presence lists interrupted work: the Assistant's session outlives Hephaestus under Talos, so the waiting work
 * rests on written documents. The values the run draws are recorded as example values; the forge's install and code versions stamp it.
 */
import { readFileSync } from 'node:fs';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { SUPPORTED_FORGE_VERSION }           from '../../shared/constants/SupportedForgeVersions.ts';
import { recordAnswer, recordSystemVersion } from '../../testing/BoundaryRecordings.ts';
import {
  recordedFormOf,
  requestCallShapeOf,
  situationCallShapeOf,
  type PresenceSituation,
} from '../../testing/RecordedAnswers.ts';
import { agentAtTheFoundPlaceOf, createScratchForge, type ScratchForge }      from '../../testing/ScratchForge.ts';
import { scratchRoot }                                                        from '../../testing/ScratchRoot.ts';
import { forgeEndpointPathOf }                                                from './ForgeClient.ts';
import { realHephaestusFetch, type HephaestusAnswer, type HephaestusRequest } from './HephaestusFetch.ts';

const COMMANDS_PATH = forgeEndpointPathOf('commands', SUPPORTED_FORGE_VERSION);

const RECORDING_NAME = 'hephaestus-fetch-presence';
const SETUP_TIMEOUT_MILLISECONDS = 240_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUCCESS_STATUS = 200;
const STARTING_STATUS = 503;
const PRESENCE_LOOKS_AT_MOST = 120;
/** How long a look at a starting presence waits before the next: the forge classifies its start within its first pass. */
const PRESENCE_LOOK_INTERVAL_MILLISECONDS = 250;
const STOREFRONT = {
  root:              '/Users/alexexample/development/example-storefront',
  trackerId:         'example-storefront-7c41',
  hephaestusAddress: '127.0.0.1:4951',
  processId:         48_107,
} as const;
/** Forge's test setting that keeps each fake agent's session working until it is stopped, so a session that began is not done when Hephaestus dies. */
const FAKE_AGENT_KEEPS_WORKING_VARIABLE = 'FORGE_FAKE_AGENT_KEEPS_WORKING';
const DRAFT_TICKET_BODY = '## Brief\nPay for an example order in one step.\n\n## Acceptance\nA1. The example order is paid.\n';
/** A number no crash log of a fresh board has. */
const ABSENT_CRASH_LOG_NUMBER = 1;
const NUDGE_PATH = '/api/nudge';

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    HephaestusAnswer;
}

let scratchForge: ScratchForge;
let repository = '';
let trackerIdDrawn = '';
let hephaestusUrl = '';
let bearerToken = '';
const keptAnswers: KeptAnswer[] = [];

function requestOf(path: string): HephaestusRequest {
  return {
    hephaestusUrl, method: 'GET', path, bearerToken, jsonBody: null, byteBody: null, answerAs: 'text', timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function crashLogPathOf(crashLogNumber: number): string {
  return `${forgeEndpointPathOf('crashLog', SUPPORTED_FORGE_VERSION)}?${new URLSearchParams({ number: String(crashLogNumber) }).toString()}`;
}

async function keptAnswerOf(situation: PresenceSituation, path: string): Promise<HephaestusAnswer> {
  const request = requestOf(path);
  const answer = await realHephaestusFetch().request(request);
  keptAnswers.push({ callShape: situationCallShapeOf(situation, requestCallShapeOf(request)), answer });
  return answer;
}

/** Follows Hephaestus the registry names now: its address, its token and the example values its start drew. */
function followTheLiveHephaestus(): void {
  const hephaestus = scratchForge.registryEntryOf(trackerIdDrawn)?.['hephaestus'] as { url: string; processId: number; tokenPath: string } | undefined;
  if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus');
  hephaestusUrl = hephaestus.url;
  bearerToken = readFileSync(hephaestus.tokenPath, 'utf8').trim();
  scratchForge.exampleValueFor({ drawn: new URL(hephaestus.url).host, example: STOREFRONT.hephaestusAddress });
  scratchForge.exampleValueFor({ drawn: `"processId":${hephaestus.processId}`, example: `"processId":${STOREFRONT.processId}` });
  scratchForge.exampleValueFor({ drawn: bearerToken, example: 'example-token' });
}

/** The presence once the serving generation classified its start: before, it answers 503 `starting`. */
async function servedPresence(wanted: string, presenceShows: (presence: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  for (let look = 0; look < PRESENCE_LOOKS_AT_MOST; look += 1) {
    const answer = await realHephaestusFetch().request(requestOf(forgeEndpointPathOf('presence', SUPPORTED_FORGE_VERSION)));
    if (answer.verdict === 'answered' && answer.status === SUCCESS_STATUS) {
      const presence = JSON.parse(answer.bodyText) as Record<string, unknown>;
      if (presenceShows(presence)) return presence;
    } else if (answer.verdict !== 'answered' || answer.status !== STARTING_STATUS) {
      throw new Error(`The presence answered ${JSON.stringify(answer)}`);
    }
    await realHephaestusFetch().request({ ...requestOf(NUDGE_PATH), method: 'POST' });
    await Bun.sleep(PRESENCE_LOOK_INTERVAL_MILLISECONDS);
  }
  throw new Error(`The presence did not show ${wanted}.`);
}

/** Waits until the board lists the Assistant's job as running, so the crash log names a job active at the crash. */
async function boardWithAnAssistantJob(): Promise<void> {
  for (let look = 0; look < PRESENCE_LOOKS_AT_MOST; look += 1) {
    const answer = await realHephaestusFetch().request(requestOf(forgeEndpointPathOf('board', SUPPORTED_FORGE_VERSION)));
    if (answer.verdict !== 'answered' || answer.status !== SUCCESS_STATUS) throw new Error(`The board answered ${JSON.stringify(answer)}`);
    const { jobs } = JSON.parse(answer.bodyText) as { jobs: { role: string; state: string }[] };
    if (jobs.some((job) => job.role === 'assistant' && job.state === 'running')) return;
    await realHephaestusFetch().request({ ...requestOf(NUDGE_PATH), method: 'POST' });
    await Bun.sleep(PRESENCE_LOOK_INTERVAL_MILLISECONDS);
  }
  throw new Error('The board did not list the Assistant\'s job as running.');
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
  await scratchForge.runForDocument(repository, ['ticket', 'add', 'Example checkout page', '--type', 'ticket', '--body', DRAFT_TICKET_BODY, '--json']);
  // The Assistant's switch needs a stored pipeline, and a new board's Assistant is off: switched on, a job is at work when Hephaestus dies.
  await scratchForge.runForDocument(repository, ['gate', 'none', '--json']);
  await scratchForge.runForDocument(repository, ['gate', 'assistant', 'on', '--json']);
  await scratchForge.runForDocument(repository, ['start', '--json']);
  followTheLiveHephaestus();
  // A forge with no agent chosen launches no job: the board's agent is the one it offers at a found place.
  const board = await realHephaestusFetch().request(requestOf(forgeEndpointPathOf('board', SUPPORTED_FORGE_VERSION)));
  if (board.verdict !== 'answered' || board.status !== SUCCESS_STATUS) throw new Error(`The board answered ${JSON.stringify(board)}`);
  const agentChoice = { kind: 'pipeline-agent-set', agent: agentAtTheFoundPlaceOf(JSON.parse(board.bodyText) as Record<string, unknown>) };
  const agentChosen = await realHephaestusFetch().request({ ...requestOf(COMMANDS_PATH), method: 'POST', jsonBody: JSON.stringify(agentChoice) });
  expect(agentChosen).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
  const resumed = await realHephaestusFetch().request({ ...requestOf(COMMANDS_PATH), method: 'POST', jsonBody: JSON.stringify({ kind: 'hephaestus-unpause' }) });
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
    const presenceAnswer = await keptAnswerOf('presence-serving', forgeEndpointPathOf('presence', SUPPORTED_FORGE_VERSION));
    expect(presenceAnswer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    const absentLog = await keptAnswerOf('presence-serving', crashLogPathOf(ABSENT_CRASH_LOG_NUMBER));
    expect(absentLog).toMatchObject({ verdict: 'answered', status: 404 });
  }, SETUP_TIMEOUT_MILLISECONDS);

  test('lists the crash log of a crash after User started it again, and serves that log', async () => {
    const hephaestus = scratchForge.registryEntryOf(trackerIdDrawn)?.['hephaestus'] as { processId: number } | undefined;
    if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus to crash');
    await boardWithAnAssistantJob();
    process.kill(hephaestus.processId, 'SIGKILL');
    await scratchForge.runForDocument(repository, ['start', '--json']);
    followTheLiveHephaestus();
    const presence = await servedPresence('the crash log of the crash', (served) => jobsOf(served, 'crashLogs').length > 0);
    const presenceAnswer = await keptAnswerOf('started-after-a-crash', forgeEndpointPathOf('presence', SUPPORTED_FORGE_VERSION));
    expect(presenceAnswer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    const [crashLogEntry] = jobsOf(presence, 'crashLogs') as { number: number }[];
    const crashLog = await keptAnswerOf('started-after-a-crash', crashLogPathOf(crashLogEntry?.number ?? ABSENT_CRASH_LOG_NUMBER));
    expect(crashLog).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    console.log(`The presence after the crash lists ${jobsOf(presence, 'interruptedWork').length} interrupted jobs.`);
  }, SETUP_TIMEOUT_MILLISECONDS);
});
