/**
 * The fold of a package into another entity, pure: where it may go (the root, then each app), the words of the trade, the home folders
 * before and after, and the draft edits. The package leaves the draft; its folders become further homes of an app, or fall to the root,
 * which owns every path no other entity owns. Every list that named the package names the target instead, or drops it where the target
 * cannot stand in it: a whitelist names packages only, and nothing names the root it already depends on.
 */
import type { EntityKey, PipelineEntity }             from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit }                     from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineDraftEditUtil }                      from '../../../../src/lib/tracker-model/utils/PipelineDraftEditUtil.ts';

export interface FoldWords {
  readonly title:       string;
  readonly lead:        string;
  readonly targetHint:  string;
  readonly tradeDetail: string;
}

/** The home folders of the target before the fold and after it, as the boards show folders. */
export interface FoldFolders {
  readonly before: readonly string[];
  readonly after:  readonly string[];
}

const ROOT_FOLDERS_TEXT = 'every path no other entity owns';

function entityOf(entities: PipelineEntities, key: EntityKey): Readonly<PipelineEntity> | undefined {
  return Object.hasOwn(entities, key) ? entities[key] : undefined;
}

function shownFolderOf(folder: string): string {
  return folder === '/' ? folder : folder.replace(/^\/+/u, '');
}

/** The root first, then every app, in the draft's order. */
function targetsOf(entities: PipelineEntities): EntityKey[] {
  const apps = Object.keys(entities).filter((key) => entities[key]?.kind === 'app');
  return [EntityOwnershipUtil.rootEntityKeyOf(entities), ...apps];
}

function targetIsRoot(entities: PipelineEntities, targetKey: EntityKey): boolean {
  return targetKey === EntityOwnershipUtil.rootEntityKeyOf(entities);
}

/** Whether the target is the root entity that the draft only implies, kept for a person. */
function targetIsImpliedRoot(entities: PipelineEntities, targetKey: EntityKey): boolean {
  return targetIsRoot(entities, targetKey) && entityOf(entities, targetKey) === undefined;
}

function buildGateCountTextOf(entity: Readonly<PipelineEntity> | undefined): string {
  const count = entity?.phases.build.length ?? 0;
  if (count === 0) return 'no build gate yet';
  return count === 1 ? '1 build gate' : `${count} build gates`;
}

function wordsOf(entities: PipelineEntities, packageKey: EntityKey, targetKey: EntityKey): FoldWords {
  const target = entityOf(entities, targetKey);
  const title = `Fold ${packageKey} into ${targetKey}?`;
  if (targetIsImpliedRoot(entities, targetKey)) {
    return {
      title,
      lead:        `${packageKey} stops being an entity. Its folders belong to ${targetKey}, which owns every path no other entity owns.`,
      targetHint:  'Kept for a person: no gates, no constitution',
      tradeDetail: `${targetKey} is kept for a person, so ${packageKey} gets no gates and no review, and agents change it only through an app's `
        + `reach. A ticket that changes ${packageKey} no longer crosses a border.`,
    };
  }
  const otherApps = Object.keys(entities).filter((key) => key !== targetKey && entities[key]?.kind === 'app');
  const otherAppsText = otherApps.length === 0
    ? ''
    : ` Tickets of ${otherApps.join(', ')} that change ${packageKey} become a need for ${targetKey}, since a crossing goes into packages only.`;
  return {
    title,
    lead:        `${packageKey} stops being an entity. Its folders become further home folders of ${targetKey}.`,
    targetHint:  `${target?.kind === 'root' ? 'The root' : 'An app'} with ${buildGateCountTextOf(target)}`,
    tradeDetail: `${targetKey}'s builder may change ${packageKey} directly, and ${targetKey}'s reviewer reviews it.${otherAppsText}`,
  };
}

