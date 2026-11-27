/**
 * The real-system spec of hephaestus-fetch against forges at another system version than Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> GAIA_RECORDING_UNVERSIONED_FORGE_PROGRAM=<program> bun run record hephaestus-fetch-versions`. Each
 * situation is its own scratch forge; all are recorded in one run or none is.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { unversionedForgeProgramToRecordFrom } from '../../services/Environment.ts';
import { ForgeVersionsUtil }                   from '../../shared/utils/ForgeVersionsUtil.ts';
import { SystemVersionUtil }                   from '../../shared/utils/SystemVersionUtil.ts';
import { recordAnswer, recordSystemVersion }   from '../../testing/BoundaryRecordings.ts';
import {
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  VERSIONS_SITUATIONS,
  type RecordedStreamAnswer,
  type VersionsSituation,
} from '../../testing/RecordedAnswers.ts';
import { createScratchForge, forgeProgramToRun, type ScratchForge } from '../../testing/ScratchForge.ts';
import { scratchRoot }                                              from '../../testing/ScratchRoot.ts';
import { ApiPathUtil }                                              from '../api-paths/ApiPathUtil.ts';
import { forgeEndpointVersionOf, type HephaestusEndpointName }      from './ForgeClient.ts';
import {
  realHephaestusFetch,
  type HephaestusAnswer,
  type HephaestusRequest,
  type HephaestusStreamRequest,
} from './HephaestusFetch.ts';
import { SUPPORTED_FORGE_VERSION } from './constants/SupportedForgeVersions.ts';

const RECORDING_NAME = 'hephaestus-fetch-versions';
const FORGES_SETUP_TIMEOUT_MILLISECONDS = 240_000;
const REMOVAL_TIMEOUT_MILLISECONDS = 120_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUCCESS_STATUS = 200;
const NOT_FOUND_STATUS = 404;
/** Forge's test setting, `<current>/<minimum supported>`; empty reads as unset, so no setting of the recording's own shell reaches a forge. */
const VERSIONS_ANSWER_VARIABLE = 'FORGE_VERSIONS_ANSWER';
const OLDER_VERSIONS_ANSWER = '1.0/0.0';
/** One minor ahead of the version Gaia supports, still serving it. */
const AHEAD_VERSIONS_ANSWER = `${SUPPORTED_FORGE_VERSION.major}.${SUPPORTED_FORGE_VERSION.minor + 1}/${SUPPORTED_FORGE_VERSION.major}.0`;
/** The next major, which serves no client of the major Gaia supports. */
const NEWER_VERSIONS_ANSWER = `${SUPPORTED_FORGE_VERSION.major + 1}.1/${SUPPORTED_FORGE_VERSION.major + 1}.0`;
const VERSIONS_ANSWER_UNSET = '';
const MONITOR_EVENT_PATTERN = /event: monitor\ndata: [^\n]*\n\n/;
const STOREFRONT = {
  root:              '/Users/alexexample/development/example-storefront',
  trackerId:         'example-storefront-7c41',
  hephaestusAddress: '127.0.0.1:4951',
  processId:         48_107,
} as const;

interface SituationForge {
  readonly scratchForge:       ScratchForge;
  readonly hephaestusUrl:      string;
  readonly bearerToken:        string;
  /** The forge's install and code versions, as `forge version --json` answers them. */
  readonly programVersionText: string;
}

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    HephaestusAnswer | RecordedStreamAnswer;
}

const createdForges: ScratchForge[] = [];
const situationForges = new Map<VersionsSituation, SituationForge>();
const keptAnswers: KeptAnswer[] = [];

function versionedPathOf(endpointName: HephaestusEndpointName, endpoint: string): string {
  return ApiPathUtil.versionedPathOf(endpoint, forgeEndpointVersionOf(endpointName));
}

function situationForgeOf(situation: VersionsSituation): SituationForge {
  const situationForge = situationForges.get(situation);
  if (situationForge === undefined) throw new Error(`No scratch forge was started for ${situation}.`);
  return situationForge;
}

interface LiveProcessBlock {
  readonly url:       string;
  readonly processId: number;
  readonly tokenPath: string;
}

function isLiveProcessBlock(value: unknown): value is LiveProcessBlock {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as Record<string, unknown>;
  return typeof block['url'] === 'string' && typeof block['processId'] === 'number' && typeof block['tokenPath'] === 'string';
}

/** The block a registry entry holds while its forge serves, found by its shape: a forge from before system versions names its key otherwise. */
function liveProcessBlockIn(registryEntry: Record<string, unknown> | null): LiveProcessBlock | null {
  return Object.values(registryEntry ?? {}).find(isLiveProcessBlock) ?? null;
}

