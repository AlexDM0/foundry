/**
 * The real-system spec of Gaia's checkout, run only by `bun run record gaia-checkout`: it clones this repository into scratch folders, puts
 * each clone in one situation, and records what git and forge's setup answer there. Setup runs with `BUN_INSTALL` in the scratch folder,
 * so the forge command it compiles never replaces the installed one. The Darwin release stamps the recording.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun, type ProcessRun }                                               from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                                                               from '../../services/Environment.ts';
import { recordAnswer, repositoryRoot }                                                  from '../../testing/BoundaryRecordings.ts';
import { runCallShapeOf, situationCallShapeOf }                                          from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                                     from '../../testing/ScratchRoot.ts';
import { createGaiaCheckout, type GaiaCheckout }                                         from './GaiaCheckout.ts';
import { EXAMPLE_BUN_PROGRAM, GAIA_CHECKOUT_RECORDING_NAME, type GaiaCheckoutSituation } from './testing/RecordedGaiaCheckout.ts';

const GIT_TIMEOUT_MILLISECONDS = 120_000;
const SETUP_TEST_TIMEOUT_MILLISECONDS = 900_000;
/** Each clone that was set up holds its own installed dependencies. */
const SCRATCH_REMOVAL_TIMEOUT_MILLISECONDS = 120_000;

let scratchFolder = '';
let originFolder = '';
let scratchBunInstallFolder = '';

/** Setup's own home too: what its installs leave there, such as a package's caches under `Library`, goes with the scratch folder. */
const environmentWithScratchBun = (): Record<string, string> => ({
  ...environmentCopy(),
  HOME:                  join(scratchFolder, 'home'),
  BUN_INSTALL:           scratchBunInstallFolder,
  BUN_INSTALL_CACHE_DIR: join(scratchBunInstallFolder, 'install', 'cache'),
});

async function gitIn(workingDirectory: string, programArguments: readonly string[]): Promise<string> {
  const answer = await realProcessRun(environmentCopy).run({
    program: 'git', programArguments, workingDirectory, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS
  });
  if (answer.verdict !== 'finished' || answer.exitCode !== 0) throw new Error(`git ${programArguments.join(' ')} answered ${JSON.stringify(answer)}`);
  return answer.standardOutput;
}

/** The real process-run, recording each run under its situation, with the Bun it ran named as the example Bun. */
function recordingProcessRun(situation: GaiaCheckoutSituation): ProcessRun {
  const processRun = realProcessRun(environmentWithScratchBun);
  return {
    run: async (request) => {
      const answer = await processRun.run(request);
      const recordedProgram = request.program === process.execPath ? EXAMPLE_BUN_PROGRAM : request.program;
      recordAnswer(GAIA_CHECKOUT_RECORDING_NAME, situationCallShapeOf(situation, runCallShapeOf(recordedProgram, request.programArguments)), answer);
      return answer;
    },
    startOwned: (request) => {
      throw new Error(`The checkout starts no program it owns, and was asked to start ${request.program}.`);
    },
    startDetached: (request) => {
      throw new Error(`The checkout starts no detached program, and was asked to start ${request.program}.`);
    },
  };
}

/** What git itself counts, since a step back past a merge leaves the clone behind by every commit the merge brought in. */
async function commitsBehindOf(cloneFolder: string): Promise<number> {
  return Number.parseInt((await gitIn(cloneFolder, ['rev-list', '--count', 'HEAD..origin/main'])).trim(), 10);
}

async function cloneOfOrigin(name: string): Promise<string> {
  const cloneFolder = join(scratchFolder, name);
  await gitIn(scratchFolder, ['clone', '--quiet', originFolder, cloneFolder]);
  await gitIn(cloneFolder, ['config', 'user.name', 'Alex Example']);
  await gitIn(cloneFolder, ['config', 'user.email', 'alex@example.com']);
  return cloneFolder;
}

function checkoutIn(cloneFolder: string, situation: GaiaCheckoutSituation): GaiaCheckout {
  return createGaiaCheckout({ processRun: recordingProcessRun(situation), checkoutFolder: cloneFolder, bunProgram: process.execPath });
}

