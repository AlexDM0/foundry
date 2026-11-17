/**
 * The state of one entity's constitution, pure: drafted in this setup, adopted as its own folder holds it, the installed default, not
 * started yet, or none for a root kept for a person. A draft of the entity's own wins; an entity that names a file keeps it byte for byte;
 * a root without gates is kept for a person; any other entity reads the installed default, which a first setup calls not started until
 * the constitution step is done. No state blocks Apply.
 */
import type { EntityKey, PipelineEntity }             from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup, PipelineSetupStepState } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { EntityRailMarkTexts }                   from './EntityRailModel.ts';

export type ConstitutionState = 'adopted' | 'drafted' | 'default' | 'not-started' | 'kept-for-a-person';

/** What the state reads of an entity. */
export type ConstitutionStateEntity = Pick<PipelineEntity, 'kind' | 'gates' | 'constitution'>;

/** What the state reads of the open record: its mode, its constitution step and each entity's draft; `null` with no record open. */
export interface ConstitutionStateRecord {
  readonly mode:       PipelineSetup['mode'];
  readonly stepStates: { readonly constitution: PipelineSetupStepState };
  readonly entities?:  Readonly<Record<EntityKey, { readonly constitution: unknown }>>;
}

/** One entity's key, entity and constitution state. */
export interface EntityConstitution<Entity extends ConstitutionStateEntity> {
  readonly entityKey: EntityKey;
  readonly entity:    Entity;
  readonly state:     ConstitutionState;
}

export interface ConstitutionStateMeaning {
  readonly state:   ConstitutionState;
  readonly text:    string;
  readonly meaning: string;
}

/** The four states an entity's document can be in, in the order the legend lists them; the root kept for a person has none. */
export const CONSTITUTION_STATE_MEANINGS: readonly ConstitutionStateMeaning[] = Object.freeze([
  { state: 'adopted', text: 'Adopted', meaning: 'kept from the repository, byte for byte' },
  { state: 'drafted', text: 'Drafted', meaning: 'written here with the agent' },
  { state: 'default', text: 'Default', meaning: 'the installed generic rules' },
  { state: 'not-started', text: 'Not started', meaning: 'gets the default if left' },
]);

const KEPT_FOR_A_PERSON_MEANING: ConstitutionStateMeaning = Object.freeze({
  state:   'kept-for-a-person',
  text:    'For a person',
  meaning: 'no constitution: agents change it only through an app’s reach',
});

function meaningOf(state: ConstitutionState): ConstitutionStateMeaning {
  return CONSTITUTION_STATE_MEANINGS.find((candidate) => candidate.state === state) ?? KEPT_FOR_A_PERSON_MEANING;
}

function entityHasADraft(record: ConstitutionStateRecord | null, entityKey: EntityKey): boolean {
  const parts = record?.entities ?? {};
  const part = Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined;
  return (part?.constitution ?? null) !== null;
}

function stateOf(record: ConstitutionStateRecord | null, entityKey: EntityKey, entity: ConstitutionStateEntity): ConstitutionState {
  if (entityHasADraft(record, entityKey)) return 'drafted';
  if (entity.constitution !== undefined) return 'adopted';
  if (entity.kind === 'root' && entity.gates.length === 0) return 'kept-for-a-person';
  const constitutionStepIsOpen = record?.mode === 'setup' && record.stepStates.constitution !== 'done';
  return constitutionStepIsOpen ? 'not-started' : 'default';
}

function textOf(state: ConstitutionState): string {
  return meaningOf(state).text;
}

/** The tag's title: "Adopted: kept from the repository, byte for byte". */
function titleOf(state: ConstitutionState): string {
  const { text, meaning } = meaningOf(state);
  return `${text}: ${meaning}`;
}

/** "1 entity has the default constitution"; `null` while none has. */
function attentionTextOf(states: readonly ConstitutionState[]): string | null {
  const defaultCount = states.filter((state) => state === 'default').length;
  if (defaultCount === 0) return null;
  return `${defaultCount} ${defaultCount === 1 ? 'entity has' : 'entities have'} the default constitution`;
}

/** Each entity's state, in the order of the entities given. */
function entityConstitutionsOf<Entity extends ConstitutionStateEntity>(
  record: ConstitutionStateRecord | null,
  entities: Readonly<Record<EntityKey, Entity>>,
): EntityConstitution<Entity>[] {
  return Object.entries(entities).map(([entityKey, entity]) => ({ entityKey, entity, state: stateOf(record, entityKey, entity) }));
}

/** The state the list gives the entity; the default for an entity it does not list. */
function stateInListOf(constitutions: readonly EntityConstitution<ConstitutionStateEntity>[], entityKey: EntityKey): ConstitutionState {
  return constitutions.find((candidate) => candidate.entityKey === entityKey)?.state ?? 'default';
}

/** The rail's word for each entity's state and its attention line. */
function railMarkTextsOf(constitutions: readonly EntityConstitution<ConstitutionStateEntity>[]): EntityRailMarkTexts {
  return {
    textOf:        (entityKey) => textOf(stateInListOf(constitutions, entityKey)),
    attentionText: attentionTextOf(constitutions.map((constitution) => constitution.state)),
  };
}

export const ConstitutionStateTagModel = Object.freeze({
  stateOf,
  entityConstitutionsOf,
  stateInListOf,
  railMarkTextsOf,
  textOf,
  titleOf,
  attentionTextOf,
});
