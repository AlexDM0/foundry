/**
 * The restore after a gate changed the snapshot, against a mocked git. What matters is that `checkout -q -- .` runs with the snapshot's
 * parent as its ceiling: a snapshot that lost its `.git` then refuses, and the checkout never discards the main checkout's changes.
 */
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';
import { GitProcess, type GitHookPolicy, type GitRun }    from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                   from '../../lib/git/GitWorktrees.ts';
import { environmentCopy }                                from '../../shared/Environment.ts';
import { runsAsGiven }                                    from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { PROPOSAL_RUN_COUNT, ProposalTwiceRun }           from './ProposalTwiceRun.ts';

const TRACKED_CHANGE = 'diff --git a/example.txt b/example.txt\n';

interface RecordedGitCall {
  gitArguments:     readonly string[];
  ceilingDirectory: string | undefined;
}

let snapshotDirectory = '';
let recordedRuns: RecordedGitCall[] = [];

beforeEach(() => {
  snapshotDirectory = createScratchDirectory('proposal-restore');
  recordedRuns = [];
  spyOn(GitProcess, 'run').mockImplementation(
    (_directory: string, gitArguments: readonly string[], _hookPolicy?: GitHookPolicy, _standardInput?: string, ceilingDirectory?: string): GitRun => {
      recordedRuns.push({ gitArguments, ceilingDirectory });
      return { exitCode: 0, standardOutput: gitArguments[0] === 'diff' ? TRACKED_CHANGE : '', standardError: '' };
    }
  );
});

afterEach(() => {
  spyOn(GitProcess, 'run').mockRestore();
  removeScratchDirectory(snapshotDirectory);
});

test('a gate that changed a tracked file is restored with the snapshot\'s parent as the ceiling', async () => {
  let clock = 0;
  await ProposalTwiceRun.runProposalTwice({
    shellLine:       nativePlatformPorts().shellLine,
    spawnOptions:    nativePlatformPorts().processSupervision.spawnOptionsFor('gate'),
    prepare:         [],
    gates:           [{ name: 'example', run: 'true' }],
    directory:       snapshotDirectory,
    snapshotCommit:  'a'.repeat(40),
    environment:     environmentCopy(),
    confinedLineOf:  runsAsGiven,
    millisecondsNow: () => {
      clock += 1;
      return clock;
    },
  });
  const restores = recordedRuns.filter((call) => call.gitArguments[0] === 'checkout');
  expect(restores).toHaveLength(PROPOSAL_RUN_COUNT);
  for (const restore of restores) expect(restore).toEqual({ gitArguments: ['checkout', '-q', '--', '.'], ceilingDirectory: GitWorktrees.ceilingOf(snapshotDirectory) });
  for (const call of recordedRuns) expect(call.ceilingDirectory).toBe(GitWorktrees.ceilingOf(snapshotDirectory));
});
