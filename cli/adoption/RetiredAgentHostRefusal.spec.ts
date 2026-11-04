/**
 * A repository an install before version 11 adopted for the Copilot CLI host. The cases that matter: `init` and `update` both refuse it at
 * exit 1 before their first write, naming the Copilot files and the manifest key to remove, since the old worker and extension would keep
 * running beside the Claude Code ones; and a manifest naming any other host, or none, installs as before.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import { afterEach, expect } from 'bun:test';

import { PRODUCT_NAMES } from '../../src/shared/constants/ProductNames.ts';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                   from '../../src/testing/ChildProcessCaseTimeout.ts';
import { type RecordedGitStage, useRecordedGit }                                     from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                                    from '../../src/testing/ScratchWorkspace.ts';
import { testWithGitRecording }                                                      from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                            from '../Main.ts';
import { createCapturedCommandContext }                                              from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                                    from '../testing/InitializedScratchRepository.ts';
import { COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION, REFRESH_OF_AN_IGNORING_REPOSITORY } from '../testing/RecordedGitStages.ts';
import { repositoryFileContentsOf }                                                  from '../testing/RepositoryFileContents.ts';

const COPILOT_MANIFEST_TEXT = '{\n  "installVersion": 10,\n  "agentHost": "copilot-cli"\n}\n';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

/** Each with the git calls it makes before its refusal: `update` none, `init` its own checks. */
const COMMANDS_THAT_INSTALL: ReadonlyArray<[commandLine: string[], stage: RecordedGitStage]> = [
  [['update'], []],
  [['init', '--project', 'Example Agency'], [COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION]],
];

const recordedGit = useRecordedGit();

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

async function trackedRepositoryWithManifest(manifestText: string): Promise<string> {
  const repositoryDirectory = await createInitializedRecordedGitRepository('retired-copilot-install', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  scratchDirectories.push(repositoryDirectory);
  writeFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json'), manifestText);
  return repositoryDirectory;
}

testWithGitRecording('init and update refuse a manifest naming copilot-cli at exit 1, writing nothing and naming the Copilot files', async () => {
  for (const [commandLine, stage] of COMMANDS_THAT_INSTALL) {
    const repositoryDirectory = await trackedRepositoryWithManifest(COPILOT_MANIFEST_TEXT);
    const filesBefore = repositoryFileContentsOf(repositoryDirectory);
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });

    expect(await recordedGit.playStage(stage, async () => runCommandLine(commandLine, context)), commandLine.join(' ')).toBe(1);
    expect(repositoryFileContentsOf(repositoryDirectory), commandLine.join(' ')).toEqual(filesBefore);
    for (const named of ['copilot-cli', '.github/agents/agent-progress-worker.agent.md', '.github/extensions/agent-progress/', 'agentHost', 'Nothing was written']) {
      expect(context.errorText(), `${commandLine.join(' ')} names ${named}`).toContain(named);
    }
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWithGitRecording('a manifest naming another agent host, or none, is no refusal: update installs and drops the key', async () => {
  for (const manifestText of ['{\n  "installVersion": 10,\n  "agentHost": "example-host"\n}\n', '{\n  "installVersion": 10\n}\n']) {
    const repositoryDirectory = await trackedRepositoryWithManifest(manifestText);
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });

    expect(await recordedGit.playStage(REFRESH_OF_AN_IGNORING_REPOSITORY, async () => runCommandLine(['update'], context)), manifestText).toBe(0);
    expect(repositoryFileContentsOf(repositoryDirectory).get(join(PRODUCT_NAMES.DATA_FOLDER, 'version.json')), manifestText).not.toContain('agentHost');
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
