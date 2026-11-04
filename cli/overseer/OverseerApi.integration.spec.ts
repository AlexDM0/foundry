/**
 * The Overseer's API end to end against a spawned Overseer on a scratch board, the fake agent playing every session. What matters: the
 * Baton names the token file and never holds the token, and that file's token is the one `POST /api/commands` accepts from an Origin-less
 * server request; a command answers 200, 409 worded or 400; `/api/state` carries the status document beside the page, jobs with live facts
 * and the Overseer; `/api/summary` has the fixture's shape; `GET /` and its chunks carry the frame-ancestors of agent-dashboard's origins, against
 * clickjacking of the Bridge's controls; and an event-stream client sees a `board` event for a ticket move and a `job`
 * event for each state the build job passes through, launching to running.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
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

import { PRODUCT_NAMES }                                                                from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                      from '../../src/testing/ChildProcessCaseTimeout.ts';
import { recordAnswer }                                                                 from '../../src/testing/RecordedAnswers.ts';
import { useRecordedGit }                                                               from '../../src/testing/RecordedGit.ts';
import { type SharedRecordedGitFlow, shareRecordedGitFlow, withRecordedGitFirstOnPath } from '../../src/testing/RecordedGitProgram.ts';
import { OVERSEER_CALL_SHAPES, OVERSEER_PLACEHOLDERS, recordedHttpResponseOf }          from '../../src/testing/RecordedOverseerFetch.ts';
import { createScratchDirectory, removeScratchDirectory }                               from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                                                                    from '../../src/testing/WaitUntil.ts';
import { runAgentProgress, startAgentProgress }                                         from '../testing/CliProcess.ts';
import { createInitializedRecordedGitRepository }                                       from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicketThrough }                                                       from '../testing/ReadyTicketFiling.ts';
import { COMMON_FOLDER_OUTSIDE }                                                        from '../testing/RecordedGitStages.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const SUMMARY_FIXTURE_PATH = join(import.meta.dir, '..', '..', 'src', 'services', 'overseer', 'testing', 'fixtures', 'summary-v1.json');

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

async function startOverseer() {
  return await recordedGit.playStage(ISOLATION_CHECKS, async () => startAgentProgress(['oversee', '--port', '0'], childOptions()));
}

function overseerDirectory(): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer');
}

/** The newest Baton's token as a bearer header, which every data route needs from a client with no session cookie. */
function tokenHeaders(): Record<string, string> {
  const batonFile = readdirSync(overseerDirectory()).filter((fileName) => /^baton-\d+\.json$/.test(fileName)).at(-1) ?? '';
  const { tokenFile } = JSON.parse(readFileSync(join(overseerDirectory(), batonFile), 'utf8')) as { tokenFile: string };
  return { authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` };
}

/** Collects every event a stream sends, until `stop` is called. */
function collectEvents(url: string): { events: StreamedEvent[]; stop: () => Promise<void> } {
  const events: StreamedEvent[] = [];
  const controller = new AbortController();
  const reading = (async () => {
    const response = await fetch(new URL('api/events', url), { headers: tokenHeaders(), signal: controller.signal });
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
  repositoryDirectory = await createInitializedRecordedGitRepository('overseer-api', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  recordedFlow = shareRecordedGitFlow(recordedGit);
  homeDirectory = createScratchDirectory('overseer-api-home');
});

afterEach(async () => {
  await run(['oversee', 'stop']);
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(homeDirectory);
  const flowOfTheCase = requireRecordedFlow();
  recordedFlow = null;
  flowOfTheCase.requireEveryCallAnswered();
});

describe('the Overseer API on a scratch board', () => {
  test('the Baton names the token file and holds no token; that token is what an Origin-less command needs, answered 200, 409 or 400', async () => {
    const overseer = await startOverseer();
    const url = await overseer.firstOutputLine ?? '';
    const batonFile = readdirSync(overseerDirectory()).find((fileName) => /^baton-\d+\.json$/.test(fileName)) ?? '';
    const batonText = readFileSync(join(overseerDirectory(), batonFile), 'utf8');
    const baton = JSON.parse(batonText) as { tokenFile: string };
    expect(realpathSync(baton.tokenFile).startsWith(realpathSync(homeDirectory))).toBe(true);
    const token = readFileSync(baton.tokenFile, 'utf8');
    expect(token.length).toBeGreaterThan(0);
    expect(batonText).not.toContain(token);
    expect(Object.keys(baton)).not.toContain('token');

    const command = (body: string, authorization = `Bearer ${token}`) => fetch(new URL('api/commands', url), { method: 'POST', headers: { authorization }, body });
    expect((await command(JSON.stringify({ kind: 'overseer-resume' }), 'Bearer not-the-token')).status).toBe(401);
    const resumed = await command(JSON.stringify({ kind: 'overseer-resume' }));
    expect(resumed.status).toBe(200);
    const { result } = await resumed.clone().json() as { result: { logged: { at: string }[] } };
    const replacements: [string, string][] = [
      [new URL(url).port, OVERSEER_PLACEHOLDERS.PORT],
      [token, OVERSEER_PLACEHOLDERS.TOKEN],
      ...result.logged.map(({ at }): [string, string] => [at, OVERSEER_PLACEHOLDERS.STAMP]),
    ];
    recordAnswer(OVERSEER_CALL_SHAPES.COMMAND_APPLIED, await recordedHttpResponseOf(resumed.clone(), replacements));
    expect(await resumed.json()).toMatchObject({ outcome: 'done' });
    const refused = await command(JSON.stringify({ kind: 'ticket-unhold', ticketReference: '999' }));
    expect(refused.status).toBe(409);
    recordAnswer(OVERSEER_CALL_SHAPES.COMMAND_REFUSED, await recordedHttpResponseOf(refused.clone(), replacements));
    expect(typeof ((await refused.json()) as { refusal: unknown }).refusal).toBe('string');
    expect((await command(JSON.stringify({ kind: 'no-such-command' }))).status).toBe(400);
    expect((await command('not json')).status).toBe(400);

    expect((await fetch(new URL('api/state', url))).status).toBe(401);
    const state = await (await fetch(new URL('api/state', url), { headers: tokenHeaders() })).json() as Record<string, unknown>;
    expect(state).toMatchObject({ project: 'Example Agency', overseer: { state: 'serving', url, paused: false }, usage: { resetsAt: null } });
    for (const field of ['tickets', 'concurrency', 'readyTickets', 'ticketCountByStatus', 'page', 'jobs', 'decisions', 'incidents', 'notices', 'mergeQueue']) {
      expect(Object.keys(state)).toContain(field);
    }
    const summary = await (await fetch(new URL('api/summary', url))).json() as Record<string, unknown>;
    const fixture = JSON.parse(readFileSync(SUMMARY_FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(Object.keys(fixture));
    expect(summary['summaryVersion']).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('GET / serves the Bridge from its HTML import, its bundled script and stylesheet served beside it', async () => {
    const overseer = await startOverseer();
    const url = await overseer.firstOutputLine ?? '';
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('<div id="bridge-root"></div>');
    const scriptPath = /<script[^>]+src="([^"]+)"/.exec(html)?.[1] ?? '';
    const stylesheetPath = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/.exec(html)?.[1] ?? /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/.exec(html)?.[1] ?? '';
    const script = await fetch(new URL(scriptPath, url));
    expect(script.status).toBe(200);
    expect(await script.text()).toContain('bridge-root');
    expect((await fetch(new URL(stylesheetPath, url))).status).toBe(200);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('GET / carries the page CSP, framed only by the origins agent-dashboard\'s server record names', async () => {
    const dashboardRecordDirectory = join(homeDirectory, '.agent-progress-monitor', 'agent-dashboard');
    mkdirSync(dashboardRecordDirectory, { recursive: true });
    writeFileSync(join(dashboardRecordDirectory, 'server.json'), JSON.stringify({ url: 'http://127.0.0.1:4411/', boardOrigin: 'http://localhost:4412' }));
    const overseer = await startOverseer();
    const url = await overseer.firstOutputLine ?? '';
    const page = await fetch(url);
    expect(page.status).toBe(200);
    const policy = page.headers.get('content-security-policy') ?? '';
    expect(/frame-ancestors ([^;]*)$/.exec(policy)?.[1]).toBe('http://127.0.0.1:4411 http://localhost:4412');
    const scriptPath = /<script[^>]+src="([^"]+)"/.exec(await page.text())?.[1] ?? '';
    expect((await fetch(new URL(scriptPath, url))).headers.get('content-security-policy')).toBe(policy);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an event-stream client sees a board event for a ticket move and a job event for each state the build job is published in', async () => {
    const overseer = await startOverseer();
    const url = await overseer.firstOutputLine ?? '';
    const stream = collectEvents(url);
    try {
      await waitUntil(() => stream.events.some((event) => event.kind === 'board'), 'the first board event');
      await run(['gate', 'add', 'checks', '--', 'true']);
      await run(['oversee', 'resume']);
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
});