beforeAll(async () => {
  scratchFolder = createScratchDirectory('gaia-checkout');
  scratchBunInstallFolder = join(scratchFolder, 'bun-install');
  mkdirSync(join(scratchBunInstallFolder, 'bin'), { recursive: true });
  mkdirSync(join(scratchFolder, 'home'));
  originFolder = join(scratchFolder, 'origin.git');
  await gitIn(scratchFolder, ['clone', '--quiet', '--bare', '--local', join(repositoryRoot(), '..', '..'), originFolder]);
}, SCRATCH_REMOVAL_TIMEOUT_MILLISECONDS);

afterAll(() => {
  removeScratchPath(scratchFolder);
}, SCRATCH_REMOVAL_TIMEOUT_MILLISECONDS);

describe('a checkout of a real clone of this repository', () => {
  test('reads a clone at origin\'s main as zero commits behind', async () => {
    const cloneFolder = await cloneOfOrigin('up-to-date');
    expect(await checkoutIn(cloneFolder, 'up-to-date').upstreamReading()).toEqual({ verdict: 'read', commitsBehind: 0 });
  });

  test('counts the commits a clone lacks, fast-forwards it to them and runs forge\'s setup in it', async () => {
    const cloneFolder = await cloneOfOrigin('behind');
    await gitIn(cloneFolder, ['reset', '--hard', '--quiet', 'HEAD~2']);
    const checkout = checkoutIn(cloneFolder, 'behind');
    expect(await checkout.upstreamReading()).toEqual({ verdict: 'read', commitsBehind: await commitsBehindOf(cloneFolder) });
    expect(await checkout.fastForward()).toBe('fast-forwarded');
    expect(await checkout.forgeSetup()).toBe('set-up');
  }, SETUP_TEST_TIMEOUT_MILLISECONDS);

  test('reads a setup that cannot compile the forge command as failed, though setup exits 0', async () => {
    const cloneFolder = await cloneOfOrigin('setup-fails');
    await gitIn(cloneFolder, ['reset', '--hard', '--quiet', 'HEAD~1']);
    const checkout = checkoutIn(cloneFolder, 'setup-fails');
    expect(await checkout.upstreamReading()).toEqual({ verdict: 'read', commitsBehind: await commitsBehindOf(cloneFolder) });
    expect(await checkout.fastForward()).toBe('fast-forwarded');
    writeFileSync(join(cloneFolder, 'apps', 'forge', 'launcher.ts'), 'this is no TypeScript (\n');
    expect(await checkout.forgeSetup()).toBe('setup-failed');
  }, SETUP_TEST_TIMEOUT_MILLISECONDS);

  test('leaves a clone with a changed tracked file as it is', async () => {
    const cloneFolder = await cloneOfOrigin('local-changes');
    await gitIn(cloneFolder, ['reset', '--hard', '--quiet', 'HEAD~1']);
    writeFileSync(join(cloneFolder, 'README.md'), 'An example change.\n');
    const checkout = checkoutIn(cloneFolder, 'local-changes');
    expect(await checkout.upstreamReading()).toEqual({ verdict: 'read', commitsBehind: await commitsBehindOf(cloneFolder) });
    expect(await checkout.fastForward()).toBe('local-changes');
  });

  test('leaves a clone with a commit of its own as it is', async () => {
    const cloneFolder = await cloneOfOrigin('diverged');
    await gitIn(cloneFolder, ['reset', '--hard', '--quiet', 'HEAD~1']);
    await gitIn(cloneFolder, ['commit', '--quiet', '--allow-empty', '-m', 'An example commit']);
    const checkout = checkoutIn(cloneFolder, 'diverged');
    expect(await checkout.upstreamReading()).toEqual({ verdict: 'read', commitsBehind: await commitsBehindOf(cloneFolder) });
    expect(await checkout.fastForward()).toBe('diverged');
  });

  test('reads an origin that names no repository as unreachable', async () => {
    const cloneFolder = await cloneOfOrigin('origin-unreachable');
    await gitIn(cloneFolder, ['remote', 'set-url', 'origin', join(scratchFolder, 'no-such-origin.git')]);
    expect(await checkoutIn(cloneFolder, 'origin-unreachable').upstreamReading()).toEqual({ verdict: 'origin-unreachable' });
  });

  test('reads a repository without an origin as no clone', async () => {
    const cloneFolder = await cloneOfOrigin('not-a-clone');
    await gitIn(cloneFolder, ['remote', 'remove', 'origin']);
    expect(await checkoutIn(cloneFolder, 'not-a-clone').upstreamReading()).toEqual({ verdict: 'not-a-clone' });
  });
});
