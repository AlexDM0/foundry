/**
 * A `pipeline.json` an earlier release wrote, with no `version` or one below 2, is refused, never rewritten: no release converts a pipeline,
 * so the refusal does not carry the update sentence of `OLDER_FORMAT_ADVICE`, which would send the reader to a release that cannot help. It
 * tells the reader to set the pipeline up again. What matters: every `gate` verb that writes, and `gate list`, refuses it at exit 1 with
 * that wording, and the file stays byte for byte. A version 2 file, which every release since pipeline versions began wrote, is no older
 * file: `gate list` reads it with the hash version 2 gave it, and a `gate` write keeps it version 2 until it needs a key of version 3. A
 * version 3 file stays version 3 through a `gate` write: version 4 is only for a pipeline with entities, which no `gate` verb adds.
 * The version 2 file is `src/adapters/pipeline/FrozenVersionTwoPipeline.json`, taken from forge at `db64ed0a`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
}                                                 from 'bun:test';
import { OLDER_FORMAT_ADVICE }                    from '../src/adapters/constants/OlderFormatAdvice.ts';
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
];

const VERSION_TWO_PIPELINE_TEXT = readFileSync(join(import.meta.dir, '..', 'src', 'adapters', 'pipeline', 'FrozenVersionTwoPipeline.json'), 'utf8');

const VERSION_TWO_CONTENT_HASH = '29d82186f27c4ed4';

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
    const { pipelineFilePath } = workspacePathsFor(repositoryDirectory);
    writeFileSync(pipelineFilePath, olderPipelineText);
    const expectedText = `${pipelineFilePath} was written by an earlier ${PRODUCT_NAMES.PROGRAM}, in a pipeline format this one does not read, `
      + 'and no release converts it, so the board holds new work as if no pipeline were set and nothing was written. Set the pipeline up '
      + `again on the Pipeline tab of the Bridge, or with \`${PRODUCT_NAMES.PROGRAM} pipeline setup\`.`;

    for (const verb of [
      ['gate', 'add', 'lint', '--', 'bun run lint'],
      ['gate', 'add', 'lint', '--phases', 'build,merge', '--', 'bun run lint'],
      ['gate', 'order', 'merge', 'test'],
      ['gate', 'prepare', 'install', '--', 'bun install'],
      ['gate', 'remove', 'test'],
      ['gate', 'none'],
      ['gate', 'approval', 'tickets', 'off'],
      ['gate', 'list'],
    ]) {
      const refused = await run(verb);

      expect(refused.exitCode, verb.join(' ')).toBe(1);
      expect(refused.errorText, verb.join(' ')).toContain(expectedText);
      expect(refused.errorText, verb.join(' ')).not.toContain(OLDER_FORMAT_ADVICE);
    }
    expect(readFileSync(pipelineFilePath, 'utf8')).toBe(olderPipelineText);
  });
});

describeWhenGitIsRecorded('a version 2 pipeline.json from before version 3', () => {
  test('is listed as version 2 with the content hash version 2 gave it, and a gate write keeps it version 2 until a reach needs version 3', async () => {
    const { pipelineFilePath } = workspacePathsFor(repositoryDirectory);
    writeFileSync(pipelineFilePath, VERSION_TWO_PIPELINE_TEXT);

    const listed = await run(['gate', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.outputText)).toMatchObject({ version: 2, contentHash: VERSION_TWO_CONTENT_HASH });

    expect((await run(['gate', 'approval', 'merge', 'on'])).exitCode).toBe(0);
    const versionTwoDocument = JSON.parse(VERSION_TWO_PIPELINE_TEXT) as { approvals: Record<string, boolean> };
    expect(JSON.parse(readFileSync(pipelineFilePath, 'utf8'))).toEqual({ ...versionTwoDocument, approvals: { ...versionTwoDocument.approvals, merge: true } });

    expect((await run(['gate', 'reach', '/packages/shared'])).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(pipelineFilePath, 'utf8'))).toMatchObject({ version: 3, reach: ['/packages/shared'] });
  });
});

describeWhenGitIsRecorded('a version 3 pipeline.json, read beside versions 2 and 4', () => {
  test('is listed as version 3, and a gate write keeps it version 3, never the version 4 of a pipeline with entities', async () => {
    const { pipelineFilePath } = workspacePathsFor(repositoryDirectory);
    writeFileSync(pipelineFilePath, VERSION_TWO_PIPELINE_TEXT);
    expect((await run(['gate', 'reach', '/packages/shared'])).exitCode).toBe(0);

    expect((await run(['gate', 'approval', 'merge', 'on'])).exitCode).toBe(0);
    const written = JSON.parse(readFileSync(pipelineFilePath, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({ version: 3, reach: ['/packages/shared'] });
    expect(written).not.toHaveProperty('entities');

    const listed = await run(['gate', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.outputText)).toMatchObject({ version: 3 });
  });
});
