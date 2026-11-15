/**
 * The `-` guard every reader of standard input shares. What matters: a terminal is refused as an actionable refusal naming the option,
 * because it would read as empty text and replace what is stored; piped input passes, empty input included, since an empty pipe is what
 * the user sent.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { OperationRefusal }                               from '../src/shared/OperationRefusal.ts';
import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { requirePipedStandardInput }                      from './PipedStandardInput.ts';
import { createCapturedCommandContext }                   from './testing/CapturedCommandContext.ts';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('piped-standard-input');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('a terminal is refused as an actionable refusal naming the option', () => {
  const terminal = createCapturedCommandContext({ currentDirectory: scratchDirectory, standardInputIsTerminal: true });

  let refusal: unknown;
  try {
    requirePipedStandardInput(terminal, 'body-file');
  } catch (problem) {
    refusal = problem;
  }

  expect(refusal).toBeInstanceOf(OperationRefusal);
  expect((refusal as OperationRefusal).status).toBe('refused');
  expect((refusal as OperationRefusal).message).toContain('--body-file - reads standard input, and standard input is a terminal');
});

test('piped standard input passes, empty input included', () => {
  const piped = createCapturedCommandContext({ currentDirectory: scratchDirectory, standardInputText: '' });

  expect(() => requirePipedStandardInput(piped, 'file')).not.toThrow();
});
