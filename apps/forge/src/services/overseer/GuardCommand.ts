/**
 * The command the network guard hook runs: the Overseer's own Bun runtime and entry script, by absolute path, so no `PATH` lookup and no
 * shebang decides which program checks a call.
 */
import { existsSync, realpathSync }  from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

export type GuardCommandPart = 'runtime' | 'entry-script';

/** `missing`: absent from the command, relative, or no file there; `inside-repository`: it or what it links to lies in the repository root. */
export type GuardCommandCause = 'missing' | 'inside-repository';

export type GuardCommandVerdict =
  | { readonly verdict: 'found'; readonly command: readonly string[] }
  | { readonly verdict: 'refused'; readonly part: GuardCommandPart; readonly cause: GuardCommandCause; readonly path: string | null };

const PART_NAMES: Readonly<Record<GuardCommandPart, string>> = { 'runtime': 'the Bun runtime', 'entry-script': 'the entry script' };

function realPathOrItselfOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function liesInside(path: string, root: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function refusalOf(part: GuardCommandPart, path: string | undefined, repositoryRoot: string): GuardCommandVerdict | null {
  if (path === undefined || !isAbsolute(path) || !existsSync(path)) return {
    verdict: 'refused', part, cause: 'missing', path: path ?? null
  };
  const roots = [repositoryRoot, realPathOrItselfOf(repositoryRoot)];
  const paths = [path, realPathOrItselfOf(path)];
  const inside = roots.some((root) => paths.some((candidate) => liesInside(candidate, root)));
  return inside ? {
    verdict: 'refused', part, cause: 'inside-repository', path
  } : null;
}

/** `programCommand` is the runtime, its isolating arguments and the entry script, last; the runtime alone has no entry script. */
function guardCommandOf(programCommand: readonly string[], repositoryRoot: string): GuardCommandVerdict {
  const entryScript = programCommand.length > 1 ? programCommand.at(-1) : undefined;
  return refusalOf('runtime', programCommand[0], repositoryRoot)
    ?? refusalOf('entry-script', entryScript, repositoryRoot)
    ?? { verdict: 'found', command: [...programCommand] };
}

function refusalReasonOf(refusal: Extract<GuardCommandVerdict, { verdict: 'refused' }>, repositoryRoot: string): string {
  const partName = PART_NAMES[refusal.part];
  if (refusal.path === null) return `${partName} is not in the Overseer's command`;
  if (refusal.cause === 'missing') return `${partName} ${refusal.path} is not an absolute path to a file`;
  return `${partName} ${refusal.path} lies inside the repository ${repositoryRoot}`;
}

export const GuardCommand = Object.freeze({
  guardCommandOf,
  refusalReasonOf,
});
