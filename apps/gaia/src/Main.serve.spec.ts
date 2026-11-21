/**
 * `gaia serve` run as the program it is, under a scratch home on any free port, since the launcher starts and stops it as a program: it
 * prints its address once it listens, writes its token and no frame-ancestor record, serves its health, the fleet, a command and the built
 * page with the CSP, and at a stop signal exits 0. Where Gaia already answers, or the port setting names no port, it refuses with exit code 1
 * and writes nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FLEET_SNAPSHOT_EMPTY }                      from './adapters/page-api/testing/fleet-snapshot-empty.ts';
import { startPageServer }                           from './features/page-server/PageServer.ts';
import { forgeClientOf }                             from './lib/forge-client/ForgeClient.ts';
import { pageContentSecurityPolicyFor }              from './lib/local-http-guards/ContentSecurityPolicy.ts';
import { environmentCopy }                           from './services/Environment.ts';
import { createFleetStore }                          from './services/FleetStore.ts';
import { PAGE_CONTRACT_VERSIONS }                    from './shared/constants/PageContractVersions.ts';
import { manualTimers }                              from './testing/ManualTimers.ts';
import { recordedOverseerFetch }                     from './testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from './testing/ScratchRoot.ts';

const PAGE_POLICY = pageContentSecurityPolicyFor();

const SERVING_LINE = /serves (http:\/\/127\.0\.0\.1:\d+\/)\n/;

const EXIT_CODE_FOR_REFUSAL = 1;

let scratchHomes: string[] = [];
let runningPrograms: Bun.Subprocess[] = [];

afterEach(async () => {
  for (const runningProgram of runningPrograms) {
    runningProgram.kill('SIGKILL');
    await runningProgram.exited;
  }
  runningPrograms = [];
  for (const scratchHome of scratchHomes) removeScratchPath(scratchHome);
  scratchHomes = [];
});

/** A home of its own for each program, removed after, since Bun keeps its transpiler cache in the home folder of the program it runs. */
function scratchHome(): string {
  const home = createScratchDirectory('serve-home');
  scratchHomes.push(home);
  return home;
}

function startServe(home: string, portSetting: string): Bun.Subprocess<'ignore', 'pipe', 'pipe'> {
  const servingProgram = Bun.spawn([process.execPath, join(import.meta.dir, 'Main.ts'), 'serve'], {
    env:    { ...environmentCopy(), HOME: home, GAIA_PORT: portSetting },
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  runningPrograms.push(servingProgram);
  return servingProgram;
}

/** Reads standard output until the line that names the address; the spec's own bound ends a wait for a program that never listens. */
async function servedAddressOf(servingProgram: Bun.Subprocess<'ignore', 'pipe', 'pipe'>): Promise<URL> {
  const decoder = new TextDecoder();
  let standardOutput = '';
  for await (const chunk of servingProgram.stdout) {
    standardOutput += decoder.decode(chunk, { stream: true });
    const servedAddress = SERVING_LINE.exec(standardOutput)?.[1];
    if (servedAddress !== undefined) return new URL(servedAddress);
  }
  throw new Error(`gaia serve ended without serving: ${await new Response(servingProgram.stderr).text()}`);
}

async function answerOf(address: URL, path: string, requestOptions: RequestInit = {}): Promise<Response> {
  const response = await fetch(new URL(path, address), requestOptions);
  expect(response.headers.get('content-security-policy')).toBe(PAGE_POLICY);
  return response;
}

function frameAncestorsFolderIn(home: string): string {
  return join(home, '.forge-monitor', 'frame-ancestors');
}

describe('gaia serve', () => {
  test('serves its health, the fleet, a command and the page once it prints its address, frames no forge, and exits at a stop signal', async () => {
    const home = scratchHome();
    const servingProgram = startServe(home, '0');
    const address = await servedAddressOf(servingProgram);

    expect(existsSync(frameAncestorsFolderIn(home))).toBe(false);
    const health = await answerOf(address, '/api/health');
    expect(await health.json()).toEqual({
      application:      'gaia',
      healthVersion:    1,
      installVersion:   1,
      forgesRegistered: 0,
      forgesAnswered:   0,
    });

    const token = readFileSync(join(home, '.gaia', 'token'), 'utf8');
    const codeAnswer = await answerOf(address, '/api/session-codes', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    const { code } = await codeAnswer.json() as { readonly code: string };
    const session = await answerOf(address, '/api/session', { method: 'POST', body: JSON.stringify({ code }) });
    const cookie = (session.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const fleet = await answerOf(address, '/api/fleet', { headers: { cookie } });
    expect(await fleet.json()).toMatchObject({
      fleetVersion: PAGE_CONTRACT_VERSIONS.gaiaFleetDocument,
      forges:       [],
      gaia:         {
        address:      address.origin,
        homeFolder:   home,
        registryPath: join(home, '.forge-monitor', 'projects.json'),
        settingsFile: 'absent',
      },
    });

    const lookAgain = await answerOf(address, '/api/commands', { method: 'POST', headers: { cookie }, body: JSON.stringify({ commandVersion: 4, kind: 'fleet-look-again' }) });
    expect(await lookAgain.json()).toEqual({
      answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
    });

    const page = await answerOf(address, '/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('id="gaia-root"');

    servingProgram.kill('SIGTERM');
    expect(await servingProgram.exited).toBe(0);
    expect(existsSync(frameAncestorsFolderIn(home))).toBe(false);
  });

  test('refuses to start where Gaia already answers, and writes no token', async () => {
    const runningGaia = await startPageServer({
      port:               0,
      homeDirectory:      scratchHome(),
      fleetStore:         createFleetStore(FLEET_SNAPSHOT_EMPTY),
      forgeCounts:        () => ({ forgesRegistered: 0, forgesAnswered: 0 }),
      pageFiles:          () => Promise.resolve({ verdict: 'unbuildable', failure: 'no page in this spec' }),
      carryCommand:       () => Promise.resolve({ verdict: 'not-supported' }),
      forgeAccessSources: {
        readRegistry:            () => Promise.resolve({ verdict: 'absent' }),
        readings:                () => [],
        presenceReadingAfterNow: () => Promise.resolve(null),
        forgeClient:             forgeClientOf({ overseerFetch: recordedOverseerFetch([]) }),
      },
      logBoardRelay: () => undefined,
      timers:        manualTimers(),
    });
    if (runningGaia.verdict !== 'serving') throw new Error('The running Gaia of this spec did not start.');
    try {
      const home = scratchHome();
      const servingProgram = startServe(home, String(runningGaia.pageServer.port));
      expect(await servingProgram.exited).toBe(EXIT_CODE_FOR_REFUSAL);
      expect(await new Response(servingProgram.stderr).text()).toBe(`Gaia already serves at ${runningGaia.pageServer.url.href}.\n`);
      expect(existsSync(join(home, '.gaia', 'token'))).toBe(false);
    } finally {
      await runningGaia.pageServer.stop();
    }
  });

  test('refuses a port setting that names no port', async () => {
    const servingProgram = startServe(scratchHome(), 'not-a-port');
    expect(await servingProgram.exited).toBe(EXIT_CODE_FOR_REFUSAL);
    expect(await new Response(servingProgram.stderr).text()).toContain('GAIA_PORT names no port');
  });
});