/** Starts a forge on a new board in a scratch repository of its own, every value it draws given its example. */
async function startedForge(program: string, versionsAnswer: string): Promise<SituationForge> {
  const scratchForge = createScratchForge(RECORDING_NAME, { program, forgeVariables: { [VERSIONS_ANSWER_VARIABLE]: versionsAnswer } });
  createdForges.push(scratchForge);
  const repository = await scratchForge.createRepository('example-storefront');
  scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
  const trackerIdDrawn = String(initialised['trackerId']);
  scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
  await scratchForge.runForDocument(repository, ['start', '--json']);
  const hephaestus = liveProcessBlockIn(scratchForge.registryEntryOf(trackerIdDrawn));
  if (hephaestus === null) throw new Error('the registry names no live Hephaestus');
  scratchForge.exampleValueFor({ drawn: new URL(hephaestus.url).host, example: STOREFRONT.hephaestusAddress });
  scratchForge.exampleValueFor({ drawn: `"processId":${hephaestus.processId}`, example: `"processId":${STOREFRONT.processId}` });
  scratchForge.exampleValueFor({ drawn: `process ${hephaestus.processId}`, example: `process ${STOREFRONT.processId}` });
  const { installVersion, codeVersion } = await scratchForge.runForDocument(repository, ['version', '--json']);
  return {
    scratchForge,
    hephaestusUrl:      hephaestus.url,
    bearerToken:        (await Bun.file(hephaestus.tokenPath).text()).trim(),
    programVersionText: `install version ${String(installVersion)}, code ${String(codeVersion)}`,
  };
}

function requestOf(situation: VersionsSituation, method: HephaestusRequest['method'], path: string, jsonBody: string | null = null): HephaestusRequest {
  const { hephaestusUrl, bearerToken } = situationForgeOf(situation);
  const pathIsOpen = path === ApiPathUtil.VERSIONS_PATH || path === versionedPathOf('identity', 'identity');
  return {
    hephaestusUrl,
    method,
    path,
    bearerToken:         pathIsOpen ? null : bearerToken,
    jsonBody,
    byteBody:            null,
    answerAs:            'text',
    timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function exampleAnswerOf(scratchForge: ScratchForge, answer: HephaestusAnswer | RecordedStreamAnswer): HephaestusAnswer | RecordedStreamAnswer {
  if (answer.verdict === 'answered') return { ...answer, bodyText: scratchForge.exampleTextOf(answer.bodyText) };
  if (answer.verdict === 'streaming') return { ...answer, chunks: answer.chunks.map((chunk) => scratchForge.exampleTextOf(chunk)) };
  return answer;
}

function keep(situation: VersionsSituation, callShape: string, answer: HephaestusAnswer | RecordedStreamAnswer): void {
  keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer: exampleAnswerOf(situationForgeOf(situation).scratchForge, answer) });
}

async function keepAnswerTo(situation: VersionsSituation, request: HephaestusRequest): Promise<HephaestusAnswer> {
  const answer = await realHephaestusFetch().request(request);
  keep(situation, requestCallShapeOf(request), answer);
  return answer;
}

/** Keeps the forge's `/api/versions` answer and answers Gaia's verdict on it, or `null` when the forge serves no versions document. */
async function versionsOf(situation: VersionsSituation): Promise<{ readonly verdict: string; readonly currentText: string } | null> {
  const answer = await keepAnswerTo(situation, requestOf(situation, 'GET', ApiPathUtil.VERSIONS_PATH));
  expect(answer).toMatchObject({ verdict: 'answered' });
  if (answer.verdict !== 'answered' || answer.status === NOT_FOUND_STATUS) return null;
  const document = SystemVersionUtil.versionsDocumentOf(JSON.parse(answer.bodyText));
  if (document === null) throw new Error(`/api/versions answered no versions document: ${answer.bodyText}`);
  return { verdict: ForgeVersionsUtil.forgeVersionsOf(document, SUPPORTED_FORGE_VERSION).verdict, currentText: SystemVersionUtil.textOf(document.current) };
}

function stampText(): string {
  const { programVersionText } = situationForgeOf('versions-ahead');
  const versionsAnswers = `${OLDER_VERSIONS_ANSWER}, ${AHEAD_VERSIONS_ANSWER} and ${NEWER_VERSIONS_ANSWER} through ${VERSIONS_ANSWER_VARIABLE}`;
  return `${programVersionText}, answering ${versionsAnswers}; `
    + `before system versions: ${situationForgeOf('versions-absent').programVersionText}`;
}

