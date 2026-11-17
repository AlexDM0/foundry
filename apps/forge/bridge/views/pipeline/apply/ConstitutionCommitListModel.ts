/**
 * What the first Apply over entities does with each entity's constitution, pure: a drafted text goes to main in the one constitution
 * commit, a file the entity already names stays byte for byte, the root kept for a person has none, and any other entity reads the
 * installed default. A draft with no text commits nothing, as the Apply reads it.
 */
import type { EntityKey }     from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';

export interface ConstitutionCommit {
  /** The entities whose drafted text the one commit writes, in the draft's order. */
  readonly committedKeys:      readonly EntityKey[];
  readonly adoptedKeys:        readonly EntityKey[];
  readonly defaultKeys:        readonly EntityKey[];
  readonly keptForAPersonKeys: readonly EntityKey[];
}

export interface ConstitutionCommitView {
  readonly headline:      string;
  readonly committedKeys: readonly EntityKey[];
  /** The sentences under the list: the files kept byte for byte, the default, the root kept for a person. */
  readonly notes:         readonly string[];
}

type ConstitutionFate = 'committed' | 'adopted' | 'default' | 'kept-for-a-person';

function listedText(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function draftTextOf(record: Pick<PipelineSetup, 'entities'>, entityKey: EntityKey): string {
  const parts = record.entities ?? {};
  const part = Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined;
  return part?.constitution?.markdown ?? '';
}

function commitOf(record: Pick<PipelineSetup, 'draft' | 'entities'>): ConstitutionCommit {
  const fates = Object.entries(record.draft?.entities ?? {}).map(([entityKey, entity]): readonly [EntityKey, ConstitutionFate] => {
    if (draftTextOf(record, entityKey) !== '') return [entityKey, 'committed'];
    if (entity.constitution !== undefined) return [entityKey, 'adopted'];
    if (entity.kind === 'root' && entity.gates.length === 0) return [entityKey, 'kept-for-a-person'];
    return [entityKey, 'default'];
  });
  const keysOf = (fate: ConstitutionFate): EntityKey[] => fates.filter(([, candidate]) => candidate === fate).map(([entityKey]) => entityKey);
  return {
    committedKeys:      keysOf('committed'),
    adoptedKeys:        keysOf('adopted'),
    defaultKeys:        keysOf('default'),
    keptForAPersonKeys: keysOf('kept-for-a-person'),
  };
}

/** "3 constitutions go to main in one commit", or that none does. */
function headlineOf(committedCount: number): string {
  if (committedCount === 0) return 'No constitution goes to main: Apply makes no constitution commit.';
  if (committedCount === 1) return '1 constitution goes to main in one commit';
  return `${committedCount} constitutions go to main in one commit`;
}

function viewOf(record: Pick<PipelineSetup, 'draft' | 'entities'>): ConstitutionCommitView {
  const commit = commitOf(record);
  const notes: string[] = [];
  if (commit.adoptedKeys.length > 0) {
    const single = commit.adoptedKeys.length === 1;
    notes.push(`${listedText(commit.adoptedKeys)} ${single ? 'keeps its own file' : 'keep their own files'} from the repository, byte for byte.`);
  }
  if (commit.defaultKeys.length > 0) {
    notes.push(`${listedText(commit.defaultKeys)} ${commit.defaultKeys.length === 1 ? 'reads' : 'read'} the installed default constitution.`);
  }
  if (commit.keptForAPersonKeys.length > 0) notes.push(`${listedText(commit.keptForAPersonKeys)} is kept for a person: no constitution.`);
  if (commit.committedKeys.length > 0) notes.push('The commit changes only these files, so it runs no gates.');
  return { headline: headlineOf(commit.committedKeys.length), committedKeys: commit.committedKeys, notes };
}

export const ConstitutionCommitListModel = Object.freeze({
  commitOf,
  viewOf,
});
