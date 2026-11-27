/**
 * The pipeline's level rail, pure: the forge row, then the entities grouped as Apps, Packages and Root, each with its mark and counts,
 * and the attention line. A root entity with no gates is kept for a person, so it never counts as an entity without gates.
 */
import type { BoardDocument }                                  from '../../../../@types/board/BoardDocument.ts';
import type { BoardPipelineEntityDocument }                    from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardEntityKind, BoardProfileRunState }          from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                       from '../../../../shared/utils/CountTextUtil.ts';
import { EntityGroupUtil }                                     from '../../../utils/EntityGroupUtil.ts';
import { PipelineViewModel }                                   from '../PipelineViewModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';

type ShownEntities = Readonly<Record<string, BoardPipelineEntityDocument>>;

/** The one mark at a row's right: a gate profile under way first, then no gates, then the default constitution, else checked. */
export type PipelineLevelRailStatus = 'gate-running' | 'no-gates' | 'kept-for-a-person' | 'default-constitution' | 'checked';

/** The facts the rail reads: the entities shown, the open questions of each session, the change list and the profile runs. */
export type PipelineLevelRailFacts = Pick<BoardDocument, 'pipeline'>;

/** A live screen's line of each level's work; null leaves the row without one. */
export type PipelineLevelRailActivityTexts = (level: PipelineLevel) => string | null;

/** A screen's own word on each entity row and its own attention line, in place of the gates marks: the constitution step's states. */
export interface PipelineLevelRailMarkTexts {
  readonly textOf:        (entityKey: string) => string;
  readonly attentionText: string | null;
}

export interface PipelineLevelRailRowView {
  readonly level:             PipelineLevel;
  /** The forge's name, or the entity's key, set in mono. */
  readonly name:              string;
  /** The kind, muted: "Shared by every entity", "app", "package", "every other path". */
  readonly kindText:          string;
  /** `null` on the forge row, which carries no gates of its own. */
  readonly status:            PipelineLevelRailStatus | null;
  readonly statusText:        string | null;
  readonly openQuestionCount: number;
  readonly pendingEditCount:  number;
  /** The level's work now, "4 tickets"; null on a screen that gives none. */
  readonly activityText:      string | null;
  readonly selected:          boolean;
  /** The row's whole sentence for a screen reader: its name, kind, mark and counts. */
  readonly accessibleName:    string;
}

export interface PipelineLevelRailGroupView {
  readonly groupKind: BoardEntityKind;
  readonly label:     string;
  readonly rows:      readonly PipelineLevelRailRowView[];
}

export interface PipelineLevelRailView {
  readonly forgeRow:             PipelineLevelRailRowView;
  readonly groups:               readonly PipelineLevelRailGroupView[];
  /** What deserves a look, in one line; `null` while nothing does. */
  readonly attentionText:        string | null;
  /** An app or a package has no gates: the rail says what that means. */
  readonly someEntityHasNoGates: boolean;
  /** The filter's text matched no entity. */
  readonly nothingMatches:       boolean;
}

const FORGE_KIND_TEXT = 'Shared by every entity';

const STATUS_TEXTS: Readonly<Record<Exclude<PipelineLevelRailStatus, 'checked'>, string>> = Object.freeze({
  'gate-running':         'Gate running',
  'no-gates':             'No gates',
  'kept-for-a-person':    'For a person',
  'default-constitution': 'Default constitution',
});

const RUNNING_PROFILE_STATES: readonly BoardProfileRunState[] = ['queued', 'running'];

function statusOf(entityKey: string, entity: BoardPipelineEntityDocument, facts: PipelineLevelRailFacts): PipelineLevelRailStatus {
  const { profileRuns } = facts.pipeline;
  if (profileRuns.some((run) => run.entity === entityKey && RUNNING_PROFILE_STATES.includes(run.state))) return 'gate-running';
  if (entity.gates.length === 0) return entity.kind === 'root' ? 'kept-for-a-person' : 'no-gates';
  if (entity.constitutionPath === null) return 'default-constitution';
  return 'checked';
}

/** A first setup proposes every field, so only an update or an advise counts the edits that wait for Apply. */
function pendingEditCountOf(level: PipelineLevel, facts: PipelineLevelRailFacts): number {
  if (facts.pipeline.setup?.record.mode === 'setup') return 0;
  const changeList = facts.pipeline.flow?.changeList ?? [];
  return changeList.filter((change) => PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level)).length;
}

function accessibleNameOf(row: Omit<PipelineLevelRailRowView, 'accessibleName'>): string {
  const parts = [row.name, row.kindText];
  if (row.statusText !== null) parts.push(row.statusText);
  if (row.activityText !== null) parts.push(row.activityText);
  if (row.openQuestionCount > 0) parts.push(CountTextUtil.countedPhrase(row.openQuestionCount, 'open question', 'open questions'));
  if (row.pendingEditCount > 0) parts.push(CountTextUtil.countedPhrase(row.pendingEditCount, 'pending edit', 'pending edits'));
  return parts.join(', ');
}

function withAccessibleName(row: Omit<PipelineLevelRailRowView, 'accessibleName'>): PipelineLevelRailRowView {
  return { ...row, accessibleName: accessibleNameOf(row) };
}

