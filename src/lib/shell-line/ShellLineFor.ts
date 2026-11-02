/** The one selector of the `ShellLine` port; a platform with no adapter refuses a spawn and reads every exit as `cannot-run`. */
import { createPosixShellLine, type PosixShellPrimitives }         from './PosixShellLine.ts';
import type { ShellLine }                                          from './ShellLine.ts';
import { createWindowsCommandLine, type WindowsCommandPrimitives } from './WindowsCommandLine.ts';

export type ShellLinePrimitives = PosixShellPrimitives & WindowsCommandPrimitives;

function createUnsupportedShellLine(platform: string): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf: () => {
      throw new Error(`no shell line exists for the platform ${platform}`);
    },
    runRefusalOf:        () => null,
    exitMeaningOf:       () => 'cannot-run',
    lineLimitCharacters: null,
    // No grammar to split in, so no word of a line is granted.
    executablesOf:       () => [],
    // No grammar to join in: each step on its own line, its folder named beside it.
    displayLineOf:       (steps) => steps.map(({ line, workingDirectory }) => (workingDirectory === null ? line : `${line}    (in ${workingDirectory})`)).join('\n'),
    lineGrammar:         'none',
  });
}

export function shellLineFor(platform: string, primitives: ShellLinePrimitives): ShellLine {
  if (platform === 'darwin' || platform === 'linux') return createPosixShellLine(primitives);
  return platform === 'win32' ? createWindowsCommandLine(primitives) : createUnsupportedShellLine(platform);
}
