/**
 * The `resume` verb's arguments. What matters: `J12` (in either case) names a job and anything else a ticket as written, `--all` and
 * `--network-outage` name their targets, exactly one target is named, and an extra positional or an unknown option is refused with the
 * usage. Then the verb on a scratch board: nothing waiting prints so at exit 0, and a job that is not on the board is refused at exit 1.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { OperationRefusal }                       from '../../src/shared/OperationRefusal.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createArgumentParser }                   from '../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { resumeTargetOf }                         from './ResumeCommand.ts';

const SPEC_CLOCK = (): Date => new Date('2026-11-19T01:15:00Z');

function refusalTextOf(writtenArguments: readonly string[]): string {
  try {
    resumeTargetOf(createArgumentParser(writtenArguments));
  } catch (error) {
    if (error instanceof OperationRefusal) return error.message;
    throw error;
  }
  throw new Error('The arguments were not refused.');
}

describe('the resume target', () => {
  test.each([
    [['J12'], { jobId: 'J12' }],
    [['j12'], { jobId: 'J12' }],
    [['12'], { ticketReference: '12' }],
    [['#12'], { ticketReference: '#12' }],
    [['--all'], 'all'],
    [['--network-outage', '--json'], 'network-outage'],
  ] as const)('%p names %p', (writtenArguments, target) => {
    expect(resumeTargetOf(createArgumentParser(writtenArguments))).toEqual(target);
  });

  test.each([
    [['J12', '--all']],
    [['--all', '--network-outage']],
    [['12', '--network-outage']],
    [[]],
  ] as const)('%p is refused: exactly one target, with the usage', (writtenArguments) => {
    const text = refusalTextOf(writtenArguments);
    expect(text).toContain('Name one job or ticket, or write --all or --network-outage, never two of them.');
    expect(text).toContain('Usage: ');
  });

  test('an extra positional is refused with the usage', () => {
    const text = refusalTextOf(['J12', '13']);
    expect(text).toContain('Unexpected extra argument(s): "13"');
    expect(text).toContain('resume --network-outage [--json]');
  });

  test('a job id that is not J and a number is refused as a job id', () => {
    expect(refusalTextOf(['Jx'])).toContain('"Jx" is not a job id.');
  });

  test('an unknown option is refused with the usage', () => {
    expect(refusalTextOf(['--every'])).toContain('Unknown option(s): --every.');
  });
});

const recordedGit = useRecordedGit();

describeWhenGitIsRecorded('resume on a scratch board', () => {
  let repositoryDirectory = '';

  beforeEach(async () => {
    repositoryDirectory = await createInitializedRecordedGitRepository('resume', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  });

  afterEach(() => {
    removeScratchDirectory(repositoryDirectory);
  });

  test.each([['--all'], ['--network-outage']])('%s with nothing interrupted prints that nothing waits, at exit 0', async (flag) => {
    const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
    const exitCode = await runCommandLine(['resume', flag], captured);
    expect({ exitCode, output: captured.outputText().trim() }).toEqual({ exitCode: 0, output: 'Nothing interrupted waits for a resume.' });
  });

  test('a job not on the board is refused at exit 1', async () => {
    const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
    const exitCode = await runCommandLine(['resume', 'J9'], captured);
    expect(exitCode).toBe(1);
    expect(captured.errorText()).toContain('J9');
  });
});
