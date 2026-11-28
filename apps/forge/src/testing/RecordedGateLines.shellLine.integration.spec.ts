/**
 * Records the spawn request the native shell line builds for a plain line, a line with quotes and a line with the variable mark of its
 * grammar. What matters is that each line reaches the shell whole, so the real shell prints what the line says, and that the mock of
 * `src/testing/RecordedGateLines.ts` reads a gate spawn against the argv this machine really builds.
 */
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

import { expect, test } from 'bun:test';

import { userShell }                                                                from '../shared/Environment.ts';
import { nativePlatformPorts }                                                      from './NativePlatformPorts.ts';
import { recordAnswer }                                                             from './RecordedAnswers.ts';
import { RECORDED_GATE_PLACEHOLDERS, RECORDED_SHELL_LINES, SHELL_LINE_CALL_SHAPES } from './RecordedGateLines.ts';
import { spawningShellRequestOf }                                                   from './SpawningShellRequest.ts';

const { shellLine } = nativePlatformPorts();
const STATUS_FILE = join(tmpdir(), 'example-line-status');
const EXAMPLE_SEARCH_PATH = '/usr/bin:/bin';

const RECORDED_CASES = [
  { callShape: SHELL_LINE_CALL_SHAPES.PLAIN, line: RECORDED_SHELL_LINES.PLAIN, printed: 'plain' },
  { callShape: SHELL_LINE_CALL_SHAPES.QUOTED, line: RECORDED_SHELL_LINES.QUOTED, printed: 'it\'s quoted' },
  { callShape: SHELL_LINE_CALL_SHAPES.VARIABLE, line: RECORDED_SHELL_LINES.VARIABLE, printed: EXAMPLE_SEARCH_PATH },
] as const;

for (const { callShape, line, printed } of RECORDED_CASES) {
  test(`the native shell line hands over ${callShape.split(', ')[1] ?? callShape} whole, and the real shell runs it as written`, () => {
    const request = spawningShellRequestOf(shellLine, line, STATUS_FILE);

    const run = Bun.spawnSync({ cmd: [...request.argv], env: { PATH: EXAMPLE_SEARCH_PATH }, windowsVerbatimArguments: request.verbatimArguments });

    expect(run.stdout.toString().trim()).toBe(printed);
    const recordedArgv = request.argv.map((argument) => argument.replaceAll(STATUS_FILE, RECORDED_GATE_PLACEHOLDERS.STATUS_FILE));
    const userShellIndex = recordedArgv.lastIndexOf(userShell() ?? RECORDED_GATE_PLACEHOLDERS.USER_SHELL);
    recordAnswer(callShape, {
      argv:              recordedArgv.map((argument, i) => (i === userShellIndex ? RECORDED_GATE_PLACEHOLDERS.USER_SHELL : argument)),
      verbatimArguments: request.verbatimArguments,
    });
  });
}
