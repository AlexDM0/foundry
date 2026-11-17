/**
 * The entity rail's model, pure: the forge row first, then the entities in the groups Apps, Packages and Root, each row with its key, its
 * kind, one status mark and its counts of open questions and pending edits, and the one line that counts what deserves a look. The filter
 * keeps the entities whose key or kind holds its text; the forge row always stays. A root entity with no gates is kept for a person, so
 * it never counts as an entity without gates.
 */
import type { EntityKey, PipelineEntity, PipelineEntityKind }  from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { GateProfileRunState, PipelineChange }            from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { SetupQuestion }                                  from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { PipelineViewModel, type ShownEntitiesFacts }          from '../PipelineViewModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';

type ShownEntitiesRecord = NonNullable<ShownEntitiesFacts['pipelineSetup']>['record'];

type ShownEntities = Readonly<Record<EntityKey, PipelineEntity>>;

/** The one mark at a row's right: a gate profile under way first, then no gates, then the default constitution, else checked. */
export type EntityRailStatus = 'gate-running' | 'no-gates' | 'kept-for-a-person' | 'default-constitution' | 'checked';

/** The facts the rail reads: the entities shown, the open questions of each session, the change list and the profile runs. */
export interface EntityRailFacts extends ShownEntitiesFacts {
  readonly pipelineSetup?: {
    readonly record:    ShownEntitiesRecord & { readonly questions: readonly Pick<SetupQuestion, 'answer'>[] };
    readonly entities?: Readonly<Record<EntityKey, { readonly openQuestionCount: number }>>;
  } | null;
  readonly pipelineFlow?: { readonly changeList: readonly Pick<PipelineChange, 'field'>[] } | null;
  readonly profileRuns?:  readonly { readonly entity?: EntityKey; readonly state: GateProfileRunState }[];
}

/** A screen's own word on each entity row and its own attention line, in place of the gates marks: the constitution step's states. */
export interface EntityRailMarkTexts {
  readonly textOf:        (entityKey: EntityKey) => string;
  readonly attentionText: string | null;
}

export interface EntityRailRowView {
  readonly level:             PipelineLevel;
  /** The forge's name, or the entity's key, set in mono. */
  readonly name:              string;
  /** The kind, muted: "Shared by every entity", "app", "package", "every other path". */
  readonly kindText:          string;
  /** `null` on the forge row, which carries no gates of its own. */
  readonly status:            EntityRailStatus | null;
  readonly statusText:        string | null;
  readonly openQuestionCount: number;
  readonly pendingEditCount:  number;
  readonly selected:          boolean;
  /** The row's whole sentence for a screen reader: its name, kind, mark and counts. */
  readonly accessibleName:    string;
}

export interface EntityRailGroupView {
  readonly groupKind: PipelineEntityKind;
  readonly label:     string;
  readonly rows:      readonly EntityRailRowView[];
}

export interface EntityRailView {
  readonly forgeRow:             EntityRailRowView;
  readonly groups:               readonly EntityRailGroupView[];
  /** What deserves a look, in one line; `null` while nothing does. */
  readonly attentionText:        string | null;
  /** An app or a package has no gates: the rail says what that means. */
  readonly someEntityHasNoGates: boolean;
  /** The filter's text matched no entity. */
  readonly nothingMatches:       boolean;
}

const GROUP_LABELS: Readonly<Record<PipelineEntityKind, string>> = Object.freeze({ app: 'Apps', package: 'Packages', root: 'Root' });

const GROUP_ORDER: readonly PipelineEntityKind[] = ['app', 'package', 'root'];

const KIND_TEXTS: Readonly<Record<PipelineEntityKind, string>> = Object.freeze({ app: 'app', package: 'package', root: 'every other path' });

const FORGE_KIND_TEXT = 'Shared by every entity';

const STATUS_TEXTS: Readonly<Record<Exclude<EntityRailStatus, 'checked'>, string>> = Object.freeze({
  'gate-running':         'Gate running',
  'no-gates':             'No gates',
  'kept-for-a-person':    'For a person',
  'default-constitution': 'Default constitution',
});

const RUNNING_PROFILE_STATES: readonly GateProfileRunState[] = ['queued', 'running'];

function countedText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusOf(entityKey: EntityKey, entity: PipelineEntity, facts: EntityRailFacts): EntityRailStatus {
  const profileRuns = facts.profileRuns ?? [];
  if (profileRuns.some((run) => run.entity === entityKey && RUNNING_PROFILE_STATES.includes(run.state))) return 'gate-running';
  if (entity.gates.length === 0) return entity.kind === 'root' ? 'kept-for-a-person' : 'no-gates';
  if (entity.constitution === undefined) return 'default-constitution';
  return 'checked';
}

function pendingEditCountOf(level: PipelineLevel, facts: EntityRailFacts): number {
  const changeList = facts.pipelineFlow?.changeList ?? [];
  return changeList.filter((change) => PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level)).length;
}

function accessibleNameOf(row: Omit<EntityRailRowView, 'accessibleName'>): string {
  const parts = [row.name, row.kindText];
  if (row.statusText !== null) parts.push(row.statusText);
  if (row.openQuestionCount > 0) parts.push(countedText(row.openQuestionCount, 'open question', 'open questions'));
  if (row.pendingEditCount > 0) parts.push(countedText(row.pendingEditCount, 'pending edit', 'pending edits'));
  return parts.join(', ');
}

