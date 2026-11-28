/**
 * The facts an Airlock agent's launch reads from its merge job's folder. What matters: a red handoff kept there that cannot be read stops the
 * launch and names the merge job, which owns the file, so the incident holds the merge job and a fresh agent cannot open it again.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import { afterEach, expect, test }  from 'bun:test';

import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AirlockFactsFile }                               from './AirlockFactsFile.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { LaunchFacts }                                    from './LaunchFacts.ts';

const AT = '2026-11-27T10:00:00+01:00';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

test('a red handoff in the merge job\'s folder that cannot be read stops the agent\'s launch, naming the merge job that owns it', () => {
  const trackerDirectory = createScratchDirectory('airlock-facts');
  folders.push(trackerDirectory);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const { job: mergeJob } = board.launchJob({
    kind: 'merge', role: null, ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  const { job: mergeAgent } = board.launchJob({
    kind: 'merge-agent', role: 'builder', ticketIds: ['001'], parentJobId: mergeJob.id, attempt: 1, target: 'main'
  }, AT);
  const mergeJobFolder = jobFolderIn(trackerDirectory, mergeJob.id);
  mkdirSync(mergeJobFolder, { recursive: true });
  AirlockFactsFile.keep(mergeJobFolder, { conflictedFiles: ['shared.txt'], leavesTheMergeOpen: false, filesResolvedBefore: [] });
  writeFileSync(join(mergeJobFolder, 'red-handoff.json'), '{"resume": ');

  const facts = LaunchFacts.airlockFactsOf(board, trackerDirectory, mergeAgent, join(trackerDirectory, 'example-airlock-worktree'));

  const problem = { code: 'not-json', parserError: expect.any(String) as string } as const;
  expect(facts).toEqual({ unreadableJobFile: { jobId: mergeJob.id, file: `jobs/${mergeJob.id}/red-handoff.json`, problem } });
});
