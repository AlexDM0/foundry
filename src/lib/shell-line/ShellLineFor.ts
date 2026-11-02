/** The one selector of the `ShellLine` port; a platform with no adapter refuses a spawn and reads every exit as `cannot-run`. */
import { createPosixShellLine, type ShellLinePrimitives } from './PosixShellLine.ts';
import type { ShellLine }                                 from './ShellLine.ts';

function createUnsupportedShellLine(platform: string): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf: () => {
      throw new Error(`no shell line exists for the platform ${platform}`);
    },
    exitMeaningOf: () => 'cannot-run',
    // No grammar to join in: each step on its own line, its folder named beside it.
    displayLineOf: (steps) => steps.map(({ line, workingDirectory }) => (workingDirectory === null ? line : `${line}    (in ${workingDirectory})`)).join('\n'),
    lineGrammar:   'none',
  });
}

export function shellLineFor(platform: string, primitives: ShellLinePrimitives): ShellLine {
  return platform === 'darwin' || platform === 'linux' ? createPosixShellLine(primitives) : createUnsupportedShellLine(platform);
}
