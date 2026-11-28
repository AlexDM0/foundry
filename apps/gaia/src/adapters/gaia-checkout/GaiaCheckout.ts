/**
 * The git clone Gaia runs from, as Gaia's update reaches it: how far it is behind its origin's main branch, its fast-forward to that
 * branch, and forge's setup in it, which installs the clone's dependencies and compiles the installed forge command again.
 */
import { join } from 'node:path';

import type { ProgramRunAnswer, ProcessRun } from '../../lib/process-run/ProcessRun.ts';

export interface GaiaCheckoutOptions {
  readonly processRun:     ProcessRun;
  /** The clone's top folder, which holds `apps/forge` and `apps/gaia`. */
  readonly checkoutFolder: string;
  readonly bunProgram:     string;
}

export type UpstreamReading =
  | { readonly verdict: 'read'; readonly commitsBehind: number }
  | { readonly verdict: 'origin-unreachable' }
  | { readonly verdict: 'not-a-clone' };

export type FastForwardVerdict = 'fast-forwarded' | 'local-changes' | 'diverged';

export type ForgeSetupVerdict = 'set-up' | 'setup-failed';

export interface GaiaCheckout {
  /** Fetches origin's main branch and counts the commits on it the checked-out branch lacks. */
  readonly upstreamReading: () => Promise<UpstreamReading>;
  /** Moves the checked-out branch to origin's main as last fetched; it refuses changes to tracked files and a branch that went its own way. */
  readonly fastForward:     () => Promise<FastForwardVerdict>;
  readonly forgeSetup:      () => Promise<ForgeSetupVerdict>;
}

const GIT_PROGRAM = 'git';
const ORIGIN_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const ORIGIN_MAIN = `${ORIGIN_REMOTE}/${MAIN_BRANCH}`;
const GIT_TIMEOUT_MILLISECONDS = 60_000;
/** Setup runs `bun install` and compiles the forge command; a cold install cache takes minutes. */
const FORGE_SETUP_TIMEOUT_MILLISECONDS = 600_000;
const FORGE_FOLDER = join('apps', 'forge');
/** Forge's own bunfig and no `.env`, as its `setup.sh` runs setup. */
const FORGE_SETUP_ARGUMENTS = ['--no-env-file', '--config=bunfig.toml', 'setup.ts'] as const;
/** The mark forge's setup prints before a step that failed; setup itself still exits 0. */
const SETUP_FAILURE_MARK = '✘';

function finishedCleanly(answer: ProgramRunAnswer): answer is Extract<ProgramRunAnswer, { readonly verdict: 'finished' }> {
  return answer.verdict === 'finished' && answer.exitCode === 0;
}

export function createGaiaCheckout(options: GaiaCheckoutOptions): GaiaCheckout {
  const { processRun, checkoutFolder } = options;

  function runGit(programArguments: readonly string[]): Promise<ProgramRunAnswer> {
    return processRun.run({
      program: GIT_PROGRAM, programArguments, workingDirectory: checkoutFolder, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS
    });
  }

  async function upstreamReading(): Promise<UpstreamReading> {
    if (!finishedCleanly(await runGit(['remote', 'get-url', ORIGIN_REMOTE]))) return { verdict: 'not-a-clone' };
    if (!finishedCleanly(await runGit(['fetch', '--quiet', ORIGIN_REMOTE, MAIN_BRANCH]))) return { verdict: 'origin-unreachable' };
    const countAnswer = await runGit(['rev-list', '--count', `HEAD..${ORIGIN_MAIN}`]);
    const commitsBehind = finishedCleanly(countAnswer) ? Number.parseInt(countAnswer.standardOutput.trim(), 10) : Number.NaN;
    return Number.isInteger(commitsBehind) ? { verdict: 'read', commitsBehind } : { verdict: 'not-a-clone' };
  }

  async function fastForward(): Promise<FastForwardVerdict> {
    const statusAnswer = await runGit(['status', '--porcelain', '--untracked-files=no']);
    if (!finishedCleanly(statusAnswer) || statusAnswer.standardOutput.trim() !== '') return 'local-changes';
    return finishedCleanly(await runGit(['merge', '--ff-only', '--quiet', ORIGIN_MAIN])) ? 'fast-forwarded' : 'diverged';
  }

  async function forgeSetup(): Promise<ForgeSetupVerdict> {
    const answer = await processRun.run({
      program:             options.bunProgram,
      programArguments:    FORGE_SETUP_ARGUMENTS,
      workingDirectory:    join(checkoutFolder, FORGE_FOLDER),
      timeoutMilliseconds: FORGE_SETUP_TIMEOUT_MILLISECONDS,
    });
    return finishedCleanly(answer) && !answer.standardOutput.includes(SETUP_FAILURE_MARK) ? 'set-up' : 'setup-failed';
  }

  return { upstreamReading, fastForward, forgeSetup };
}