function forgeRowOf(facts: PipelineLevelRailFacts, selectedLevel: PipelineLevel, activityTextOf: PipelineLevelRailActivityTexts | null): PipelineLevelRailRowView {
  const questions = facts.pipeline.setup?.record.questions ?? [];
  return withAccessibleName({
    level:             FORGE_LEVEL,
    name:              PipelineLevelModel.levelNameOf(FORGE_LEVEL),
    kindText:          FORGE_KIND_TEXT,
    status:            null,
    statusText:        null,
    openQuestionCount: questions.filter((question) => question.answer === null).length,
    pendingEditCount:  pendingEditCountOf(FORGE_LEVEL, facts),
    activityText:      activityTextOf === null ? null : activityTextOf(FORGE_LEVEL),
    selected:          PipelineLevelModel.isForgeLevel(selectedLevel),
  });
}

function openQuestionCountOf(entityKey: string, facts: PipelineLevelRailFacts): number {
  const entityFacts = facts.pipeline.setup?.entities ?? {};
  return Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey]?.openQuestionCount ?? 0 : 0;
}

function gatesStatusTextOf(status: PipelineLevelRailStatus, entity: BoardPipelineEntityDocument): string {
  return status === 'checked' ? CountTextUtil.countedPhrase(entity.gates.length, 'gate', 'gates') : STATUS_TEXTS[status];
}

function entityRowOf(
  entityKey: string,
  entity: BoardPipelineEntityDocument,
  facts: PipelineLevelRailFacts,
  selectedLevel: PipelineLevel,
  markTexts: PipelineLevelRailMarkTexts | null,
  activityTextOf: PipelineLevelRailActivityTexts | null,
): PipelineLevelRailRowView {
  const level = PipelineLevelModel.entityLevelOf(entityKey);
  const status = statusOf(entityKey, entity, facts);
  return withAccessibleName({
    level,
    name:              entityKey,
    kindText:          EntityGroupUtil.kindTextOf(entity.kind),
    status,
    statusText:        markTexts === null ? gatesStatusTextOf(status, entity) : markTexts.textOf(entityKey),
    openQuestionCount: openQuestionCountOf(entityKey, facts),
    pendingEditCount:  pendingEditCountOf(level, facts),
    activityText:      activityTextOf === null ? null : activityTextOf(level),
    selected:          PipelineLevelModel.levelsAreEqual(level, selectedLevel),
  });
}

function matchesFilter(row: PipelineLevelRailRowView, filterText: string): boolean {
  return EntityGroupUtil.matchesFilter([row.name, row.kindText], filterText);
}

/** The apps and packages; the root entity may stay for a person, so it never needs a look. */
function checkedEntitiesOf(entities: ShownEntities): BoardPipelineEntityDocument[] {
  return Object.values(entities).filter((entity) => entity.kind !== 'root');
}

/** "1 entity has no gates · 2 entities have the default constitution". */
function attentionTextOf(entities: ShownEntities): string | null {
  const checkedEntities = checkedEntitiesOf(entities);
  const withoutGates = checkedEntities.filter((entity) => entity.gates.length === 0).length;
  const withDefaultConstitution = checkedEntities.filter((entity) => entity.constitutionPath === null).length;
  const parts: string[] = [];
  if (withoutGates > 0) parts.push(`${CountTextUtil.countedPhrase(withoutGates, 'entity has', 'entities have')} no gates`);
  if (withDefaultConstitution > 0) parts.push(`${CountTextUtil.countedPhrase(withDefaultConstitution, 'entity has', 'entities have')} the default constitution`);
  return parts.length === 0 ? null : parts.join(' · ');
}

function kindOf(entities: ShownEntities, entityKey: string): BoardEntityKind | null {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.kind ?? null : null;
}

/**
 * With `markTexts` the rows carry the screen's words and its attention line, and the note on gates stays away; with `activityTextOf`
 * each row carries its level's work.
 */
function railOf(
  facts: PipelineLevelRailFacts,
  selectedLevel: PipelineLevel,
  filterText: string,
  markTexts: PipelineLevelRailMarkTexts | null = null,
  activityTextOf: PipelineLevelRailActivityTexts | null = null,
): PipelineLevelRailView {
  const entities = PipelineViewModel.entitiesShownOf(facts);
  const allRows = Object.entries(entities).map(([entityKey, entity]) => entityRowOf(entityKey, entity, facts, selectedLevel, markTexts, activityTextOf));
  const shownRows = allRows.filter((row) => matchesFilter(row, filterText));
  const groups = EntityGroupUtil.groupsOf(shownRows, (row) => kindOf(entities, row.name))
    .map((group) => ({ groupKind: group.groupKind, label: group.label, rows: group.items }));
  return {
    forgeRow:             forgeRowOf(facts, selectedLevel, activityTextOf),
    groups,
    attentionText:        markTexts === null ? attentionTextOf(entities) : markTexts.attentionText,
    someEntityHasNoGates: markTexts === null && checkedEntitiesOf(entities).some((entity) => entity.gates.length === 0),
    nothingMatches:       allRows.length > 0 && shownRows.length === 0,
  };
}

/** The rows in the order the arrow keys walk them: the forge, then each group's rows. */
function rowsInOrderOf(rail: PipelineLevelRailView): PipelineLevelRailRowView[] {
  return [rail.forgeRow, ...rail.groups.flatMap((group) => group.rows)];
}

export const PipelineLevelRailModel = Object.freeze({ railOf, rowsInOrderOf });
