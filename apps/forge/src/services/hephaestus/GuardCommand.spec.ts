/**
 * The guard command decider on real files in a scratch folder. What matters: Hephaestus's own command is taken whole only when its runtime
 * and its entry script are absolute files outside the repository, after links are resolved both ways; any other command is refused with the
 * part and the cause, which the launch log words. Symlinks matter because a Bun bin shim is a link into a checkout.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join }                                  from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GuardCommand }                                   from './GuardCommand.ts';

let scratch = '';
let repository = '';
let runtime = '';
let entryScript = '';

beforeEach(() => {
  scratch = createScratchDirectory('guard-command');
  repository = join(scratch, 'example-repository');
  mkdirSync(join(scratch, 'tool'), { recursive: true });
  mkdirSync(repository);
  runtime = join(scratch, 'tool', 'bun');
  entryScript = join(scratch, 'tool', 'agent-progress.ts');
  writeFileSync(runtime, '');
  writeFileSync(entryScript, '');
});

afterEach(() => removeScratchDirectory(scratch));

test('found: the runtime, its isolating arguments and the entry script, outside the repository, are taken whole', () => {
  const command = [runtime, '--no-env-file', entryScript];
  expect(GuardCommand.guardCommandOf(command, repository)).toEqual({ verdict: 'found', command });
});

test('missing: an empty command refuses the runtime, and a runtime alone refuses the entry script, each with no path', () => {
  expect(GuardCommand.guardCommandOf([], repository)).toEqual({
    verdict: 'refused', part: 'runtime', cause: 'missing', path: null
  });
  expect(GuardCommand.guardCommandOf([runtime], repository)).toEqual({
    verdict: 'refused', part: 'entry-script', cause: 'missing', path: null
  });
});

test('missing: a relative runtime or an entry script with no file there is refused with its path', () => {
  expect(GuardCommand.guardCommandOf(['bun', entryScript], repository)).toEqual({
    verdict: 'refused', part: 'runtime', cause: 'missing', path: 'bun'
  });
  const absent = join(scratch, 'tool', 'absent.ts');
  expect(GuardCommand.guardCommandOf([runtime, absent], repository)).toEqual({
    verdict: 'refused', part: 'entry-script', cause: 'missing', path: absent
  });
});

test('inside the repository: an entry script in it is refused, and so is a link outside it that resolves into it', () => {
  const insideScript = join(repository, 'agent-progress.ts');
  writeFileSync(insideScript, '');
  const linkOutside = join(scratch, 'tool', 'linked-agent-progress');
  symlinkSync(insideScript, linkOutside);
  for (const path of [insideScript, linkOutside]) {
    expect(GuardCommand.guardCommandOf([runtime, path], repository)).toEqual({
      verdict: 'refused', part: 'entry-script', cause: 'inside-repository', path
    });
  }
});

test('inside the repository: a runtime under a repository root named through a link is refused', () => {
  const linkedRepository = join(scratch, 'linked-repository');
  symlinkSync(repository, linkedRepository);
  const insideRuntime = join(repository, 'bun');
  writeFileSync(insideRuntime, '');
  expect(GuardCommand.guardCommandOf([insideRuntime, entryScript], linkedRepository))
    .toEqual({
      verdict: 'refused', part: 'runtime', cause: 'inside-repository', path: insideRuntime
    });
});

test('the reason names the part, and the path and the repository when there is one', () => {
  expect(GuardCommand.refusalReasonOf({
    verdict: 'refused', part: 'entry-script', cause: 'missing', path: null
  }, repository))
    .toBe('the entry script is not in Hephaestus\'s command');
  expect(GuardCommand.refusalReasonOf({
    verdict: 'refused', part: 'runtime', cause: 'missing', path: 'bun'
  }, repository))
    .toBe('the Bun runtime bun is not an absolute path to a file');
  expect(GuardCommand.refusalReasonOf({
    verdict: 'refused', part: 'runtime', cause: 'inside-repository', path: '/example/bun'
  }, repository))
    .toBe(`the Bun runtime /example/bun lies inside the repository ${repository}`);
});
