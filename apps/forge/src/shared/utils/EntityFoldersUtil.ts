/**
 * An entity's steps and gates name their folders from the entity's first home; a run in a checkout of the whole repository reads them
 * from the repository's root, where a folder leading with `/` already is. Its constitution is the file it names, else the one in its
 * first home.
 */
import type { PipelineEntity, PipelineGate, PipelineStep } from '../../domain/tracker-model/@types/Pipeline.ts';
import { ProjectPathsUtil }                                from './ProjectPathsUtil.ts';

const REPOSITORY_ROOT_MARKER = '/';

const CONSTITUTION_FILE_NAME = 'CONSTITUTION.md';

/** A folder leading with `/` stays; any other is under the first home, and none is that home. */
function rootedFolderOf(firstHome: string, folder: string | undefined): string {
  if (folder?.startsWith(REPOSITORY_ROOT_MARKER) === true) return folder;
  const homeFolder = firstHome.replace(/^\/+|\/+$/gu, '');
  return `${REPOSITORY_ROOT_MARKER}${ProjectPathsUtil.toRepositoryPath(homeFolder, folder ?? '')}`;
}

/** Each step with its folder from the repository's root. */
function rootedStepsOf(steps: readonly PipelineStep[], firstHome: string): PipelineStep[] {
  return steps.map((step) => ({ name: step.name, run: step.run, in: rootedFolderOf(firstHome, step.in) }));
}

/** The gate with its folder from the repository's root; everything else it holds stays. */
function rootedGateOf(gate: Readonly<PipelineGate>, firstHome: string): PipelineGate {
  return { ...structuredClone(gate), in: rootedFolderOf(firstHome, gate.in) };
}

/** The entity's constitution as a project path: the file it names, else `CONSTITUTION.md` in its first home, where Apply commits one. */
function constitutionPathOf(entity: Pick<PipelineEntity, 'home' | 'constitution'>): string {
  if (entity.constitution !== undefined) return entity.constitution.path;
  const homeFolder = (entity.home[0] ?? REPOSITORY_ROOT_MARKER).replace(/^\/+|\/+$/gu, '');
  return homeFolder === '' ? CONSTITUTION_FILE_NAME : `${homeFolder}/${CONSTITUTION_FILE_NAME}`;
}

export const EntityFoldersUtil = Object.freeze({
  constitutionPathOf,
  rootedFolderOf,
  rootedStepsOf,
  rootedGateOf,
});
