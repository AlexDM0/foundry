/**
 * The entities step's model, pure: the mode, each entity's row, the footer and the draft edits each gesture makes. Whether the draft they leave is
 * refused is the forge's verdict, served with the draft.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardDraftEditDocument,
  BoardEntityDraftEditDocument,
  BoardEntityRefusalDocument,
  BoardPipelineEntityDocument,
  BoardPipelineSetupDocument,
  BoardSetupRecordDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BOARD_ENTITY_AGENT_ROLES, BOARD_GATE_PHASES, type BoardEntityKind } from '../../../../@types/board/BoardVocabulary.ts';
import type { BoardEntityRefusalReason }                                     from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                                     from '../../../../shared/utils/CountTextUtil.ts';
import type { PanelStatus }                                                  from '../PipelinePanel.tsx';
import { NOT_LAUNCHED_PANEL_STATUS, type AgentSessionState }                 from '../agent-panel/AgentSessionModel.ts';
import type { DraftEditTarget }                                              from '../flow/PipelineFlowModel.ts';

/**
 * `waiting`: the draft holds no entity yet; `proposed`: the agent proposed entities and User has not taken them; `accepted`: User took
 * monorepo mode; `single`: User declined it, so the draft holds no entity and the forge keeps one pipeline.
 */
/** The draft's entities by key, as the forge serves them. */
type DraftEntities = Readonly<Record<string, BoardPipelineEntityDocument>>;

export type EntitiesMode = 'waiting' | 'proposed' | 'accepted' | 'single';

/** The kinds a row offers; the root entity has its own place under the rows. */
export type RowEntityKind = Exclude<BoardEntityKind, 'root'>;

/** `person`: the root entity is only implied, with no gates and no constitution; `gated`: the draft holds it with a pipeline of its own. */
export type RootChoice = 'person' | 'gated';

export interface WhitelistEntryView {
  readonly key:     string;
  /** Why the forge refuses the entry, in a few words; `null` for an entry no served refusal names. */
  readonly refused: string | null;
}

export interface EntityRowView {
  readonly key:              string;
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
  readonly whitelistedBy:    readonly string[];
  /** The packages its whitelist may still take: every other package. */
  readonly addablePackages:  readonly string[];
  /** The one line under the summary: the forge's sentence of a refusal shown on the row, in the error colour, or nothing. */
  readonly refusalNote:      string | null;
}

export interface RootEntityView {
  readonly key:              string;
  readonly choice:           RootChoice;
  readonly constitutionText: string;
}

/** A new entity as the add form takes it. */
export interface EntityAddition {
  readonly key:        string;
  readonly kind:       RowEntityKind;
  readonly homeFolder: string;
}

const DONE_STEP_STATES: ReadonlySet<string> = new Set(['done', 'needs-recheck']);

const ENTITY_FIELD_PREFIX = 'entity:';

const DEFAULT_REVIEW_NAME = 'review';

const ROOT_HOME = '/';

/** The key the forge gives the root entity while the draft only implies it, and the key a gated root is added under. */
const IMPLIED_ROOT_ENTITY_KEY = 'root';

/** The entities of the draft the forge stores, refused or not: the step holds no edit of its own. */
function draftEntitiesOf(record: Pick<BoardSetupRecordDocument, 'draft'>): DraftEntities {
  return record.draft?.entities ?? {};
}

/** A gesture's edits go to the forge at once, whatever refusal the draft they leave holds; none while another gesture is in flight. */
function sentEditsOf(edits: readonly BoardDraftEditDocument[], gesturesAreOpen: boolean): readonly BoardDraftEditDocument[] | null {
  return edits.length === 0 || !gesturesAreOpen ? null : edits;
}

function userEditedAnEntity(record: Pick<BoardSetupRecordDocument, 'edits'>): boolean {
  return record.edits.some((edit) => edit.by === 'user' && !edit.undone && edit.field.startsWith(ENTITY_FIELD_PREFIX));
}

/**
 * The step's mode. User took monorepo mode by pressing Accept here, by editing an entity, or by a Continue that marked the step done; an
 * empty draft after User removed entities is single mode.
 */