function withAccessibleName(row: Omit<EntityRailRowView, 'accessibleName'>): EntityRailRowView {
  return { ...row, accessibleName: accessibleNameOf(row) };
}

function forgeRowOf(facts: EntityRailFacts, selectedLevel: PipelineLevel): EntityRailRowView {
  const questions = facts.pipelineSetup?.record.questions ?? [];
  return withAccessibleName({
    level:             FORGE_LEVEL,
    name:              PipelineLevelModel.levelNameOf(FORGE_LEVEL),
    kindText:          FORGE_KIND_TEXT,
    status:            null,
    statusText:        null,
    openQuestionCount: questions.filter((question) => question.answer === null).length,
    pendingEditCount:  pendingEditCountOf(FORGE_LEVEL, facts),
    selected:          PipelineLevelModel.isForgeLevel(selectedLevel),
  });
}

function openQuestionCountOf(entityKey: EntityKey, facts: EntityRailFacts): number {
  const entityFacts = facts.pipelineSetup?.entities ?? {};
  return Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey]?.openQuestionCount ?? 0 : 0;
}

function gatesStatusTextOf(status: EntityRailStatus, entity: PipelineEntity): string {
  return status === 'checked' ? countedText(entity.gates.length, 'gate', 'gates') : STATUS_TEXTS[status];
}

function entityRowOf(
  entityKey: EntityKey,
  entity: PipelineEntity,
  facts: EntityRailFacts,
  selectedLevel: PipelineLevel,
  markTexts: EntityRailMarkTexts | null,
): EntityRailRowView {
  const level = PipelineLevelModel.entityLevelOf(entityKey);
  const status = statusOf(entityKey, entity, facts);
  return withAccessibleName({
    level,
    name:              entityKey,
    kindText:          KIND_TEXTS[entity.kind],
    status,
    statusText:        markTexts === null ? gatesStatusTextOf(status, entity) : markTexts.textOf(entityKey),
    openQuestionCount: openQuestionCountOf(entityKey, facts),
    pendingEditCount:  pendingEditCountOf(level, facts),
    selected:          PipelineLevelModel.levelsAreEqual(level, selectedLevel),
  });
}

function matchesFilter(row: EntityRailRowView, filterText: string): boolean {
  const needle = filterText.trim().toLowerCase();
  if (needle === '') return true;
  return row.name.toLowerCase().includes(needle) || row.kindText.toLowerCase().includes(needle);
}

/** The apps and packages; the root entity may stay for a person, so it never needs a look. */
function checkedEntitiesOf(entities: ShownEntities): PipelineEntity[] {
  return Object.values(entities).filter((entity) => entity.kind !== 'root');
}

/** "1 entity has no gates · 2 entities have the default constitution". */
function attentionTextOf(entities: ShownEntities): string | null {
  const checkedEntities = checkedEntitiesOf(entities);
  const withoutGates = checkedEntities.filter((entity) => entity.gates.length === 0).length;
  const withDefaultConstitution = checkedEntities.filter((entity) => entity.constitution === undefined).length;
  const parts: string[] = [];
  if (withoutGates > 0) parts.push(`${countedText(withoutGates, 'entity has', 'entities have')} no gates`);
  if (withDefaultConstitution > 0) parts.push(`${countedText(withDefaultConstitution, 'entity has', 'entities have')} the default constitution`);
  return parts.length === 0 ? null : parts.join(' · ');
}

function kindOf(entities: ShownEntities, entityKey: EntityKey): PipelineEntityKind | null {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.kind ?? null : null;
}

/** With `markTexts` the rows carry the screen's words and its attention line, and the note on gates stays away. */
function railOf(facts: EntityRailFacts, selectedLevel: PipelineLevel, filterText: string, markTexts: EntityRailMarkTexts | null = null): EntityRailView {
  const entities = PipelineViewModel.entitiesShownOf(facts);
  const allRows = Object.entries(entities).map(([entityKey, entity]) => entityRowOf(entityKey, entity, facts, selectedLevel, markTexts));
  const shownRows = allRows.filter((row) => matchesFilter(row, filterText));
  const groups = GROUP_ORDER.map((groupKind) => ({
    groupKind,
    label: GROUP_LABELS[groupKind],
    rows:  shownRows.filter((row) => kindOf(entities, row.name) === groupKind),
  })).filter((group) => group.rows.length > 0);
  return {
    forgeRow:             forgeRowOf(facts, selectedLevel),
    groups,
    attentionText:        markTexts === null ? attentionTextOf(entities) : markTexts.attentionText,
    someEntityHasNoGates: markTexts === null && checkedEntitiesOf(entities).some((entity) => entity.gates.length === 0),
    nothingMatches:       allRows.length > 0 && shownRows.length === 0,
  };
}

/** The rows in the order the arrow keys walk them: the forge, then each group's rows. */
function rowsInOrderOf(rail: EntityRailView): EntityRailRowView[] {
  return [rail.forgeRow, ...rail.groups.flatMap((group) => group.rows)];
}

export const EntityRailModel = Object.freeze({ railOf, rowsInOrderOf });
