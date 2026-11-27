/**
 * The one check of a pipeline's entities, which the pipeline file and the entities draft both run, so the owner sees before Continue every refusal
 * the stored file would get. Each refusal is a verdict with the keys it names; the wording is the refusal-wording util's.
 */
import type { EntityKey } from '../@types/Pipeline.ts';

import { EntityOwnershipUtil, type PipelineEntities } from './EntityOwnershipUtil.ts';

export type EntityRefusal =
  | { reason: 'more-than-one-root'; entityKeys: EntityKey[] }
  | { reason: 'equal-homes'; home: string; entityKeys: EntityKey[] }
  /** E9: a `reach` path inside or above a home of another entity, not the root entity; `reach` names only paths the root entity owns. */
  | { reason: 'reach-inside-another-home'; entityKey: EntityKey; reachPath: string; ownerKey: EntityKey }
  | { reason: 'unknown-whitelist-key'; entityKey: EntityKey; unknownKey: EntityKey }
  | { reason: 'unknown-dependency-key'; entityKey: EntityKey; unknownKey: EntityKey }
  | { reason: 'whitelisted-entity-not-package'; entityKey: EntityKey; whitelistedKey: EntityKey }
  | { reason: 'whitelisted-package-without-review'; entityKey: EntityKey; whitelistedKey: EntityKey }
  | { reason: 'dependency-circle'; entityKeys: EntityKey[] };

export type EntityRefusalReason = EntityRefusal['reason'];

function rootCountRefusalsOf(entities: PipelineEntities): EntityRefusal[] {
  const rootEntityKeys = Object.keys(entities).filter((entityKey) => entities[entityKey]?.kind === 'root');
  return rootEntityKeys.length > 1 ? [{ reason: 'more-than-one-root', entityKeys: rootEntityKeys }] : [];
}

function equalHomeRefusalsOf(entities: PipelineEntities): EntityRefusal[] {
  const entityKeysByHome = new Map<string, EntityKey[]>();
  for (const [entityKey, entity] of Object.entries(entities)) {
    for (const home of new Set(entity.home.map(EntityOwnershipUtil.homeFolderOf))) {
      entityKeysByHome.set(home, [...entityKeysByHome.get(home) ?? [], entityKey]);
    }
  }
  return [...entityKeysByHome].filter(([, entityKeys]) => entityKeys.length > 1)
    .map(([home, entityKeys]) => ({ reason: 'equal-homes', home, entityKeys }));
}

/** The entity other than the root entity and the naming one whose home holds a reach path or lies under it, the deepest holder first. */
function foreignOwnerOfReach(entities: PipelineEntities, entityKey: EntityKey, reachPath: string): EntityKey | null {
  const rootEntityKey = EntityOwnershipUtil.rootEntityKeyOf(entities);
  const isForeign     = (ownerKey: EntityKey): boolean => ownerKey !== rootEntityKey && ownerKey !== entityKey;
  const holderKey     = EntityOwnershipUtil.ownerOf(entities, EntityOwnershipUtil.homeFolderOf(reachPath));
  if (isForeign(holderKey)) return holderKey;
  const heldOwnerKey = Object.keys(entities).find((ownerKey) => isForeign(ownerKey)
    && (entities[ownerKey]?.home ?? []).some((home) => EntityOwnershipUtil.homeHoldsPath(reachPath, EntityOwnershipUtil.homeFolderOf(home))));
  return heldOwnerKey ?? null;
}

function reachRefusalsOf(entities: PipelineEntities): EntityRefusal[] {
  return Object.entries(entities).flatMap(([entityKey, entity]) => (entity.reach ?? []).flatMap((reachPath): EntityRefusal[] => {
    const ownerKey = foreignOwnerOfReach(entities, entityKey, reachPath);
    return ownerKey === null ? [] : [{
      reason: 'reach-inside-another-home', entityKey, reachPath, ownerKey
    }];
  }));
}

function knownKeysOf(entities: PipelineEntities): Set<EntityKey> {
  return new Set([...Object.keys(entities), EntityOwnershipUtil.rootEntityKeyOf(entities)]);
}

function whitelistRefusalsOf(entities: PipelineEntities): EntityRefusal[] {
  const knownKeys = knownKeysOf(entities);
  return Object.entries(entities).flatMap(([entityKey, entity]) => (entity.whitelist ?? []).flatMap((whitelistedKey): EntityRefusal[] => {
    if (!knownKeys.has(whitelistedKey)) return [{ reason: 'unknown-whitelist-key', entityKey, unknownKey: whitelistedKey }];
    const whitelisted = Object.hasOwn(entities, whitelistedKey) ? entities[whitelistedKey] : undefined;
    if (whitelisted?.kind !== 'package') return [{ reason: 'whitelisted-entity-not-package', entityKey, whitelistedKey }];
    if (whitelisted.review === undefined) return [{ reason: 'whitelisted-package-without-review', entityKey, whitelistedKey }];
    return [];
  }));
}

function unknownDependencyRefusalsOf(entities: PipelineEntities): EntityRefusal[] {
  const knownKeys = knownKeysOf(entities);
  return Object.entries(entities).flatMap(([entityKey, entity]) => (entity.dependsOn ?? [])
    .filter((dependencyKey) => !knownKeys.has(dependencyKey))
    .map((unknownKey): EntityRefusal => ({ reason: 'unknown-dependency-key', entityKey, unknownKey })));
}

/**
 * Each circle a walk of the dependencies meets, as its keys from the first one met, the root entity's implied place included; so a root
 * entity that names a dependency is a circle. A key no entity has ends the walk there.
 */
function circlesOf(entities: PipelineEntities): EntityKey[][] {
  const knownKeys    = knownKeysOf(entities);
  const finishedKeys = new Set<EntityKey>();
  const circles: EntityKey[][] = [];
  const walk = (entityKey: EntityKey, walkedPath: EntityKey[]): void => {
    const circleStart = walkedPath.indexOf(entityKey);
    if (circleStart >= 0) {
      circles.push(walkedPath.slice(circleStart));
      return;
    }
    if (finishedKeys.has(entityKey)) return;
    for (const dependencyKey of EntityOwnershipUtil.dependenciesOf(entities, entityKey)) {
      if (knownKeys.has(dependencyKey)) walk(dependencyKey, [...walkedPath, entityKey]);
    }
    finishedKeys.add(entityKey);
  };
  for (const entityKey of Object.keys(entities)) walk(entityKey, []);
  return circles;
}

/**
 * Every refusal of the entities, in a fixed order: more than one root entity, equal homes, a reach inside another home, the whitelists,
 * unknown dependencies, then each circle.
 */
function refusalsOf(entities: PipelineEntities): EntityRefusal[] {
  return [
    ...rootCountRefusalsOf(entities),
    ...equalHomeRefusalsOf(entities),
    ...reachRefusalsOf(entities),
    ...whitelistRefusalsOf(entities),
    ...unknownDependencyRefusalsOf(entities),
    ...circlesOf(entities).map((entityKeys): EntityRefusal => ({ reason: 'dependency-circle', entityKeys })),
  ];
}

export const EntityValidationUtil = Object.freeze({
  circlesOf,
  refusalsOf,
});