function modeOf(record: Pick<BoardSetupRecordDocument, 'edits' | 'stepStates'>, entities: DraftEntities, acceptedHere: boolean): EntitiesMode {
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

function entityOf(entities: DraftEntities, key: string): Readonly<BoardPipelineEntityDocument> | undefined {
  return Object.hasOwn(entities, key) ? entities[key] : undefined;
}

function rowKindOf(kind: BoardEntityKind): RowEntityKind {
  return kind === 'package' ? 'package' : 'app';
}

function packageKeysOf(entities: DraftEntities): string[] {
  return Object.keys(entities).filter((key) => entities[key]?.kind === 'package');
}

/** The few words a whitelist entry shows for the served refusal that names it. */
const WHITELIST_REFUSAL_WORDS: Readonly<Partial<Record<BoardEntityRefusalReason, string>>> = Object.freeze({
  'unknown-whitelist-key':              'not an entity',
  'whitelisted-entity-not-package':     'not a package',
  'whitelisted-package-without-review': 'no review step',
});

/**
 * The words of a served whitelist refusal shown on the row that names this entry: by the keys it names, or, for a key the forge finds
 * no entity of, by the entry the draft holds no entity for.
 */
function whitelistRefusalOf(entities: DraftEntities, rowRefusals: readonly BoardEntityRefusalDocument[], whitelistedKey: string): string | null {
  const refusal = rowRefusals.find((candidate) => (candidate.reason === 'unknown-whitelist-key'
    ? !Object.hasOwn(entities, whitelistedKey)
    : candidate.entityKeys.includes(whitelistedKey)));
  return refusal === undefined ? null : WHITELIST_REFUSAL_WORDS[refusal.reason] ?? null;
}

function rowOf(entities: DraftEntities, refusals: readonly BoardEntityRefusalDocument[], key: string, entity: Readonly<BoardPipelineEntityDocument>): EntityRowView {
  const rowRefusals = refusals.filter((refusal) => refusal.shownOn === key);
  const whitelistRefusals = rowRefusals.filter((refusal) => Object.hasOwn(WHITELIST_REFUSAL_WORDS, refusal.reason));
  const whitelist = entity.whitelist.map((whitelistedKey) => ({ key: whitelistedKey, refused: whitelistRefusalOf(entities, whitelistRefusals, whitelistedKey) }));
  const whitelistedBy = Object.keys(entities).filter((otherKey) => otherKey !== key && (entities[otherKey]?.whitelist ?? []).includes(key));
  const { dependsOn } = entity;
  return {
    key,
    kind:             rowKindOf(entity.kind),
    homes:            entity.home.map(homeShownOf),
    summary:          entity.summary,
    constitutionPath: entity.constitutionPath,
    dependsOnText:    dependsOn.length === 0 ? 'none' : dependsOn.join(', '),
    whitelist,
    reach:            [...entity.reach],
    whitelistedBy,
    addablePackages:  packageKeysOf(entities).filter((packageKey) => packageKey !== key && !entity.whitelist.includes(packageKey)),
    refusalNote:      rowRefusals[0]?.text ?? null,
  };
}

/** Every entity but the root one, in the draft's order, each with the forge's sentence of the first served refusal shown on its row. */
function rowsOf(entities: DraftEntities, refusals: readonly BoardEntityRefusalDocument[] = []): EntityRowView[] {
  return Object.entries(entities).filter(([, entity]) => entity.kind !== 'root').map(([key, entity]) => rowOf(entities, refusals, key, entity));
}

/** The root entity is the one whose kind is root; while the draft only implies it, it goes by the key the forge implies it with. */
function rootEntityKeyOf(entities: DraftEntities): string {
  return Object.keys(entities).find((key) => entities[key]?.kind === 'root') ?? IMPLIED_ROOT_ENTITY_KEY;
}

function rootChoiceOf(entities: DraftEntities): RootChoice {
  return Object.values(entities).some((entity) => entity.kind === 'root') ? 'gated' : 'person';
}

function rootViewOf(entities: DraftEntities): RootEntityView {
  const choice = rootChoiceOf(entities);
  return { key: rootEntityKeyOf(entities), choice, constitutionText: choice === 'person' ? 'Not needed' : 'Drafted next' };
}

/** The entities and the root, which always exists though the draft may only imply it. */
function entityCountOf(entities: DraftEntities): number {
  const rowCount = rowsOf(entities).length;
  return rowCount + 1;
}

function entityCountTextOf(entities: DraftEntities): string {
  const rowCount = rowsOf(entities).length;
  return `${CountTextUtil.countedPhrase(rowCount + 1, 'entity', 'entities')} · ${CountTextUtil.countedPhrase(rowCount, 'proposed entity', 'proposed entities')}, and the root`;
}

function footerSummaryOf(entities: DraftEntities, refusalCount: number, openQuestionCount: number): string {
  return [
    CountTextUtil.countedPhrase(entityCountOf(entities), 'entity', 'entities'),
    refusalCount === 0 ? 'no refusal' : CountTextUtil.countedPhrase(refusalCount, 'refusal', 'refusals'),
    openQuestionCount === 0 ? 'no open question' : `${CountTextUtil.countedPhrase(openQuestionCount, 'question', 'questions')} open`,
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
function continueBlockOf(mode: EntitiesMode, refusalCount: number): string | null {
  if (mode === 'waiting') return 'Wait for the proposal, or stay in single mode';
  if (mode === 'proposed') return 'Accept monorepo mode first, or stay in single mode';
  if (refusalCount > 0) return 'Resolve the refusal first';
  return null;
}

const SHORT_COMMIT_LENGTH = 7;

/** The layout line, naming the pipeline agent's job and the snapshot of main as far as the record names them. */
function statusLineOf(record: Pick<BoardSetupRecordDocument, 'agentJobId' | 'snapshotCommit'>): string {
  const agent = record.agentJobId === null ? 'Layout found by the pipeline agent' : `Layout found by the pipeline agent ${record.agentJobId}`;
  return record.snapshotCommit === null ? agent : `${agent} · snapshot of main at ${record.snapshotCommit.slice(0, SHORT_COMMIT_LENGTH)}`;
}

function headingOf(project: string): string {
  return project === '' ? 'The entities of the repository' : `The entities of ${project}`;
}

function panelStatusOf(setup: Pick<BoardPipelineSetupDocument, 'openQuestionCount'>, sessionState: AgentSessionState): PanelStatus {
  if (setup.openQuestionCount > 0) return { tone: 'working', text: 'Waiting for you' };
  if (sessionState === 'not-launched') return NOT_LAUNCHED_PANEL_STATUS;
  if (sessionState === 'stopped') return { tone: 'idle', text: 'Stopped' };
  return { tone: 'ready', text: 'Done with the layout' };
}

function continueCommandOf(record: Pick<BoardSetupRecordDocument, 'setupId'>): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-step', setupId: record.setupId, step: 'entities', move: 'continue'
  };
}

function draftEditTargetOf(record: Pick<BoardSetupRecordDocument, 'setupId' | 'draftRevision'>): DraftEditTarget {
  return { setupId: record.setupId, draftRevision: record.draftRevision };
}

function definitionEditOf(key: string, entity: Readonly<BoardPipelineEntityDocument> | null): BoardDraftEditDocument {
  return { target: 'entity', entityKey: key, value: entity === null ? null : { kind: entity.kind, home: entity.home, summary: entity.summary } };
}

function withinEntityEditOf(key: string, edit: BoardEntityDraftEditDocument): BoardDraftEditDocument {
  return { target: 'within-entity', entityKey: key, edit };
}

/** A list edit that removes the key once the list is empty, so the entity stores no empty list. */
function keyListEditOf(key: string, target: 'whitelist' | 'depends-on', keys: readonly string[]): BoardDraftEditDocument {
  return withinEntityEditOf(key, { target, value: keys.length === 0 ? null : [...keys] });
}

/**
 * The whitelist and depends-on edits of every other entity that names `oldKey`: the name replaced by `newKey`, or dropped when it is
 * `null`, never twice and never naming the entity itself. `skippedKeys` are left alone, as the entity the caller rewrites itself.
 */
function referenceEditsOf(entities: DraftEntities, oldKey: string, newKey: string | null, skippedKeys: readonly string[]): BoardDraftEditDocument[] {
  const replaced = (keys: readonly string[], ownKey: string): string[] => {
    const renamed = keys.flatMap((key) => (key === oldKey ? (newKey === null ? [] : [newKey]) : [key]));
    return [...new Set(renamed)].filter((key) => key !== ownKey);
  };
  return Object.entries(entities).filter(([key]) => !skippedKeys.includes(key)).flatMap(([key, entity]) => {
    const edits: BoardDraftEditDocument[] = [];
    if (entity.whitelist.includes(oldKey)) edits.push(keyListEditOf(key, 'whitelist', replaced(entity.whitelist, key)));
    if (entity.dependsOn.includes(oldKey)) edits.push(keyListEditOf(key, 'depends-on', replaced(entity.dependsOn, key)));
    return edits;
  });
}

/** The edit a set value needs, none for an absent one. */
function editsOfSet<Value>(value: Value | null | undefined, editOf: (setValue: Value) => BoardEntityDraftEditDocument): BoardEntityDraftEditDocument[] {
  return value === null || value === undefined ? [] : [editOf(value)];
}

/** A list the entity holds, `null` for an empty one, which it stores as none. */
function heldListOf(list: readonly string[]): readonly string[] | null {
  return list.length === 0 ? null : list;
}

/** The edits that give an entity, newly defined, everything the given one holds beyond its definition. */
function contentEditsOf(key: string, entity: Readonly<BoardPipelineEntityDocument>): BoardDraftEditDocument[] {
  const within: BoardEntityDraftEditDocument[] = [
    ...entity.prepare.map((step): BoardEntityDraftEditDocument => ({ target: 'prepare', name: step.name, value: step })),
    ...entity.gates.map((gate): BoardEntityDraftEditDocument => ({ target: 'gate', name: gate.name, value: gate })),
    ...BOARD_GATE_PHASES.filter((phase) => entity.phases[phase].length > 0)
      .map((phase): BoardEntityDraftEditDocument => ({ target: 'phase-order', phase, names: [...entity.phases[phase]] })),
    ...editsOfSet(entity.review, (review) => ({ target: 'review', value: review })),
    ...editsOfSet(entity.constitutionPath, (constitutionPath) => ({ target: 'constitution', constitutionPath })),
    ...BOARD_ENTITY_AGENT_ROLES.flatMap((role) => editsOfSet(entity.agents[role], (settings) => ({ target: 'role', role, value: settings }))),
    ...editsOfSet(heldListOf(entity.whitelist), (whitelist) => ({ target: 'whitelist', value: [...whitelist] })),
    ...editsOfSet(heldListOf(entity.reach), (reach) => ({ target: 'reach', value: [...reach] })),
    ...editsOfSet(heldListOf(entity.dependsOn), (dependsOn) => ({ target: 'depends-on', value: [...dependsOn] })),
    ...editsOfSet(entity.concurrency, (concurrency) => ({ target: 'concurrency', value: concurrency })),
  ];
  return within.map((edit) => withinEntityEditOf(key, edit));
}

/**
 * Why a typed key cannot name an entity, in a few words; `null` for a key that can, and for a blank key or the entity's own, which make no
 * edit and need no reason. `ownKey` is the key of the entity being renamed, `null` for a new one.
 */
function keyRefusalOf(entities: DraftEntities, typedKey: string, ownKey: string | null): string | null {
  const key = typedKey.trim();
  if (key === '' || key === ownKey) return null;
  if (key === IMPLIED_ROOT_ENTITY_KEY) return 'The root entity has this key';
  return Object.hasOwn(entities, key) ? 'Another entity has this key' : null;
}

/** A new key, not blank and with no refusal: the entity moves to it whole, and every list that named it follows. */
function renameEditsOf(entities: DraftEntities, oldKey: string, typedKey: string): BoardDraftEditDocument[] | null {
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

function kindEditOf(entities: DraftEntities, key: string, kind: RowEntityKind): BoardDraftEditDocument | null {
  const entity = entityOf(entities, key);
  if (entity === undefined || entity.kind === kind) return null;
  return definitionEditOf(key, { ...entity, kind });
}

function homeAddedEditOf(entities: DraftEntities, key: string, typedFolder: string): BoardDraftEditDocument | null {
  const entity = entityOf(entities, key);
  const folder = repositoryPathOf(typedFolder);
  if (entity === undefined || folder === null || entity.home.includes(folder)) return null;
  return definitionEditOf(key, { ...entity, home: [...entity.home, folder] });
}

/** An entity keeps one home folder at least, so the last one is not removed. */
function homeRemovedEditOf(entities: DraftEntities, key: string, shownHome: string): BoardDraftEditDocument | null {
  const entity = entityOf(entities, key);
  if (entity === undefined || entity.home.length <= 1) return null;
  const home = entity.home.filter((folder) => homeShownOf(folder) !== shownHome);
  return home.length === entity.home.length ? null : definitionEditOf(key, { ...entity, home });
}

/** The entity goes, and so does every whitelist and depends-on entry that named it. */
function entityRemovedEditsOf(entities: DraftEntities, key: string): BoardDraftEditDocument[] {
  if (entityOf(entities, key) === undefined) return [];
  return [definitionEditOf(key, null), ...referenceEditsOf(entities, key, null, [key])];
}

/** A key with no refusal, and one home folder: the draft stores no entity without a home. */
function entityAddedEditOf(entities: DraftEntities, addition: EntityAddition): BoardDraftEditDocument | null {
  const key = addition.key.trim();
  const folder = repositoryPathOf(addition.homeFolder);
  if (key === '' || keyRefusalOf(entities, key, null) !== null || folder === null) return null;
  return { target: 'entity', entityKey: key, value: { kind: addition.kind, home: [folder], summary: null } };
}

function whitelistAddedEditOf(entities: DraftEntities, key: string, packageKey: string): BoardDraftEditDocument | null {
  const whitelist = entityOf(entities, key)?.whitelist ?? [];
  if (packageKey === key || whitelist.includes(packageKey)) return null;
  return keyListEditOf(key, 'whitelist', [...whitelist, packageKey]);
}

function whitelistRemovedEditOf(entities: DraftEntities, key: string, packageKey: string): BoardDraftEditDocument {
  return keyListEditOf(key, 'whitelist', (entityOf(entities, key)?.whitelist ?? []).filter((entry) => entry !== packageKey));
}

function dependencyRemovedEditOf(entities: DraftEntities, key: string, dependencyKey: string): BoardDraftEditDocument {
  return keyListEditOf(key, 'depends-on', (entityOf(entities, key)?.dependsOn ?? []).filter((entry) => entry !== dependencyKey));
}

function reachEditOf(key: string, reach: readonly string[]): BoardDraftEditDocument {
  return withinEntityEditOf(key, { target: 'reach', value: reach.length === 0 ? null : [...reach] });
}

function reachAddedEditOf(entities: DraftEntities, key: string, typedPath: string): BoardDraftEditDocument | null {
  const reach = entityOf(entities, key)?.reach ?? [];
  const path = repositoryPathOf(typedPath);
  if (path === null || reach.includes(path)) return null;
  return reachEditOf(key, [...reach, path]);
}

function reachRemovedEditOf(entities: DraftEntities, key: string, path: string): BoardDraftEditDocument {
  return reachEditOf(key, (entityOf(entities, key)?.reach ?? []).filter((entry) => entry !== path));
}

function reviewAddedEditOf(key: string): BoardDraftEditDocument {
  return withinEntityEditOf(key, { target: 'review', value: { name: DEFAULT_REVIEW_NAME, reReview: null } });
}

/** `gated` adds the root entity over the repository's root folder; `person` removes it, so the root is only implied again. */
function rootChoiceEditsOf(entities: DraftEntities, choice: RootChoice): BoardDraftEditDocument[] {
  if (rootChoiceOf(entities) === choice) return [];
  if (choice === 'gated') return [{ target: 'entity', entityKey: IMPLIED_ROOT_ENTITY_KEY, value: { kind: 'root', home: [ROOT_HOME], summary: null } }];
  const rootKey = rootEntityKeyOf(entities);
  return [definitionEditOf(rootKey, null), ...referenceEditsOf(entities, rootKey, null, [rootKey])];
}

/** Stay in single mode: every entity leaves the draft, so the forge keeps one pipeline. */
function declineEditsOf(entities: DraftEntities): BoardDraftEditDocument[] {
  return Object.keys(entities).map((key) => definitionEditOf(key, null));
}

export const EntitiesStepModel = Object.freeze({
  draftEntitiesOf,
  sentEditsOf,
  modeOf,
  rowsOf,
  rootEntityKeyOf,
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
