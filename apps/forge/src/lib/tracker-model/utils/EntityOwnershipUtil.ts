/**
 * Which entity of a pipeline owns a repository path, whose gates a change of some paths reaches, and the order a ticket's package stages
 * run in. Paths are repository paths leading with `/`; the deepest home that holds a path owns it, and the root entity owns the rest.
 */
import type { EntityKey, PipelineEntity } from '../@types/Pipeline.ts';

export type PipelineEntities = Readonly<Record<EntityKey, Readonly<PipelineEntity>>>;

/** The key of the root entity when the pipeline names none of kind `root`. */
export const ROOT_ENTITY_KEY: EntityKey = 'root';

function rootEntityKeyOf(entities: PipelineEntities): EntityKey {
  return Object.keys(entities).find((entityKey) => entities[entityKey]?.kind === 'root') ?? ROOT_ENTITY_KEY;
}

/** A home folder as ownership compares it: without a trailing slash. */
function homeFolderOf(folder: string): string {
  return folder.replace(/\/+$/u, '');
}

function homeHoldsPath(home: string, repositoryPath: string): boolean {
  const homeFolder = homeFolderOf(home);
  return repositoryPath === homeFolder || repositoryPath.startsWith(`${homeFolder}/`);
}

function ownerOf(entities: PipelineEntities, repositoryPath: string): EntityKey {
  let owner: EntityKey | null = null;
  let ownerHomeLength = -1;
  for (const [entityKey, entity] of Object.entries(entities)) {
    for (const home of entity.home) {
      const homeLength = homeFolderOf(home).length;
      if (homeLength > ownerHomeLength && homeHoldsPath(home, repositoryPath)) {
        owner           = entityKey;
        ownerHomeLength = homeLength;
      }
    }
  }
  return owner ?? rootEntityKeyOf(entities);
}

/** The paths of each owner, owners in the order their first path came; a file moved across a border names both paths, so both owners. */
function pathsByOwnerOf(entities: PipelineEntities, repositoryPaths: readonly string[]): Map<EntityKey, string[]> {
  const pathsByOwner = new Map<EntityKey, string[]>();
  for (const repositoryPath of repositoryPaths) {
    const owner      = ownerOf(entities, repositoryPath);
    const ownerPaths = pathsByOwner.get(owner);
    if (ownerPaths === undefined) pathsByOwner.set(owner, [repositoryPath]);
    else ownerPaths.push(repositoryPath);
  }
  return pathsByOwner;
}

/** The entities an entity consumes, the root entity among them for every other entity, though none names it. */
function dependenciesOf(entities: PipelineEntities, entityKey: EntityKey): EntityKey[] {
  const rootEntityKey = rootEntityKeyOf(entities);
  const namedKeys     = Object.hasOwn(entities, entityKey) ? entities[entityKey]?.dependsOn ?? [] : [];
  return entityKey === rootEntityKey || namedKeys.includes(rootEntityKey) ? [...namedKeys] : [...namedKeys, rootEntityKey];
}

/** Every entity that consumes a changed one, directly or through another, outside the changed ones; in the pipeline's order. */
function dependentsOf(entities: PipelineEntities, changedKeys: readonly EntityKey[]): EntityKey[] {
  const reachedKeys = new Set<EntityKey>(changedKeys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entityKey of Object.keys(entities)) {
      if (!reachedKeys.has(entityKey) && dependenciesOf(entities, entityKey).some((dependencyKey) => reachedKeys.has(dependencyKey))) {
        reachedKeys.add(entityKey);
        grew = true;
      }
    }
  }
  return Object.keys(entities).filter((entityKey) => reachedKeys.has(entityKey) && !changedKeys.includes(entityKey));
}

/**
 * The entities whose gates judge a landing: the owner of every changed path and every entity that consumes one, in the pipeline's order. A
 * root-owned path, such as a `reach` path at the root, is a change of the root entity, which every entity consumes (E4, E60).
 */
function gatedEntitiesOf(entities: PipelineEntities, changedPaths: readonly string[]): EntityKey[] {
  const changedKeys = [...pathsByOwnerOf(entities, changedPaths).keys()];
  const reachedKeys = new Set([...changedKeys, ...dependentsOf(entities, changedKeys)]);
  return Object.keys(entities).filter((entityKey) => reachedKeys.has(entityKey));
}

/**
 * The crossed packages in the order their stages run: a package before every package that consumes it, directly or through another;
 * otherwise in the order given. A circle, which validation refuses, keeps the order given for the packages in it.
 */
function stageOrderOf(entities: PipelineEntities, packageKeys: readonly EntityKey[]): EntityKey[] {
  const consumersByKey = new Map(packageKeys.map((packageKey) => [packageKey, dependentsOf(entities, [packageKey])]));
  const ordered: EntityKey[] = [];
  const waiting = [...packageKeys];
  while (waiting.length > 0) {
    const readyIndex = waiting.findIndex((candidateKey) => !waiting.some((otherKey) =>
      otherKey !== candidateKey && (consumersByKey.get(otherKey) ?? []).includes(candidateKey)
      && !(consumersByKey.get(candidateKey) ?? []).includes(otherKey)));
    const [nextKey] = waiting.splice(Math.max(readyIndex, 0), 1);
    if (nextKey !== undefined) ordered.push(nextKey);
  }
  return ordered;
}

export const EntityOwnershipUtil = Object.freeze({
  dependenciesOf,
  dependentsOf,
  gatedEntitiesOf,
  homeFolderOf,
  ownerOf,
  pathsByOwnerOf,
  rootEntityKeyOf,
  stageOrderOf,
});
