/** The one selector of the `ShellLine` port; a platform with no adapter refuses every folder and spawn, and reads every exit as `cannot-run`. */
import { createPosixShellLine, type PosixShellPrimitives }         from './PosixShellLine.ts';
import type { ShellLine, ShellSpawnRefusal }                       from './ShellLine.ts';
import { createWindowsCommandLine, type WindowsCommandPrimitives } from './WindowsCommandLine.ts';

export type ShellLinePrimitives = PosixShellPrimitives & WindowsCommandPrimitives;

const NO_SHELL_GRAMMAR = Object.freeze<ShellSpawnRefusal>({ verdict: 'refused', refusal: 'no-shell-grammar' });

function createUnsupportedShellLine(): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf:      () => NO_SHELL_GRAMMAR,
    runRefusalOf:        () => NO_SHELL_GRAMMAR.refusal,
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
  return platform === 'win32' ? createWindowsCommandLine(primitives) : createUnsupportedShellLine();
}