beforeAll(async () => {
  const forgeProgram = forgeProgramToRun(RECORDING_NAME);
  const unversionedForgeProgram = unversionedForgeProgramToRecordFrom();
  if (unversionedForgeProgram === null) {
    throw new Error(`Name a forge from before system versions too: GAIA_RECORDING_UNVERSIONED_FORGE_PROGRAM=<path> bun run record ${RECORDING_NAME}.`);
  }
  situationForges.set('versions-older', await startedForge(forgeProgram, OLDER_VERSIONS_ANSWER));
  situationForges.set('versions-ahead', await startedForge(forgeProgram, AHEAD_VERSIONS_ANSWER));
  situationForges.set('versions-newer', await startedForge(forgeProgram, NEWER_VERSIONS_ANSWER));
  situationForges.set('versions-absent', await startedForge(unversionedForgeProgram, VERSIONS_ANSWER_UNSET));
}, FORGES_SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  const recorded = keptAnswers.splice(0);
  const scratchPathsLeft = recorded.filter(({ answer }) => JSON.stringify(answer).includes(scratchRoot()));
  if (scratchPathsLeft.length === 0 && situationForges.size === VERSIONS_SITUATIONS.length) {
    for (const { callShape, answer } of recorded) recordAnswer(RECORDING_NAME, callShape, answer);
    recordSystemVersion(RECORDING_NAME, stampText());
  }
  for (const scratchForge of createdForges.splice(0)) await scratchForge.remove();
  if (scratchPathsLeft.length > 0) throw new Error(`A scratch path is left in ${scratchPathsLeft.map(({ callShape }) => callShape).join(', ')}: nothing is recorded.`);
}, REMOVAL_TIMEOUT_MILLISECONDS);

describe('forges at another system version than the one Gaia supports', () => {
  test('the forge set older by its test setting is older: its current is below the version Gaia supports', async () => {
    expect((await versionsOf('versions-older'))?.verdict).toBe('older');
  });

  test('the forge set newer by its test setting is newer: its minimum is above the version Gaia supports', async () => {
    expect((await versionsOf('versions-newer'))?.verdict).toBe('newer');
  });

  test('a forge from before system versions answers /api/versions as any unknown path, 404 not-found', async () => {
    expect(await versionsOf('versions-absent')).toBeNull();
    const absentAnswers = keptAnswers.filter(({ callShape }) => callShape.startsWith('versions-absent'));
    expect(absentAnswers.map(({ answer }) => answer)).toMatchObject([{ verdict: 'answered', status: NOT_FOUND_STATUS, bodyText: '{"refusal":"not-found"}' }]);
  });

  test('the forge set ahead by its test setting is ahead, and answers each versioned path Gaia calls', async () => {
    expect((await versionsOf('versions-ahead'))?.verdict).toBe('ahead');
    // A new board starts paused, so a resume is a command the forge carries out.
    const resumeBody = JSON.stringify({ kind: 'hephaestus-unpause' });
    const commandAnswer = await keepAnswerTo('versions-ahead', requestOf('versions-ahead', 'POST', versionedPathOf('commands', 'commands'), resumeBody));
    const readAnswers = [
      await keepAnswerTo('versions-ahead', requestOf('versions-ahead', 'GET', versionedPathOf('identity', 'identity'))),
      await keepAnswerTo('versions-ahead', requestOf('versions-ahead', 'GET', versionedPathOf('monitor', 'monitor'))),
    ];
    for (const answer of [commandAnswer, ...readAnswers]) expect(answer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
    expect(commandAnswer.verdict === 'answered' ? JSON.parse(commandAnswer.bodyText) as unknown : null).toMatchObject({ outcome: 'done' });
  });

  test('the forge set ahead streams its handshake and its first monitor event at the versioned path Gaia calls', async () => {
    const { hephaestusUrl, bearerToken } = situationForgeOf('versions-ahead');
    const streamRequest: HephaestusStreamRequest = {
      hephaestusUrl, path: versionedPathOf('monitorEvents', 'monitor/events'), bearerToken, lastEventId: null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    };
    const opening = await realHephaestusFetch().openStream(streamRequest);
    if (opening.verdict !== 'streaming') throw new Error(`the monitor stream answered ${JSON.stringify(opening)}`);
    const chunks: string[] = [];
    try {
      while (!MONITOR_EVENT_PATTERN.test(chunks.join(''))) {
        const chunk = await opening.stream.nextChunk();
        if (chunk.kind === 'ended') throw new Error(`the monitor stream ended ${chunk.ending} before its first monitor event`);
        chunks.push(chunk.text);
      }
    } finally {
      opening.stream.close();
    }
    expect(chunks.join('')).toStartWith('event: handshake\n');
    keep('versions-ahead', streamCallShapeOf(streamRequest), { verdict: 'streaming', chunks, ending: 'stays-open' });
  });
});
