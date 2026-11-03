/**
 * The line-ending policy: `.gitattributes` holds every text file at LF on every checkout, since a carriage return breaks `setup.sh`, the
 * hooks, the prose wrap and the frozen tables. The scan reads `git ls-files --eol`, on both the index and the working tree side. Git files a
 * text file with a lone carriage return under `-text`, so a file git calls binary is read too, a NUL byte being what makes it truly binary.
 * Each form is planted in a scratch repository to prove the scan names it and passes what it skips. `src/LineEndingPolicy.spec.ts` holds
 * the policy line and a byte scan of the repository files that runs no git.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import { afterEach, expect } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from './testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent, testWhenGitIsPresent } from './testing/ToolGuard.ts';

interface TrackedFileEndings {
  readonly path:           string;
  readonly indexEnding:    string;
  readonly worktreeEnding: string;
  readonly attributes:     string;
}

const POLICY_ATTRIBUTES  = 'text=auto eol=lf';

const ENDINGS_HOLDING_A_CARRIAGE_RETURN = ['crlf', 'mixed'];
const ENDING_GIT_CALLS_BINARY           = '-text';

const CARRIAGE_RETURN_BYTE = 0x0d;
const NUL_BYTE             = 0x00;

function trackedFilesIn(repositoryDirectory: string): TrackedFileEndings[] {
  return gitOutputIn(repositoryDirectory, ['ls-files', '--eol', '-z'])
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [fields = '', path = ''] = entry.split('\t');
      const [, indexEnding = '', worktreeEnding = '', attributes = ''] = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*?)\s*$/.exec(fields) ?? [];
      return {
        path, indexEnding, worktreeEnding, attributes
      };
    });
}

function isTextWithALoneCarriageReturn(filePath: string): boolean {
  const bytes = readFileSync(filePath);
  return bytes.includes(CARRIAGE_RETURN_BYTE) && !bytes.includes(NUL_BYTE);
}

function carriageReturnHoldersIn(repositoryDirectory: string): string[] {
  return trackedFilesIn(repositoryDirectory)
    .filter(({ path, indexEnding, worktreeEnding }) => ENDINGS_HOLDING_A_CARRIAGE_RETURN.includes(indexEnding)
      || ENDINGS_HOLDING_A_CARRIAGE_RETURN.includes(worktreeEnding)
      || (worktreeEnding === ENDING_GIT_CALLS_BINARY && isTextWithALoneCarriageReturn(join(repositoryDirectory, path))))
    .map(({ path }) => path);
}

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

describeWhenGitIsPresent('the line endings of this repository', () => {
  testWhenGitIsPresent('git applies the LF policy to every tracked file', () => {
    const trackedFiles = trackedFilesIn(REPOSITORY_ROOT);
    expect(trackedFiles.map(({ path }) => path)).toContain('CLAUDE.md');
    expect(trackedFiles.filter(({ attributes }) => attributes !== POLICY_ATTRIBUTES).map(({ path }) => path)).toEqual([]);
  });

  testWhenGitIsPresent('no tracked text file holds a carriage return', () => {
    expect(carriageReturnHoldersIn(REPOSITORY_ROOT)).toEqual([]);
  });
});

describeWhenGitIsPresent('the carriage return scan, on planted files', () => {
  let scratchRepository = '';

  afterEach(() => {
    if (scratchRepository !== '') removeScratchDirectory(scratchRepository);
    scratchRepository = '';
  });

  testWhenGitIsPresent('names a CRLF, a mixed and a lone carriage return file, committed or only in the working tree', () => {
    scratchRepository = createScratchGitRepository('line-ending-policy');
    commitFile(scratchRepository, 'committed-crlf.md', 'first\r\nsecond\r\n');
    commitFile(scratchRepository, 'committed-mixed.md', 'first\r\nsecond\n');
    commitFile(scratchRepository, 'lone-carriage-return.md', 'first\rsecond\n');
    commitFile(scratchRepository, 'edited-to-crlf.md', 'first\n');
    writeFileSync(join(scratchRepository, 'edited-to-crlf.md'), 'first\r\n');

    expect(carriageReturnHoldersIn(scratchRepository).toSorted()).toEqual(['committed-crlf.md', 'committed-mixed.md', 'edited-to-crlf.md', 'lone-carriage-return.md']);
  });

  testWhenGitIsPresent('passes an LF file, an empty file and a binary file whose bytes hold a carriage return', () => {
    scratchRepository = createScratchGitRepository('line-ending-policy');
    commitFile(scratchRepository, 'plain.md', 'first\nsecond\n');
    commitFile(scratchRepository, 'empty.md', '');
    commitFile(scratchRepository, 'picture.png', '\u0000binary\r\nbytes');

    expect(carriageReturnHoldersIn(scratchRepository)).toEqual([]);
  });
});