function foldersOf(entities: PipelineEntities, packageKey: EntityKey, targetKey: EntityKey): FoldFolders {
  const packageHomes = (entityOf(entities, packageKey)?.home ?? []).map(shownFolderOf);
  if (targetIsImpliedRoot(entities, targetKey)) return { before: [ROOT_FOLDERS_TEXT], after: [ROOT_FOLDERS_TEXT, ...packageHomes] };
  const before = (entityOf(entities, targetKey)?.home ?? []).map(shownFolderOf);
  return { before, after: [...before, ...packageHomes] };
}

function uniqueWithout(keys: readonly EntityKey[], excludedKeys: readonly EntityKey[]): EntityKey[] {
  return [...new Set(keys)].filter((key) => !excludedKeys.includes(key));
}

function listEditOf(key: EntityKey, target: 'whitelist' | 'depends-on', keys: readonly EntityKey[]): PipelineDraftEdit {
  return { target: 'within-entity', entityKey: key, edit: { target, value: keys.length === 0 ? null : [...keys] } };
}

/** The target's own lists: the package gone from its whitelist, and what the package depended on joined to what it depends on. */
function targetEditsOf(entities: PipelineEntities, packageKey: EntityKey, targetKey: EntityKey): PipelineDraftEdit[] {
  const target = entityOf(entities, targetKey);
  const folded = entityOf(entities, packageKey);
  if (target === undefined || folded === undefined) return [];
  const rootKey = EntityOwnershipUtil.rootEntityKeyOf(entities);
  const definition = PipelineDraftEditUtil.definitionOf({ ...target, home: [...target.home, ...folded.home] });
  const edits: PipelineDraftEdit[] = [{ target: 'entity', entityKey: targetKey, value: definition }];
  if ((target.whitelist ?? []).includes(packageKey)) {
    edits.push(listEditOf(targetKey, 'whitelist', (target.whitelist ?? []).filter((key) => key !== packageKey)));
  }
  const dependsOn = targetKey === rootKey ? [] : uniqueWithout([...target.dependsOn ?? [], ...folded.dependsOn ?? []], [packageKey, targetKey, rootKey]);
  const dependsOnChanged = dependsOn.join('\n') !== (target.dependsOn ?? []).join('\n');
  if (dependsOnChanged) edits.push(listEditOf(targetKey, 'depends-on', dependsOn));
  return edits;
}

/** Every other entity's lists: the package dropped from a whitelist, and replaced by the target in what it depends on. */
function otherEntityEditsOf(entities: PipelineEntities, packageKey: EntityKey, targetKey: EntityKey): PipelineDraftEdit[] {
  const rootKey = EntityOwnershipUtil.rootEntityKeyOf(entities);
  return Object.entries(entities).filter(([key]) => key !== packageKey && key !== targetKey).flatMap(([key, entity]) => {
    const edits: PipelineDraftEdit[] = [];
    const whitelist = entity.whitelist ?? [];
    if (whitelist.includes(packageKey)) edits.push(listEditOf(key, 'whitelist', whitelist.filter((entry) => entry !== packageKey)));
    const dependsOn = entity.dependsOn ?? [];
    if (dependsOn.includes(packageKey)) {
      const replaced = dependsOn.map((entry) => (entry === packageKey ? targetKey : entry));
      edits.push(listEditOf(key, 'depends-on', uniqueWithout(replaced, [key, ...(targetKey === rootKey ? [rootKey] : [])])));
    }
    return edits;
  });
}

function foldEditsOf(entities: PipelineEntities, packageKey: EntityKey, targetKey: EntityKey): PipelineDraftEdit[] {
  if (entityOf(entities, packageKey) === undefined || packageKey === targetKey) return [];
  return [
    { target: 'entity', entityKey: packageKey, value: null },
    ...targetEditsOf(entities, packageKey, targetKey),
    ...otherEntityEditsOf(entities, packageKey, targetKey),
  ];
}

export const FoldEntityDialogModel = Object.freeze({
  targetsOf,
  wordsOf,
  foldersOf,
  foldEditsOf,
});
