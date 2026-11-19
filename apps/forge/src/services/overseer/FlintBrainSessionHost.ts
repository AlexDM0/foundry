/**
 * Where a run of Flint's brain lives: an agent child of its own in the tracker's `flint-brain/` folder, launched, written to and read as a
 * job's child is, but no job. The engine reaches it only through `FlintBrainSessionHost`, which a spec replaces.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join }                          from 'node:path';

import type { AgentLaunchPlan }        from '../../lib/agent-launch/AgentLaunchPlan.ts';
import { childFilesOf }                from '../../lib/talos/TalosFiles.ts';
import type { BoardChildren }          from './BoardChildren.ts';
import type { FlintBrainSessionPlace } from './FlintBrainProfile.ts';

/** `starting` until the session's process runs; `ended` once it is gone, also when it never ran. */
export type FlintBrainSessionStanding = 'starting' | 'running' | 'ended';

export interface FlintBrainSessionLines {
  /** What the session printed, in order. */
  readonly lines:        readonly string[];
  /** The cursor the next read passes. */
  readonly lastSequence: number;
}

export type FlintBrainLaunchOutcome =
  | { readonly verdict: 'launched'; readonly run: number }
  | { readonly verdict: 'refused'; readonly reason: string };

export interface FlintBrainSessionHost {
  /** Ends what an earlier Overseer left running, then launches the plan made for the place it gives. */
  readonly launch:         (planOf: (place: FlintBrainSessionPlace) => AgentLaunchPlan) => Promise<FlintBrainLaunchOutcome>;
  readonly linesAfter:     (run: number, afterSequence: number) => FlintBrainSessionLines;
  readonly standingOf:     (run: number) => FlintBrainSessionStanding;
  /** Whether the session took the line. */
  readonly write:          (run: number, line: string) => Promise<boolean>;
  readonly stop:           (run: number) => Promise<void>;
  /** True once nothing of the run is live; Talos leaves nothing of an ended run waiting. */
  readonly acknowledgeEnd: (run: number) => Promise<boolean>;
}

export interface FlintBrainHostFacts {
  /** The board's children, of which each run is one in the brain folder. */
  readonly boardChildren:    BoardChildren;
  readonly trackerDirectory: string;
}

/** The label a run's child goes by in Talos's log. */
export const FLINT_BRAIN_CHILD_LABEL = 'flint-brain';

const FLINT_BRAIN_FOLDER_NAME = 'flint-brain';
const SESSION_FOLDER_NAME = 'session';

function brainFolderOf(trackerDirectory: string): string {
  return join(trackerDirectory, FLINT_BRAIN_FOLDER_NAME);
}

function runFolderOf(brainFolder: string, run: number): string {
  return join(brainFolder, `run-${run}`);
}

/** Every run number up to the newest launched; one whose files are removed reads as never launched. */
function runsIn(children: BoardChildren, brainFolder: string): number[] {
  const newestRun = existsSync(brainFolder) ? children.newestInstanceIn(brainFolder) : null;
  return newestRun === null ? [] : Array.from({ length: newestRun }, (_unused, i) => i + 1);
}

/** The newest run's record stays, so the next run's number is above every earlier one and no child is launched twice. */
function removeEndedRuns(children: BoardChildren, trackerDirectory: string, runs: readonly number[]): void {
  const brainFolder = brainFolderOf(trackerDirectory);
  const newestRun = Math.max(...runs);
  for (const run of runs) {
    if (run === newestRun || children.livenessOf(brainFolder, run).verdict === 'live') continue;
    for (const path of Object.values(childFilesOf(trackerDirectory, FLINT_BRAIN_FOLDER_NAME, run))) rmSync(path, { force: true });
    rmSync(runFolderOf(brainFolder, run), { recursive: true, force: true });
  }
}

/** A run an earlier Overseer left running had no one to end it at its time: it is stopped now. */
async function stopLeftoverRuns(children: BoardChildren, brainFolder: string, runs: readonly number[]): Promise<void> {
  for (const run of runs) {
    if (children.livenessOf(brainFolder, run).verdict === 'live') await children.stop(brainFolder, run, 0);
  }
}

export function createFlintBrainSessionHost(facts: FlintBrainHostFacts): FlintBrainSessionHost {
  const children = facts.boardChildren;
  const brainFolder = brainFolderOf(facts.trackerDirectory);
  return Object.freeze<FlintBrainSessionHost>({
    launch: async (planOf) => {
      const earlierRuns = runsIn(children, brainFolder);
      await stopLeftoverRuns(children, brainFolder, earlierRuns);
      if (earlierRuns.length > 0) removeEndedRuns(children, facts.trackerDirectory, earlierRuns);
      const run = Math.max(0, ...earlierRuns) + 1;
      const place = { run, workingDirectory: join(brainFolder, SESSION_FOLDER_NAME), jobFilesDirectory: runFolderOf(brainFolder, run) };
      mkdirSync(place.workingDirectory, { recursive: true });
      const outcome = await children.launchAgent({
        childFolder:                    brainFolder,
        instance:                       run,
        label:                          FLINT_BRAIN_CHILD_LABEL,
        workingDirectory:               place.workingDirectory,
        plan:                           planOf(place),
        treeStopAtEndGraceMilliseconds: null,
      });
      if (outcome.verdict === 'launched' || outcome.verdict === 'already-launched') return { verdict: 'launched', run };
      return { verdict: 'refused', reason: outcome.verdict === 'refused' ? `Talos refused the launch: ${outcome.reason}` : 'no Talos serves the board' };
    },
    linesAfter: (run, afterSequence) => {
      const entries = children.eventsAfter(brainFolder, run, afterSequence);
      if (entries === 'malformed') return { lines: [], lastSequence: afterSequence };
      return {
        lines:        entries.filter((entry) => entry.origin === 'agent').map((entry) => entry.line),
        lastSequence: entries.reduce((last, entry) => Math.max(last, entry.sequence), afterSequence),
      };
    },
    standingOf: (run) => {
      const liveness = children.livenessOf(brainFolder, run);
      if (liveness.verdict === 'ended' || liveness.verdict === 'lost') return 'ended';
      return liveness.verdict === 'live' && liveness.state === 'running' ? 'running' : 'starting';
    },
    write: async (run, line) => await children.sendInput(brainFolder, run, { act: 'write-line', line }),
    stop:  async (run) => {
      if (children.livenessOf(brainFolder, run).verdict === 'live') await children.stop(brainFolder, run, 0);
    },
    acknowledgeEnd: (run) => Promise.resolve(children.livenessOf(brainFolder, run).verdict !== 'live'),
  });
}

/** How many looks an Overseer's stop gives a stopped brain session to end, inside the stop's own bound, before it leaves the run behind. */
const STOP_LOOKS = 10;

/** The Overseer's stop: waits, by a bounded number of looks at the records, until no run's session is live. */
async function awaitRunsAtStop(children: BoardChildren, trackerDirectory: string, lookIntervalMilliseconds: number): Promise<void> {
  const brainFolder = brainFolderOf(trackerDirectory);
  const runs = runsIn(children, brainFolder);
  const anyRunIsLive = (): boolean => runs.some((run) => children.livenessOf(brainFolder, run).verdict === 'live');
  for (let look = 0; look < STOP_LOOKS && anyRunIsLive(); look += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, lookIntervalMilliseconds);
    });
  }
}

export const FlintBrainSessionHosts = Object.freeze({ brainFolderOf, awaitRunsAtStop });
