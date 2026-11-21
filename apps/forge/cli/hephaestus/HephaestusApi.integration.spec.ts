/**
 * Hephaestus's API end to end against a spawned Hephaestus on a scratch board, the fake agent playing every session. What matters: the
 * Baton names the token file and never holds the token, and that file's token is the one `POST /api/commands` accepts from an Origin-less
 * server request; a command answers 200, 409 worded or 400; `/api/state` carries the status document beside the page, jobs with live facts
 * and Hephaestus; `/api/summary` and `/api/monitor` have their fixtures' shapes, the monitor's only with the token and its stream starting
 * with the whole snapshot; `GET /` and every other path outside the API is a 404, and an answer lets no origin
 * frame it, whatever frame-ancestor record a monitor folder still holds; an event-stream client sees a `board` event for a ticket move and a `job`
 * event for each state the build job passes through, launching to running; and a picture uploaded with the token is stored owner-only by
 * the hash of its bytes, served back, refused worded at 413 or 415, and a command naming one the store lacks is refused `picture-unknown`; a
 * gate profile the board holds streams its output lines after the cursor, while a run it does not hold and a cursor that is no line number
 * are 404; and no forge runs Flint's brain: its two commands are malformed, its ask path is a 404 and the monitor holds no brain.
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import { FORGE_SYSTEM_VERSIONS } from 'forge-contracts/ForgeSystemVersions';

import { GateProfilesFile }                                                             from '../../src/adapters/pipeline/GateProfilesFile.ts';
import { GATE_PROFILE_RUNS_FOLDER }                                                     from '../../src/services/hephaestus/GateProfiling.ts';
import { PICTURE_SIZE_LIMIT_BYTES, PICTURES_PER_MESSAGE_LIMIT }                         from '../../src/shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }                                                                from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                      from '../../src/testing/ChildProcessCaseTimeout.ts';
import { COMMAND_LINE_FORM }                                                            from '../../src/testing/CommandLineForm.ts';
import { stopProcessesReachingInto }                                                    from '../../src/testing/ProcessesInFolder.ts';
import { recordAnswer }                                                                 from '../../src/testing/RecordedAnswers.ts';
import { useRecordedGit }                                                               from '../../src/testing/RecordedGit.ts';
import { type SharedRecordedGitFlow, shareRecordedGitFlow, withRecordedGitFirstOnPath } from '../../src/testing/RecordedGitProgram.ts';
import { HEPHAESTUS_CALL_SHAPES, HEPHAESTUS_PLACEHOLDERS, recordedHttpResponseOf }      from '../../src/testing/RecordedHephaestusFetch.ts';
import { createScratchDirectory, removeScratchDirectory }                               from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                                                                    from '../../src/testing/WaitUntil.ts';
import { runAgentProgress, startAgentProgress }                                         from '../testing/CliProcess.ts';
import { createInitializedRecordedGitRepository }                                       from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicketThrough }                                                       from '../testing/ReadyTicketFiling.ts';
import { COMMON_FOLDER_OUTSIDE }                                                        from '../testing/RecordedGitStages.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const SUMMARY_FIXTURE_PATH = join(import.meta.dir, '..', '..', 'src', 'services', 'hephaestus', 'testing', 'fixtures', 'summary-v2.json');
const MONITOR_FIXTURE_PATH = join(import.meta.dir, '..', '..', 'src', 'services', 'hephaestus', 'testing', 'fixtures', 'monitor-v5.json');

const recordedGit = useRecordedGit();

let repositoryDirectory = '';
let homeDirectory       = '';
let recordedFlow: SharedRecordedGitFlow | null = null;

interface StreamedEvent {
  kind: string;
  data: Record<string, unknown>;
}

function requireRecordedFlow(): SharedRecordedGitFlow {
  if (recordedFlow === null) throw new Error('the case shares no recorded git flow');
  return recordedFlow;
}

/** Every process of the case answers git from the case's flow: a binary through its preload, any other process through the `git` on its `PATH`. */
function childOptions() {
  const flow = requireRecordedFlow();
  return {
    currentDirectory:         repositoryDirectory,
    homeDirectory,
    environment:              withRecordedGitFirstOnPath({ PATH: dirname(process.execPath) }, flow),
    sharedRecordedGitAnswers: flow,
  };
}

