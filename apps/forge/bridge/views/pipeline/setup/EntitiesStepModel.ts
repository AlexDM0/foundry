/**
 * The entities step's model, pure: whether the step proposes monorepo mode, holds it, waits for the pipeline agent's proposal or stays in
 * single mode; each entity's row, the root entity's place, the footer's counts and why Continue waits; and the draft edits each gesture
 * makes, as typed edits on the entities a gesture saw. A gesture's edits are kept here as `PipelineDraftEdit`s so the view can apply them
 * to the draft before it sends them, and send them as `pipeline-draft-edit` carries them.
 */
import { GATE_PHASES }      from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import {
  ENTITY_AGENT_ROLES,
  type EntityKey,
  type Pipeline,
  type PipelineEntity,
  type PipelineEntityKind
} from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }                                     from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { EntityDraftEdit, PipelineDraftEdit, PipelineSetup }      from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { EntityOwnershipUtil, ROOT_ENTITY_KEY, type PipelineEntities } from '../../../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineDraftEditUtil }                                       from '../../../../src/lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import type { ControlCommandBody }                                     from '../../../api/CommandClient.ts';
import type { PanelStatus }                                            from '../PipelinePanel.tsx';
import type { DraftEditTarget }                                        from '../flow/PipelineFlowModel.ts';

/**
 * `waiting`: the draft holds no entity yet; `proposed`: the agent proposed entities and User has not taken them; `accepted`: User took
 * monorepo mode; `single`: User declined it, so the draft holds no entity and the forge keeps one pipeline.
 */
export type EntitiesMode = 'waiting' | 'proposed' | 'accepted' | 'single';

/** The kinds a row offers; the root entity has its own place under the rows. */
export type RowEntityKind = Exclude<PipelineEntityKind, 'root'>;

/** `person`: the root entity is only implied, with no gates and no constitution; `gated`: the draft holds it with a pipeline of its own. */
export type RootChoice = 'person' | 'gated';

export interface WhitelistEntryView {
  readonly key:     EntityKey;
  /** Why the entry is refused, in a few words; `null` for an entry the validator takes. */
  readonly refused: string | null;
}

export interface EntityRowView {
  readonly key:              EntityKey;
  readonly kind:             RowEntityKind;
  /** The home folders as the boards show them, without the leading `/`. */
  readonly homes:            readonly string[];
  readonly summary:          string | null;
  /** The constitution the entity names, `null` while it reads the installed default. */
  readonly constitutionPath: string | null;
  readonly dependsOnText:    string;
  readonly whitelist:        readonly WhitelistEntryView[];
  readonly reach:            readonly string[];
  /** The apps whose whitelist names this package. */
  readonly whitelistedBy:    readonly EntityKey[];
  /** The packages its whitelist may still take: every other package. */
  readonly addablePackages:  readonly EntityKey[];
  /** The one line under the summary: a refusal of the row, in the error colour, or nothing. */
  readonly refusalNote:      string | null;
}

export interface RootEntityView {
  readonly key:              EntityKey;
  readonly choice:           RootChoice;
  readonly constitutionText: string;
}

/** A new entity as the add form takes it. */
export interface EntityAddition {
  readonly key:        string;
  readonly kind:       RowEntityKind;
  readonly homeFolder: string;
}

const NO_ENTITIES: PipelineEntities = Object.freeze({});

const DONE_STEP_STATES: ReadonlySet<string> = new Set(['done', 'needs-recheck']);

const ENTITY_FIELD_PREFIX = 'entity:';

const DEFAULT_REVIEW_NAME = 'review';

const ROOT_HOME = '/';

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The draft's entities after the edits a gesture holds, written in order as the Board would write them. */
function entitiesAfterEdits(draft: Readonly<Pipeline> | null, edits: readonly PipelineDraftEdit[]): PipelineEntities {
  if (draft === null) return NO_ENTITIES;
  let pipeline = draft;
  for (const edit of edits) pipeline = PipelineDraftEditUtil.pipelineWithEdit(pipeline, edit);
  return pipeline.entities ?? NO_ENTITIES;
}

function userEditedAnEntity(record: Pick<PipelineSetup, 'edits'>): boolean {
  return record.edits.some((edit) => edit.by === 'user' && !edit.undone && edit.field.startsWith(ENTITY_FIELD_PREFIX));
}

/**
 * The step's mode. User took monorepo mode by pressing Accept here, by editing an entity, or by a Continue that marked the step done; an
 * empty draft after User removed entities is single mode.
 */
