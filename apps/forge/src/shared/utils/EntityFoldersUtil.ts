/**
 * An entity's steps and gates name their folders from the entity's first home; a run in a checkout of the whole repository reads them
 * from the repository's root, where a folder leading with `/` already is.
 */
import type { PipelineGate, PipelineStep } from '../../lib/tracker-model/@types/Pipeline.ts';
import { ProjectPathsUtil }                from './ProjectPathsUtil.ts';

const REPOSITORY_ROOT_MARKER = '/';

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

export const EntityFoldersUtil = Object.freeze({
  rootedFolderOf,
  rootedStepsOf,
  rootedGateOf,
});
