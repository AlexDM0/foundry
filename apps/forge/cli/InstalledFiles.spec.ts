/**
 * The catalogue of installed files. The cases that matter: the session instructions, the reference and the instruction defaults in the
 * git-ignored tracker directory, where the SessionStart hook, the skills and the Overseer read them, and the install manifest beside what
 * it versions; and every path absolute under the root it was given, since `init` and `update` print them.
 */
import {
  isAbsolute,
  join,
  relative,
  sep
} from 'node:path';

import { expect, test }  from 'bun:test';
import { PRODUCT_NAMES } from '../src/shared/constants/ProductNames.ts';

import { installedFilePathsIn } from './InstalledFiles.ts';

const EXAMPLE_ROOT = join(sep, 'scratch', 'example-repository');

test('the session instructions and the reference sit in the tracker directory, the eight instruction defaults in its briefs/defaults', () => {
  const paths = installedFilePathsIn(EXAMPLE_ROOT);
  expect(relative(EXAMPLE_ROOT, paths.sessionInstructions)).toBe(join(PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md'));
  expect(relative(EXAMPLE_ROOT, paths.reference)).toBe(join(PRODUCT_NAMES.DATA_FOLDER, 'reference.md'));
  const defaults = [
    paths.constitutionDefault,
    paths.builderDefault,
    paths.reviewerDefault,
    paths.reReviewerDefault,
    paths.conflictReReviewerDefault,
    paths.productOwnerDefault,
    paths.pipelineAgentDefault,
    paths.assistantDefault,
  ].map((path) => relative(EXAMPLE_ROOT, path));
  expect(defaults).toEqual(['constitution', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer', 'productOwner', 'pipelineAgent', 'assistant']
    .map((role) => join(PRODUCT_NAMES.DATA_FOLDER, 'briefs', 'defaults', `${role}.md`)));
});

test('the install manifest sits in the tracker directory, beside what it versions', () => {
  expect(installedFilePathsIn(EXAMPLE_ROOT).installManifest).toBe(join(EXAMPLE_ROOT, PRODUCT_NAMES.DATA_FOLDER, 'version.json'));
});

test('every path is absolute and under the root it was given', () => {
  const installedFilePaths = Object.values(installedFilePathsIn(EXAMPLE_ROOT));
  expect(installedFilePaths).toHaveLength(11);
  for (const installedFilePath of installedFilePaths) {
    expect(isAbsolute(installedFilePath), installedFilePath).toBe(true);
    expect(installedFilePath).toStartWith(`${EXAMPLE_ROOT}${sep}`);
  }
});
