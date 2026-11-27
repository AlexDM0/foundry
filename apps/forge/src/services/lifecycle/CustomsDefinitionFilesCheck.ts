/** V11: the branch changed no gate's definition file and no instruction file its ticket does not name. */
import { ProjectPathsUtil } from '../../shared/utils/ProjectPathsUtil.ts';

import type { CustomsSubject } from './@types/CustomsSubject.ts';
import type { CheckVerdict }   from './@types/CustomsVerdict.ts';
import {
  PASSED,
  pathsChangedInRange,
  pathsTheBranchChangedPast,
  projectPrefixOf,
  protectedFormOf,
  rangeOf,
  refused,
  REPOSITORY_ROOT_MARKER
} from './CustomsReadings.ts';

/**
 * A board's pattern as git reads a pathspec glob: `*` and `?` stay inside one folder, `**` crosses any number of them, none included, a trailing
 * `/` takes a folder's whole content, and a pattern without an inner `/` matches its name at any depth.
 */
export function definitionFilePatternExpressionOf(pattern: string): RegExp {
  const namesAFolder = pattern.endsWith('/');
  const body         = pattern.replace(/\/+$/, '');
  const anchored     = body.includes('/');
  const translated   = body.replace(/^\//, '').replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (token) => {
    if (token === '**/') return '(?:.*/)?';
    if (token === '**') return '.*';
    if (token === '*') return '[^/]*';
    if (token === '?') return '[^/]';
    return `\\${token}`;
  });
  return new RegExp(`${anchored ? '^' : '(^|/)'}${translated}${namesAFolder ? '/' : '$'}`);
}

/**
 * Whether a repository path is one a board's pattern names. A pattern leading with `/` is read from the repository root and any other from
 * the project's folder, so `src/**` and a bare `eslint.config.js` never name a sibling project's file; with the prefix `''` both read
 * from the root, as a pattern always has.
 */
export function definitionFileMatcherOf(pattern: string, projectPrefix: string): (repositoryPath: string) => boolean {
  const expression = definitionFilePatternExpressionOf(pattern);
  if (pattern.startsWith(REPOSITORY_ROOT_MARKER)) return (repositoryPath) => expression.test(repositoryPath);
  return (repositoryPath) => {
    const projectPath = ProjectPathsUtil.toProjectPath(projectPrefix, repositoryPath);
    return !projectPath.startsWith(REPOSITORY_ROOT_MARKER) && expression.test(projectPath);
  };
}

/** The instruction files of `changed` that the branch changed itself; all of them when the subject names no target. */
function instructionFilesChangedByTheBranch(subject: CustomsSubject, changed: readonly string[]): readonly string[] | null {
  if (changed.length === 0 || subject.target === undefined) return changed;
  const ownPaths = pathsTheBranchChangedPast(subject, subject.target);
  if (ownPaths === null) return null;
  const ownProtectedForms = new Set(ownPaths.map(protectedFormOf));
  return changed.filter((gitPath) => ownProtectedForms.has(protectedFormOf(gitPath)));
}

/** With no gate naming a `definedBy` the board names no definition files, so nothing refuses. */
/** A ticket names a file as the project's paths do, so `src/x.ts` names the project's file and `/bun.lock` the root's. */
export function checksDefinitionUnchanged(subject: CustomsSubject): CheckVerdict {
  const projectPrefix = projectPrefixOf(subject);
  const matchers = (subject.gates ?? []).flatMap((gate) => gate.definedBy ?? []).map((pattern) => definitionFileMatcherOf(pattern, projectPrefix));
  const instructionFiles = subject.instructionFiles ?? [];
  if (matchers.length === 0 && instructionFiles.length === 0) return PASSED;
  const paths = pathsChangedInRange(subject);
  if (paths === null) return refused('git-failed', [rangeOf(subject)]);
  const unnamed = paths.filter((path) => !subject.ticketBody.includes(ProjectPathsUtil.toProjectPath(projectPrefix, path)));
  const changedDefinitions = unnamed.filter((path) => matchers.some((matches) => matches(path)));
  if (changedDefinitions.length > 0) return refused('checks-definition-changed', changedDefinitions);
  const protectedInstructionFiles = instructionFiles.map(protectedFormOf);
  const changedInstructions = instructionFilesChangedByTheBranch(
    subject,
    unnamed.filter((gitPath) => protectedInstructionFiles.includes(protectedFormOf(gitPath))),
  );
  if (changedInstructions === null) return refused('git-failed', [subject.target ?? rangeOf(subject)]);
  return changedInstructions.length === 0 ? PASSED : refused('instruction-file-changed', changedInstructions);
}
