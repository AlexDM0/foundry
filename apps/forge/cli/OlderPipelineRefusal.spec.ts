/**
 * A `pipeline.json` an earlier release wrote, with no `version` or one below the one format's, is refused, never rewritten: no release
 * converts a pipeline, so the refusal does not carry the update sentence of `OLDER_FORMAT_ADVICE`, which would send the reader to a release
 * that cannot help. It tells the reader to set the pipeline up again. What matters: every `gate` verb that writes, and `gate list`, refuses
 * it at exit 1 with that wording, and the file stays byte for byte; a file of version 2, 3 or 4, which earlier releases read, is as old.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test
}                                                 from 'bun:test';
import { OLDER_FORMAT_ADVICE }                    from '../src/adapters/constants/OlderFormatAdvice.ts';
import { localStoreLayoutOf }                     from '../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                      from '../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                          from '../src/shared/constants/ProductNames.ts';
import { useRecordedGit }                         from '../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../src/testing/ToolGuard.ts';
import { runCommandLine }                         from './Main.ts';
import { createCapturedCommandContext }           from './testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from './testing/InitializedScratchRepository.ts';

const FROZEN_NOW = new Date('2026-11-12T09:00:00Z');

const OLDER_PIPELINE_TEXTS: readonly [string, string][] = [
  ['with no version', '{\n  "prepare": [],\n  "gates": [{ "name": "test", "run": "bun test" }],\n  "constitution": ["CLAUDE.md"]\n}\n'],
  ['with version 1', '{\n  "version": 1,\n  "prepare": [],\n  "gates": [{ "name": "test", "run": "bun test" }],\n  "constitution": ["CLAUDE.md"]\n}\n'],
  ...[2, 3, 4].map((version): [string, string] => [
    `with version ${version}`,
    `${JSON.stringify({
      version, prepare: [], gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'], review: ['test'], merge: ['test'] }
    }, null, 2)}\n`,
  ]),
];

let repositoryDirectory = '';

async function run(commandLineArguments: readonly string[]): Promise<{ exitCode: number; outputText: string; errorText: string }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, outputText: context.outputText(), errorText: context.errorText() };
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('older-pipeline-refusal', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('a pipeline.json an earlier release wrote', () => {
  test.each(OLDER_PIPELINE_TEXTS)('%s is refused at exit 1 by every gate verb that writes and by gate list, worded to set it up again, and left as it was', async (
    _description,
    olderPipelineText,
  ) => {
    const { pipelineRecordPath } = localStoreLayoutOf(workspacePathsFor(repositoryDirectory));
    writeFileSync(pipelineRecordPath, olderPipelineText);
    const expectedText = `${pipelineRecordPath} was written by an earlier ${PRODUCT_NAMES.PROGRAM}, in a pipeline format this one does not read, `
      + 'and no release converts it, so the board holds new work as if no pipeline were set and nothing was written. Set the pipeline up '
      + `again with \`${PRODUCT_NAMES.PROGRAM} pipeline setup\`.`;

    for (const verb of [
      ['gate', 'add', 'lint', '--', 'bun run lint'],
      ['gate', 'add', 'lint', '--phases', 'build,merge', '--', 'bun run lint'],
      ['gate', 'order', 'merge', 'test'],
      ['gate', 'prepare', 'install', '--', 'bun install'],
      ['gate', 'remove', 'test'],
      ['gate', 'none'],
      ['gate', 'approval', 'tickets', 'off'],
      ['gate', 'assistant', 'on'],
      ['gate', 'list'],
    ]) {
      const refused = await run(verb);

      expect(refused.exitCode, verb.join(' ')).toBe(1);
      expect(refused.errorText, verb.join(' ')).toContain(expectedText);
      expect(refused.errorText, verb.join(' ')).not.toContain(OLDER_FORMAT_ADVICE);
    }
    expect(readFileSync(pipelineRecordPath, 'utf8')).toBe(olderPipelineText);
  });
});
