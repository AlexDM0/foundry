/**
 * The fold of a package into another entity, pure. Its folders become homes of an app or fall to the root, which owns every path no other entity
 * owns; a list that cannot name the target drops the package.
 */
import type { BoardDraftEditDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { CountTextUtil }                                            from '../../../../shared/utils/CountTextUtil.ts';
import { EntitiesStepModel }                                        from './EntitiesStepModel.ts';

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

function entityOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, key: string): Readonly<BoardPipelineEntityDocument> | undefined {
  return Object.hasOwn(entities, key) ? entities[key] : undefined;
}

function shownFolderOf(folder: string): string {
  return folder === '/' ? folder : folder.replace(/^\/+/u, '');
}

/** The root first, then every app, in the draft's order. */
function targetsOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>): string[] {
  const apps = Object.keys(entities).filter((key) => entities[key]?.kind === 'app');
  return [EntitiesStepModel.rootEntityKeyOf(entities), ...apps];
}

function targetIsRoot(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, targetKey: string): boolean {
  return targetKey === EntitiesStepModel.rootEntityKeyOf(entities);
}

/** Whether the target is the root entity that the draft only implies, kept for a person. */
function targetIsImpliedRoot(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, targetKey: string): boolean {
  return targetIsRoot(entities, targetKey) && entityOf(entities, targetKey) === undefined;
}

function buildGateCountTextOf(entity: Readonly<BoardPipelineEntityDocument> | undefined): string {
  const count = entity?.phases.build.length ?? 0;
  if (count === 0) return 'no build gate yet';
  return CountTextUtil.countedPhrase(count, 'build gate', 'build gates');
}

function wordsOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, packageKey: string, targetKey: string): FoldWords {
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

function foldersOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, packageKey: string, targetKey: string): FoldFolders {
  const packageHomes = (entityOf(entities, packageKey)?.home ?? []).map(shownFolderOf);
  if (targetIsImpliedRoot(entities, targetKey)) return { before: [ROOT_FOLDERS_TEXT], after: [ROOT_FOLDERS_TEXT, ...packageHomes] };
  const before = (entityOf(entities, targetKey)?.home ?? []).map(shownFolderOf);
  return { before, after: [...before, ...packageHomes] };
}

function uniqueWithout(keys: readonly string[], excludedKeys: readonly string[]): string[] {
  return [...new Set(keys)].filter((key) => !excludedKeys.includes(key));
}

function listEditOf(key: string, target: 'whitelist' | 'depends-on', keys: readonly string[]): BoardDraftEditDocument {
  return { target: 'within-entity', entityKey: key, edit: { target, value: keys.length === 0 ? null : [...keys] } };
}

/** The target's own lists: the package gone from its whitelist, and what the package depended on joined to what it depends on. */
function targetEditsOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, packageKey: string, targetKey: string): BoardDraftEditDocument[] {
  const target = entityOf(entities, targetKey);
  const folded = entityOf(entities, packageKey);
  if (target === undefined || folded === undefined) return [];
  const rootKey = EntitiesStepModel.rootEntityKeyOf(entities);
  const definition = { kind: target.kind, home: [...target.home, ...folded.home], summary: target.summary };
  const edits: BoardDraftEditDocument[] = [{ target: 'entity', entityKey: targetKey, value: definition }];
  if (target.whitelist.includes(packageKey)) {
    edits.push(listEditOf(targetKey, 'whitelist', target.whitelist.filter((key) => key !== packageKey)));
  }
  const dependsOn = targetKey === rootKey ? [] : uniqueWithout([...target.dependsOn, ...folded.dependsOn], [packageKey, targetKey, rootKey]);
  const dependsOnChanged = dependsOn.join('\n') !== target.dependsOn.join('\n');
  if (dependsOnChanged) edits.push(listEditOf(targetKey, 'depends-on', dependsOn));
  return edits;
}

/** Every other entity's lists: the package dropped from a whitelist, and replaced by the target in what it depends on. */
function otherEntityEditsOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, packageKey: string, targetKey: string): BoardDraftEditDocument[] {
  const rootKey = EntitiesStepModel.rootEntityKeyOf(entities);
  return Object.entries(entities).filter(([key]) => key !== packageKey && key !== targetKey).flatMap(([key, entity]) => {
    const edits: BoardDraftEditDocument[] = [];
    const { whitelist } = entity;
    if (whitelist.includes(packageKey)) edits.push(listEditOf(key, 'whitelist', whitelist.filter((entry) => entry !== packageKey)));
    const { dependsOn } = entity;
    if (dependsOn.includes(packageKey)) {
      const replaced = dependsOn.map((entry) => (entry === packageKey ? targetKey : entry));
      edits.push(listEditOf(key, 'depends-on', uniqueWithout(replaced, [key, ...(targetKey === rootKey ? [rootKey] : [])])));
    }
    return edits;
  });
}

function foldEditsOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, packageKey: string, targetKey: string): BoardDraftEditDocument[] {
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
