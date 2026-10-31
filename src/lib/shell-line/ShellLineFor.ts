/** The one selector of the `ShellLine` port; a platform with no adapter refuses a spawn and reads every exit as `cannot-run`. */
import { createPosixShellLine, type ShellLinePrimitives } from './PosixShellLine.ts';
import type { ShellLine }                                 from './ShellLine.ts';

function createUnsupportedShellLine(platform: string): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf: () => {
      throw new Error(`no shell line exists for the platform ${platform}`);
    },
    exitMeaningOf: () => 'cannot-run',
    lineGrammar:   'none',
  });
}

export function shellLineFor(platform: string, primitives: ShellLinePrimitives): ShellLine {
  return platform === 'darwin' || platform === 'linux' ? createPosixShellLine(primitives) : createUnsupportedShellLine(platform);
}
