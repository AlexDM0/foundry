// What `claude` resolves to under an npm global install: the file PATH finds, what it starts with and what npm says.
// Nothing here runs a session; only a program given by `--claude-program` is asked its version.
import { closeSync, openSync, readSync, realpathSync } from 'node:fs';

import { claudeProgramOption, probe } from './support/probe.js';
import { attempt, programPathOf, runProgram } from './support/programs.js';

const FILE_HEAD_BYTES = 200;

function fileHeadOf(path) {
  const bytes = new Uint8Array(FILE_HEAD_BYTES);
  const file = openSync(path, 'r');
  const bytesRead = readSync(file, bytes);
  closeSync(file);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, bytesRead));
}

await probe({
  unknown: 'host-npm-global-resolution',
  observe: async () => {
    const resolvedPath = programPathOf('claude');
    const claudeProgram = claudeProgramOption();
    return {
      resolvedPath,
      realPath: resolvedPath === null ? null : await attempt(() => realpathSync(resolvedPath)),
      fileHead: resolvedPath === null ? null : await attempt(() => fileHeadOf(resolvedPath)),
      npmGlobalPrefix: await runProgram(['npm', 'prefix', '-g']),
      windowsWhere: process.platform === 'win32' ? await runProgram(['where', 'claude']) : null,
      versionOfGivenProgram: claudeProgram === null ? null : await runProgram([claudeProgram, '--version']),
    };
  },
});