/** The isolation check of a spawn asks git in the scratch home, which lies outside any repository; the flow answers its repository check. */
const ISOLATION_CHECKS = [COMMON_FOLDER_OUTSIDE];

async function run(commandLineArguments: readonly string[]) {
  return await recordedGit.playStage(ISOLATION_CHECKS, async () => {
    const finished = runAgentProgress(commandLineArguments, childOptions());
    return { finished };
  }).then(async ({ finished }) => await finished);
}

async function startHephaestus() {
  return await recordedGit.playStage(ISOLATION_CHECKS, async () => startAgentProgress(['start', '--foreground', '--port', '0'], childOptions()));
}

function hephaestusDirectory(): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus');
}

/** The newest Baton's token as a bearer header, which every data route needs. */
function tokenHeaders(): Record<string, string> {
  const batonFile = readdirSync(hephaestusDirectory()).filter((fileName) => /^baton-\d+\.json$/.test(fileName)).at(-1) ?? '';
  const { tokenFile } = JSON.parse(readFileSync(join(hephaestusDirectory(), batonFile), 'utf8')) as { tokenFile: string };
  return { authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` };
}

/** Collects every event a stream sends, until `stop` is called. */
function collectEvents(url: string, streamPath = 'api/events'): { events: StreamedEvent[]; stop: () => Promise<void> } {
  const events: StreamedEvent[] = [];
  const controller = new AbortController();
  const reading = (async () => {
    const response = await fetch(new URL(streamPath, url), { headers: tokenHeaders(), signal: controller.signal });
    const reader = response.body?.getReader();
    if (reader === undefined) return;
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      pending += decoder.decode(chunk.value);
      const blocks = pending.split('\n\n');
      pending = blocks.pop() ?? '';
      for (const block of blocks) {
        const kind = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (kind !== undefined && data !== undefined) events.push({ kind, data: JSON.parse(data) as Record<string, unknown> });
      }
    }
  })().catch(() => undefined);
  return {
    events,
    stop: async () => {
      controller.abort();
      await reading;
    },
  };
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus-api', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  recordedFlow = shareRecordedGitFlow(recordedGit);
  // Short, so the board's Talos endpoint under it fits the bytes macOS keeps for a socket path.
  homeDirectory = createScratchDirectory('api-home');
});

afterEach(async () => {
  await run(['stop']);
  // The board's Talos outlives the stopped Hephaestus, working in the repository.
  await stopProcessesReachingInto(repositoryDirectory);
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(homeDirectory);
  const flowOfTheCase = requireRecordedFlow();
  recordedFlow = null;
  flowOfTheCase.requireEveryCallAnswered();
});

describe('the Hephaestus API on a scratch board', () => {
  test('the Baton names the token file and holds no token; that token is what an Origin-less command needs, answered 200, 409 or 400', async () => {
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const batonFile = readdirSync(hephaestusDirectory()).find((fileName) => /^baton-\d+\.json$/.test(fileName)) ?? '';
    const batonText = readFileSync(join(hephaestusDirectory(), batonFile), 'utf8');
    const baton = JSON.parse(batonText) as { tokenFile: string };
    expect(realpathSync(baton.tokenFile).startsWith(realpathSync(homeDirectory))).toBe(true);
    const token = readFileSync(baton.tokenFile, 'utf8');
    expect(token.length).toBeGreaterThan(0);
    expect(batonText).not.toContain(token);
    expect(Object.keys(baton)).not.toContain('token');

    const command = (body: string, authorization = `Bearer ${token}`) => fetch(new URL('api/commands', url), { method: 'POST', headers: { authorization }, body });
    expect((await command(JSON.stringify({ kind: 'hephaestus-unpause' }), 'Bearer not-the-token')).status).toBe(401);
    const resumed = await command(JSON.stringify({ kind: 'hephaestus-unpause' }));
    expect(resumed.status).toBe(200);
    const { result } = await resumed.clone().json() as { result: { logged: { at: string }[] } };
    const replacements: [string, string][] = [
      [new URL(url).port, HEPHAESTUS_PLACEHOLDERS.PORT],
      [token, HEPHAESTUS_PLACEHOLDERS.TOKEN],
      ...result.logged.map(({ at }): [string, string] => [at, HEPHAESTUS_PLACEHOLDERS.STAMP]),
    ];
    recordAnswer(HEPHAESTUS_CALL_SHAPES.COMMAND_APPLIED, await recordedHttpResponseOf(resumed.clone(), replacements));
    expect(await resumed.json()).toMatchObject({ outcome: 'done' });
    const refused = await command(JSON.stringify({ kind: 'ticket-unhold', ticketReference: '999' }));
    expect(refused.status).toBe(409);
    recordAnswer(HEPHAESTUS_CALL_SHAPES.COMMAND_REFUSED, await recordedHttpResponseOf(refused.clone(), replacements));
    expect(typeof ((await refused.json()) as { refusal: unknown }).refusal).toBe('string');
    expect((await command(JSON.stringify({ kind: 'no-such-command' }))).status).toBe(400);
    expect((await command('not json')).status).toBe(400);

    expect((await fetch(new URL('api/state', url))).status).toBe(401);
    const state = await (await fetch(new URL('api/state', url), { headers: tokenHeaders() })).json() as Record<string, unknown>;
    expect(state).toMatchObject({ project: 'Example Agency', hephaestus: { state: 'serving', url, paused: false }, usage: { resetsAt: null } });
    for (const field of ['tickets', 'concurrency', 'readyTickets', 'ticketCountByStatus', 'page', 'jobs', 'decisions', 'incidents', 'notices', 'mergeQueue']) {
      expect(Object.keys(state)).toContain(field);
    }
    const summary = await (await fetch(new URL('api/summary', url))).json() as Record<string, unknown>;
    const fixture = JSON.parse(readFileSync(SUMMARY_FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(Object.keys(fixture));
    expect(summary['summaryVersion']).toBe(2);

    const monitorRefused = await fetch(new URL('api/monitor', url));
    const monitorRefusal = await monitorRefused.json() as Record<string, unknown>;
    expect([monitorRefused.status, Object.keys(monitorRefusal)]).toEqual([401, ['refusal', 'text']]);
    expect(String(monitorRefusal['text'])).not.toMatch(COMMAND_LINE_FORM);
    const monitor = await (await fetch(new URL('api/monitor', url), { headers: tokenHeaders() })).json() as Record<string, unknown>;
    const monitorFixture = JSON.parse(readFileSync(MONITOR_FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(monitor)).toEqual(Object.keys(monitorFixture));
    expect(monitor).toMatchObject({ monitorVersion: 5, project: 'Example Agency', hephaestus: { state: 'serving', url, paused: false } });
    const versions: unknown = await (await fetch(new URL('api/versions', url))).json();
    expect(versions).toEqual(FORGE_SYSTEM_VERSIONS);
    const versionedMonitor = await (await fetch(new URL('api/v4/monitor', url), { headers: tokenHeaders() })).json() as Record<string, unknown>;
    expect(Object.keys(versionedMonitor)).toEqual(Object.keys(monitorFixture));
    const monitorStream = await fetch(new URL('api/monitor/events', url), { headers: tokenHeaders() });
    const streamReader = monitorStream.body?.getReader();
    let streamText = '';
    while (streamReader !== undefined && !/event: monitor\ndata: .+\n\n/.test(streamText)) {
      const chunk = await streamReader.read();
      if (chunk.done) break;
      streamText += new TextDecoder().decode(chunk.value);
    }
    await streamReader?.cancel().catch(() => undefined);
    const [handshakeEvent = '', monitorEvent = ''] = streamText.split('\n\n');
    expect(handshakeEvent).toBe(`event: handshake\ndata: ${JSON.stringify({ systemVersion: FORGE_SYSTEM_VERSIONS.current })}`);
    expect(/^event: (.+)$/m.exec(monitorEvent)?.[1]).toBe('monitor');
    const monitorEventData: unknown = JSON.parse(/^data: (.+)$/m.exec(monitorEvent)?.[1] ?? 'null');
    expect(monitorEventData).toMatchObject({ monitorVersion: 5, project: 'Example Agency', systemVersion: FORGE_SYSTEM_VERSIONS.current });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a picture is stored owner-only by the hash of its bytes and served back; a refused one and a command naming an unknown one are worded', async () => {
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const headers = tokenHeaders();
    const token = headers['authorization']?.slice('Bearer '.length) ?? '';
    const replacements: [string, string][] = [[new URL(url).port, HEPHAESTUS_PLACEHOLDERS.PORT], [token, HEPHAESTUS_PLACEHOLDERS.TOKEN]];
    const upload = (body: Uint8Array) => fetch(new URL('api/pictures', url), { method: 'POST', headers: { ...headers, 'content-type': 'image/jpeg' }, body });
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const pictureId = createHash('sha256').update(pngBytes).digest('hex');

    const stored = await upload(pngBytes);
    expect(stored.status).toBe(200);
    recordAnswer(HEPHAESTUS_CALL_SHAPES.PICTURE_UPLOADED, await recordedHttpResponseOf(stored.clone(), replacements));
    expect(await stored.json()).toEqual({ pictureId, bytes: pngBytes.length, mediaType: 'image/png' });
    const pictureFile = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'pictures', `${pictureId}.png`);
    expect(statSync(pictureFile).mode & 0o777).toBe(0o600);
    const served = await fetch(new URL(`api/pictures/${pictureId}`, url), { headers });
    expect(served.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([...pngBytes]);

    const tooLarge = new Uint8Array(PICTURE_SIZE_LIMIT_BYTES + 1);
    tooLarge.set(pngBytes);
    const refusedTooLarge = await upload(tooLarge);
    expect(refusedTooLarge.status).toBe(413);
    recordAnswer(HEPHAESTUS_CALL_SHAPES.PICTURE_TOO_LARGE, await recordedHttpResponseOf(refusedTooLarge.clone(), replacements));
    const refusedType = await upload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(refusedType.status).toBe(415);
    recordAnswer(HEPHAESTUS_CALL_SHAPES.PICTURE_TYPE_UNSUPPORTED, await recordedHttpResponseOf(refusedType.clone(), replacements));
    const typeRefusal = { refusal: 'picture-type-unsupported', fields: { mediaTypes: expect.arrayContaining(['image/png']) }, text: expect.stringContaining('image/png') };
    expect(await refusedType.json()).toMatchObject(typeRefusal);

    const command = (body: unknown) => fetch(new URL('api/commands', url), { method: 'POST', headers, body: JSON.stringify(body) });
    const unknown = await command({ kind: 'intake-start', text: 'A basket', pictures: [{ pictureId: 'b'.repeat(64), name: 'gone.png' }] });
    expect(unknown.status).toBe(409);
    expect(await unknown.json()).toMatchObject({ controlVersion: 3, refusal: 'picture-unknown', text: expect.stringContaining(`No picture ${'b'.repeat(64)} is stored`) });
    const blank = await command({ kind: 'intake-start', text: ' ' });
    expect(blank.status).toBe(409);
    expect(await blank.json()).toMatchObject({ controlVersion: 3, refusal: 'intake-empty', text: expect.stringContaining('blank and carries no picture') });
    const state = await (await fetch(new URL('api/state', url), { headers })).json() as Record<string, unknown>;
    expect(state['pictureLimits']).toMatchObject({ perMessage: PICTURES_PER_MESSAGE_LIMIT, sizeLimitBytes: PICTURE_SIZE_LIMIT_BYTES });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a gate profile the board holds streams its output after the cursor; another run and a cursor that is no line number are 404', async () => {
    const dataFolder = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER);
    writeFileSync(join(dataFolder, 'gate-profiles.json'), GateProfilesFile.contentsOf({
      formatVersion: 1,
      nextRunNumber: 2,
      runs:          [{
        profileRunId:        'P1',
        setupId:             null,
        phase:               'merge',
        gate:                { name: 'test', run: 'bun test' },
        gateHash:            'example-gate-hash',
        prepare:             [],
        state:               'passed',
        stopRequested:       false,
        elapsedMilliseconds: 1200,
      }],
      extra: [],
    }));
    mkdirSync(join(dataFolder, GATE_PROFILE_RUNS_FOLDER));
    writeFileSync(join(dataFolder, GATE_PROFILE_RUNS_FOLDER, 'P1.ndjson'), `${JSON.stringify({ text: 'first' })}\n${JSON.stringify({ text: 'second' })}\n`);
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const headers = tokenHeaders();
    const stream = await fetch(new URL('api/profiles/P1/stream?after=1', url), { headers });
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const reader = stream.body?.getReader();
    const decoder = new TextDecoder();
    let opening = '';
    while (reader !== undefined && !opening.includes('event: line')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      opening += decoder.decode(chunk.value);
    }
    await reader?.cancel();
    expect(opening).toBe(`event: handshake\ndata: ${JSON.stringify({ systemVersion: FORGE_SYSTEM_VERSIONS.current })}\n\nid: 2\nevent: line\ndata: {"text":"second"}\n\n`);
    expect((await fetch(new URL('api/profiles/P2/stream', url), { headers })).status).toBe(404);
    expect((await fetch(new URL('api/profiles/P1/stream?after=last', url), { headers })).status).toBe(404);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('GET / and every other path outside the API is a 404 not-found: Hephaestus serves no page', async () => {
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    for (const path of ['', 'index.html', 'chunk-abc.js']) {
      const answer = await fetch(new URL(path, url));
      expect([answer.status, await answer.json()], path).toEqual([404, { refusal: 'not-found' }]);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an answer carries the API\'s CSP and lets no origin frame it, also where the monitor folder still holds a frame-ancestor record', async () => {
    const frameAncestorsDirectory = join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, 'frame-ancestors');
    mkdirSync(frameAncestorsDirectory, { recursive: true });
    writeFileSync(join(frameAncestorsDirectory, 'first-host.json'), JSON.stringify({ version: 1, minor: 0, origin: 'http://127.0.0.1:4411' }));
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const policy = (await fetch(new URL('api/versions', url))).headers.get('content-security-policy') ?? '';
    expect(policy).toBe('default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'none\'');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an event-stream client sees a board event for a ticket move and a job event for each state the build job is published in', async () => {
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const stream = collectEvents(url);
    try {
      await waitUntil(() => stream.events.some((event) => event.kind === 'board'), 'the first board event');
      await run(['gate', 'add', 'checks', '--', 'true']);
      await run(['gate', 'assistant', 'on']);
      await run(['unpause']);
      await fileReadyTicketThrough(run, (result) => result.standardOutput, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
      const ticketStatusesOf = (event: StreamedEvent) => (event.data['tickets'] as { id: string; status: string }[] | undefined) ?? [];
      await waitUntil(() => stream.events.some((event) => event.kind === 'board' && ticketStatusesOf(event).some((ticket) => ticket.id === '001')), 'the filed ticket');
      const buildJobStates = () => stream.events.filter((event) => event.kind === 'job' && event.data['kind'] === 'build').map((event) => event.data['state']);
      await waitUntil(() => buildJobStates().includes('running'), 'the build job running');
      expect([...new Set(buildJobStates())]).toEqual(['launching', 'preparing', 'running']);
      const buildJobEvent = stream.events.find((event) => event.kind === 'job' && event.data['kind'] === 'build');
      expect(buildJobEvent?.data['live']).toMatchObject({ toolCalls: 0, toolCallsWithSubagents: 0, lastToolCall: null });
    } finally {
      await stream.stop();
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('no forge runs Flint\'s brain: its commands are malformed, its ask path is a 404 and the monitor holds no brain', async () => {
    const hephaestus = await startHephaestus();
    const url = await hephaestus.firstOutputLine ?? '';
    const headers = tokenHeaders();
    for (const kind of ['flint-brain-start', 'flint-brain-stop']) {
      const answered = await fetch(new URL('api/v3/commands', url), { method: 'POST', headers, body: JSON.stringify({ kind }) });
      expect([answered.status, await answered.json()], kind).toEqual([400, expect.objectContaining({ controlVersion: 3, refusal: 'malformed-body' })]);
    }
    const asked = await fetch(new URL('api/flint-brain/ask', url), { method: 'POST', headers, body: '{}' });
    expect([asked.status, await asked.json()]).toEqual([404, { refusal: 'not-found' }]);
    const monitor = await (await fetch(new URL('api/v4/monitor', url), { headers })).json() as Record<string, unknown>;
    expect(Object.hasOwn(monitor, 'flintBrain')).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