function modeOf(record: Pick<PipelineSetup, 'edits' | 'stepStates'>, entities: PipelineEntities, acceptedHere: boolean): EntitiesMode {
  if (Object.keys(entities).length === 0) return userEditedAnEntity(record) ? 'single' : 'waiting';
  const stepIsDone = DONE_STEP_STATES.has(record.stepStates.entities ?? 'not-started');
  return acceptedHere || stepIsDone || userEditedAnEntity(record) ? 'accepted' : 'proposed';
}

function homeShownOf(home: string): string {
  return home === ROOT_HOME ? home : home.replace(/^\/+/u, '');
}

/** A folder as User types it, as the draft stores it: leading with `/`, without a trailing one; `null` for a blank one. */
function repositoryPathOf(typed: string): string | null {
  const trimmed = typed.trim().replace(/\/+$/u, '');
  if (trimmed === '') return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function entityOf(entities: PipelineEntities, key: EntityKey): Readonly<PipelineEntity> | undefined {
  return Object.hasOwn(entities, key) ? entities[key] : undefined;
}

function rowKindOf(kind: PipelineEntityKind): RowEntityKind {
  return kind === 'package' ? 'package' : 'app';
}

function packageKeysOf(entities: PipelineEntities): EntityKey[] {
  return Object.keys(entities).filter((key) => entities[key]?.kind === 'package');
}

function whitelistRefusalOf(entities: PipelineEntities, whitelistedKey: EntityKey): string | null {
  const whitelisted = entityOf(entities, whitelistedKey);
  if (whitelisted === undefined) return 'not an entity';
  if (whitelisted.kind !== 'package') return 'not a package';
  return whitelisted.review === undefined ? 'no review step' : null;
}

function refusalNoteOf(whitelist: readonly WhitelistEntryView[]): string | null {
  const refused = whitelist.find((entry) => entry.refused !== null);
  return refused === undefined ? null : `Whitelist names ${refused.key}: ${refused.refused ?? ''}`;
}

function rowOf(entities: PipelineEntities, key: EntityKey, entity: Readonly<PipelineEntity>): EntityRowView {
  const whitelist = (entity.whitelist ?? []).map((whitelistedKey) => ({ key: whitelistedKey, refused: whitelistRefusalOf(entities, whitelistedKey) }));
  const whitelistedBy = Object.keys(entities).filter((otherKey) => otherKey !== key && (entities[otherKey]?.whitelist ?? []).includes(key));
  const dependsOn = entity.dependsOn ?? [];
  return {
    key,
    kind:             rowKindOf(entity.kind),
    homes:            entity.home.map(homeShownOf),
    summary:          entity.summary ?? null,
    constitutionPath: entity.constitution?.path ?? null,
    dependsOnText:    dependsOn.length === 0 ? 'none' : dependsOn.join(', '),
    whitelist,
    reach:            [...entity.reach ?? []],
    whitelistedBy,
    addablePackages:  packageKeysOf(entities).filter((packageKey) => packageKey !== key && !(entity.whitelist ?? []).includes(packageKey)),
    refusalNote:      refusalNoteOf(whitelist),
  };
}

/** Every entity but the root one, in the draft's order. */
function rowsOf(entities: PipelineEntities): EntityRowView[] {
  return Object.entries(entities).filter(([, entity]) => entity.kind !== 'root').map(([key, entity]) => rowOf(entities, key, entity));
}

function rootChoiceOf(entities: PipelineEntities): RootChoice {
  return Object.values(entities).some((entity) => entity.kind === 'root') ? 'gated' : 'person';
}

function rootViewOf(entities: PipelineEntities): RootEntityView {
  const choice = rootChoiceOf(entities);
  return { key: EntityOwnershipUtil.rootEntityKeyOf(entities), choice, constitutionText: choice === 'person' ? 'Not needed' : 'Drafted next' };
}

/** The entities and the root, which always exists though the draft may only imply it. */
function entityCountOf(entities: PipelineEntities): number {
  const rowCount = rowsOf(entities).length;
  return rowCount + 1;
}

function entityCountTextOf(entities: PipelineEntities): string {
  const rowCount = rowsOf(entities).length;
  return `${countText(rowCount + 1, 'entity', 'entities')} · ${countText(rowCount, 'proposed entity', 'proposed entities')}, and the root`;
}

function footerSummaryOf(entities: PipelineEntities, refusalCount: number, openQuestionCount: number): string {
  return [
    countText(entityCountOf(entities), 'entity', 'entities'),
    refusalCount === 0 ? 'no refusal' : countText(refusalCount, 'refusal', 'refusals'),
    openQuestionCount === 0 ? 'no open question' : `${countText(openQuestionCount, 'question', 'questions')} open`,
  ].join(' · ');
}

function footerHintOf(mode: EntitiesMode): string {
  switch (mode) {
    case 'waiting':
      return 'The pipeline agent proposes the entities from the layout it found.';
    case 'proposed':
      return 'Accept monorepo mode or stay in single mode.';
    case 'accepted':
      return 'Constitutions come next, one per entity.';
    case 'single':
      return 'One pipeline for the whole repository comes next.';
  }
}

/** Why Continue waits, as its title says it; `null` once it may go. */
function continueBlockOf(mode: EntitiesMode, refusalCount: number, heldChangeCount: number): string | null {
  if (mode === 'waiting') return 'Wait for the proposal, or stay in single mode';
  if (mode === 'proposed') return 'Accept monorepo mode first, or stay in single mode';
  if (refusalCount > 0 || heldChangeCount > 0) return 'Resolve the refusal first';
  return null;
}

const SHORT_COMMIT_LENGTH = 7;

/** "Layout found by the pipeline agent J2 · snapshot of main at a1b2c3d", as far as the record names them. */
function statusLineOf(record: Pick<PipelineSetup, 'agentJobId' | 'snapshotCommit'>): string {
  const agent = record.agentJobId === null ? 'Layout found by the pipeline agent' : `Layout found by the pipeline agent ${record.agentJobId}`;
  return record.snapshotCommit === null ? agent : `${agent} · snapshot of main at ${record.snapshotCommit.slice(0, SHORT_COMMIT_LENGTH)}`;
}

function headingOf(project: string): string {
  return project === '' ? 'The entities of the repository' : `The entities of ${project}`;
}

function panelStatusOf(setup: Pick<PipelineSetupFacts, 'openQuestionCount' | 'agentJobState'>): PanelStatus {
  if (setup.openQuestionCount > 0) return { tone: 'working', text: 'Waiting for you' };
  if (setup.agentJobState === null) return { tone: 'idle', text: 'Stopped' };
  return { tone: 'ready', text: 'Done with the layout' };
}

function continueCommandOf(record: Pick<PipelineSetup, 'setupId'>): ControlCommandBody {
  return {
    kind: 'pipeline-setup-step', setupId: record.setupId, step: 'entities', move: 'continue'
  };
}

function draftEditTargetOf(record: Pick<PipelineSetup, 'setupId' | 'draftRevision'>): DraftEditTarget {
  return { setupId: record.setupId, draftRevision: record.draftRevision };
}

function definitionEditOf(key: EntityKey, entity: Readonly<PipelineEntity> | null): PipelineDraftEdit {
  return { target: 'entity', entityKey: key, value: entity === null ? null : PipelineDraftEditUtil.definitionOf(entity) };
}

function withinEntityEditOf(key: EntityKey, edit: EntityDraftEdit): PipelineDraftEdit {
  return { target: 'within-entity', entityKey: key, edit };
}

/** A list edit that removes the key once the list is empty, so the entity stores no empty list. */
function keyListEditOf(key: EntityKey, target: 'whitelist' | 'depends-on', keys: readonly EntityKey[]): PipelineDraftEdit {
  return withinEntityEditOf(key, { target, value: keys.length === 0 ? null : [...keys] });
}

/**
 * The whitelist and depends-on edits of every other entity that names `oldKey`: the name replaced by `newKey`, or dropped when it is
 * `null`, never twice and never naming the entity itself. `skippedKeys` are left alone, as the entity the caller rewrites itself.
 */
function referenceEditsOf(entities: PipelineEntities, oldKey: EntityKey, newKey: EntityKey | null, skippedKeys: readonly EntityKey[]): PipelineDraftEdit[] {
  const replaced = (keys: readonly EntityKey[], ownKey: EntityKey): EntityKey[] => {
    const renamed = keys.flatMap((key) => (key === oldKey ? (newKey === null ? [] : [newKey]) : [key]));
    return [...new Set(renamed)].filter((key) => key !== ownKey);
  };
  return Object.entries(entities).filter(([key]) => !skippedKeys.includes(key)).flatMap(([key, entity]) => {
    const edits: PipelineDraftEdit[] = [];
    if ((entity.whitelist ?? []).includes(oldKey)) edits.push(keyListEditOf(key, 'whitelist', replaced(entity.whitelist ?? [], key)));
    if ((entity.dependsOn ?? []).includes(oldKey)) edits.push(keyListEditOf(key, 'depends-on', replaced(entity.dependsOn ?? [], key)));
    return edits;
  });
}

/** The edit a set key needs, none for an absent one. */
function editsOfSet<Value>(value: Value | undefined, editOf: (setValue: Value) => EntityDraftEdit): EntityDraftEdit[] {
  return value === undefined ? [] : [editOf(value)];
}

/** The edits that give an entity, newly defined, everything the given one holds beyond its definition. */
function contentEditsOf(key: EntityKey, entity: Readonly<PipelineEntity>): PipelineDraftEdit[] {
  const within: EntityDraftEdit[] = [
    ...entity.prepare.map((step): EntityDraftEdit => ({ target: 'prepare', name: step.name, value: step })),
    ...entity.gates.map((gate): EntityDraftEdit => ({ target: 'gate', name: gate.name, value: gate })),
    ...GATE_PHASES.filter((phase) => entity.phases[phase].length > 0)
      .map((phase): EntityDraftEdit => ({ target: 'phase-order', phase, names: [...entity.phases[phase]] })),
    ...editsOfSet(entity.review, (review) => ({ target: 'review', value: review })),
    ...editsOfSet(entity.constitution, (constitution) => ({ target: 'constitution', value: constitution })),
    ...ENTITY_AGENT_ROLES.flatMap((role) => editsOfSet(entity.agents?.[role], (settings) => ({ target: 'role', role, value: settings }))),
    ...editsOfSet(entity.whitelist, (whitelist) => ({ target: 'whitelist', value: [...whitelist] })),
    ...editsOfSet(entity.reach, (reach) => ({ target: 'reach', value: [...reach] })),
    ...editsOfSet(entity.dependsOn, (dependsOn) => ({ target: 'depends-on', value: [...dependsOn] })),
    ...editsOfSet(entity.concurrency, (concurrency) => ({ target: 'concurrency', value: concurrency })),
  ];
  return within.map((edit) => withinEntityEditOf(key, edit));
}

/** A key the draft edit's field can name: the field codec splits an entity's field at its scope separator, so the key holds none. */
function keyIsAddressable(key: EntityKey): boolean {
  return PipelineDraftEditUtil.fieldIsWellFormed(PipelineDraftEditUtil.fieldOf({ target: 'entity', entityKey: key, value: null }));
}

/**
 * Why a typed key cannot name an entity, in a few words; `null` for a key that can, and for a blank key or the entity's own, which make no
 * edit and need no reason. `ownKey` is the key of the entity being renamed, `null` for a new one.
 */
function keyRefusalOf(entities: PipelineEntities, typedKey: string, ownKey: EntityKey | null): string | null {
  const key = typedKey.trim();
  if (key === '' || key === ownKey) return null;
  if (key === ROOT_ENTITY_KEY) return 'The root entity has this key';
  if (Object.hasOwn(entities, key)) return 'Another entity has this key';
  return keyIsAddressable(key) ? null : 'A key cannot hold "/"';
}

/** A new key, not blank and with no refusal: the entity moves to it whole, and every list that named it follows. */
function renameEditsOf(entities: PipelineEntities, oldKey: EntityKey, typedKey: string): PipelineDraftEdit[] | null {
  const newKey = typedKey.trim();
  const entity = entityOf(entities, oldKey);
  if (entity === undefined || newKey === '' || newKey === oldKey || keyRefusalOf(entities, newKey, oldKey) !== null) return null;
  return [
    definitionEditOf(oldKey, null),
    definitionEditOf(newKey, entity),
    ...contentEditsOf(newKey, entity),
    ...referenceEditsOf(entities, oldKey, newKey, [oldKey]),
  ];
}

function kindEditOf(entities: PipelineEntities, key: EntityKey, kind: RowEntityKind): PipelineDraftEdit | null {
  const entity = entityOf(entities, key);
  if (entity === undefined || entity.kind === kind) return null;
  return definitionEditOf(key, { ...entity, kind });
}

function homeAddedEditOf(entities: PipelineEntities, key: EntityKey, typedFolder: string): PipelineDraftEdit | null {
  const entity = entityOf(entities, key);
  const folder = repositoryPathOf(typedFolder);
  if (entity === undefined || folder === null || entity.home.includes(folder)) return null;
  return definitionEditOf(key, { ...entity, home: [...entity.home, folder] });
}

/** An entity keeps one home folder at least, so the last one is not removed. */
function homeRemovedEditOf(entities: PipelineEntities, key: EntityKey, shownHome: string): PipelineDraftEdit | null {
  const entity = entityOf(entities, key);
  if (entity === undefined || entity.home.length <= 1) return null;
  const home = entity.home.filter((folder) => homeShownOf(folder) !== shownHome);
  return home.length === entity.home.length ? null : definitionEditOf(key, { ...entity, home });
}

/** The entity goes, and so does every whitelist and depends-on entry that named it. */
function entityRemovedEditsOf(entities: PipelineEntities, key: EntityKey): PipelineDraftEdit[] {
  if (entityOf(entities, key) === undefined) return [];
  return [definitionEditOf(key, null), ...referenceEditsOf(entities, key, null, [key])];
}

/** A key with no refusal, and one home folder: the draft stores no entity without a home. */
function entityAddedEditOf(entities: PipelineEntities, addition: EntityAddition): PipelineDraftEdit | null {
  const key = addition.key.trim();
  const folder = repositoryPathOf(addition.homeFolder);
  if (key === '' || keyRefusalOf(entities, key, null) !== null || folder === null) return null;
  return { target: 'entity', entityKey: key, value: { kind: addition.kind, home: [folder] } };
}

function whitelistAddedEditOf(entities: PipelineEntities, key: EntityKey, packageKey: EntityKey): PipelineDraftEdit | null {
  const whitelist = entityOf(entities, key)?.whitelist ?? [];
  if (packageKey === key || whitelist.includes(packageKey)) return null;
  return keyListEditOf(key, 'whitelist', [...whitelist, packageKey]);
}

function whitelistRemovedEditOf(entities: PipelineEntities, key: EntityKey, packageKey: EntityKey): PipelineDraftEdit {
  return keyListEditOf(key, 'whitelist', (entityOf(entities, key)?.whitelist ?? []).filter((entry) => entry !== packageKey));
}

function dependencyRemovedEditOf(entities: PipelineEntities, key: EntityKey, dependencyKey: EntityKey): PipelineDraftEdit {
  return keyListEditOf(key, 'depends-on', (entityOf(entities, key)?.dependsOn ?? []).filter((entry) => entry !== dependencyKey));
}

function reachEditOf(key: EntityKey, reach: readonly string[]): PipelineDraftEdit {
  return withinEntityEditOf(key, { target: 'reach', value: reach.length === 0 ? null : [...reach] });
}

function reachAddedEditOf(entities: PipelineEntities, key: EntityKey, typedPath: string): PipelineDraftEdit | null {
  const reach = entityOf(entities, key)?.reach ?? [];
  const path = repositoryPathOf(typedPath);
  if (path === null || reach.includes(path)) return null;
  return reachEditOf(key, [...reach, path]);
}

function reachRemovedEditOf(entities: PipelineEntities, key: EntityKey, path: string): PipelineDraftEdit {
  return reachEditOf(key, (entityOf(entities, key)?.reach ?? []).filter((entry) => entry !== path));
}

function reviewAddedEditOf(key: EntityKey): PipelineDraftEdit {
  return withinEntityEditOf(key, { target: 'review', value: { name: DEFAULT_REVIEW_NAME } });
}

/** `gated` adds the root entity over the repository's root folder; `person` removes it, so the root is only implied again. */
function rootChoiceEditsOf(entities: PipelineEntities, choice: RootChoice): PipelineDraftEdit[] {
  if (rootChoiceOf(entities) === choice) return [];
  if (choice === 'gated') return [{ target: 'entity', entityKey: ROOT_ENTITY_KEY, value: { kind: 'root', home: [ROOT_HOME] } }];
  const rootKey = EntityOwnershipUtil.rootEntityKeyOf(entities);
  return [definitionEditOf(rootKey, null), ...referenceEditsOf(entities, rootKey, null, [rootKey])];
}

/** Stay in single mode: every entity leaves the draft, so the forge keeps one pipeline. */
function declineEditsOf(entities: PipelineEntities): PipelineDraftEdit[] {
  return Object.keys(entities).map((key) => definitionEditOf(key, null));
}

export const EntitiesStepModel = Object.freeze({
  entitiesAfterEdits,
  modeOf,
  rowsOf,
  rootViewOf,
  entityCountTextOf,
  footerSummaryOf,
  footerHintOf,
  continueBlockOf,
  panelStatusOf,
  statusLineOf,
  headingOf,
  continueCommandOf,
  draftEditTargetOf,
  keyRefusalOf,
  renameEditsOf,
  kindEditOf,
  homeAddedEditOf,
  homeRemovedEditOf,
  entityRemovedEditsOf,
  entityAddedEditOf,
  whitelistAddedEditOf,
  whitelistRemovedEditOf,
  dependencyRemovedEditOf,
  reachAddedEditOf,
  reachRemovedEditOf,
  reviewAddedEditOf,
  rootChoiceEditsOf,
  declineEditsOf,
  referenceEditsOf,
  repositoryPathOf,
});
