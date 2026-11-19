/**
 * The closed shapes of the setup payloads a session or a body sends: the pipeline agent's finding, question, constitution, proposal and
 * ready step, the field edits of a draft, and the typed edits a person sends. Each reading maps untrusted JSON to its typed value or
 * names the first field that is missing, misshapen or not in the shape. Whether the value fits the record (a step reached, a line the
 * text holds) is the Board's.
 */
import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES }    from '../../lib/tracker-model/@types/GatePhase.ts';
import {
  type AgentStepSettings,
  ENTITY_AGENT_ROLES,
  PIPELINE_AGENT_ROLES,
  PIPELINE_ENTITY_KINDS,
  type PipelineAirlock,
  type PipelineApproval,
  type PipelineConstitution,
  type PipelineGate,
  type PipelineReview,
  type PipelineStep
} from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ConstitutionSetting,
  EntityDraftEdit,
  EntityDraftField,
  PipelineDraftEdit,
  PipelineDraftField,
  PipelineEntityDefinition,
  PipelineStepsDraftEdit,
  ResearchFindingRecording,
  ResearchScript,
  SetupQuestionAsking,
  SetupQuestionStep,
  SetupQuestionSubject,
  SourceAnnotation,
  SummarisedDraftEdit
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import {
  GATE_CANDIDACIES,
  RESEARCH_FINDING_TOPICS,
  SETUP_QUESTION_STEPS,
  SETUP_QUESTION_SUBJECT_KINDS,
  SOURCE_ANNOTATION_KINDS
} from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { PipelineDraftEditUtil } from '../../lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { PathNestingUtil }       from '../../shared/utils/PathNestingUtil.ts';

export type PayloadReading<Value> =
  | { verdict: 'read'; value: Value }
  | { verdict: 'malformed'; field: string };

type PayloadRecord = Record<string, unknown>;

const FINDING_KEYS = ['topic', 'label', 'value', 'sourcePaths', 'script'] as const;
const SCRIPT_KEYS = ['name', 'run', 'meaning', 'gateCandidate', 'needs'] as const;
const QUESTION_KEYS = ['step', 'subject', 'question', 'context', 'options', 'recommended', 'multiple'] as const;
const SUBJECT_KEYS = ['kind', 'reference'] as const;
const CONSTITUTION_KEYS = ['markdown', 'sources'] as const;
const SOURCE_KEYS = ['lineText', 'occurrence', 'kind', 'path'] as const;
const PROPOSAL_KEYS = ['edits'] as const;
const PROPOSED_EDIT_KEYS = ['field', 'value', 'summary'] as const;
const READY_STEP_KEYS = ['step'] as const;
const ENTITY_DEFINITION_KEYS = ['kind', 'home', 'summary'] as const;

/** The keys of each typed edit, by its target; a key outside them is malformed. */
const TYPED_EDIT_KEYS = {
  'gate':          ['target', 'name', 'value'],
  'phase-order':   ['target', 'phase', 'names'],
  'prepare':       ['target', 'name', 'value'],
  'prepare-order': ['target', 'names'],
  'review':        ['target', 'value'],
  'constitution':  ['target', 'value'],
  'role':          ['target', 'role', 'value'],
  'airlock':       ['target', 'value'],
  'approval':      ['target', 'approval', 'value'],
  'entity':        ['target', 'entityKey', 'value'],
  'within-entity': ['target', 'entityKey', 'edit'],
  'whitelist':     ['target', 'value'],
  'reach':         ['target', 'value'],
  'depends-on':    ['target', 'value'],
  'concurrency':   ['target', 'value'],
} as const satisfies Readonly<Record<PipelineDraftEdit['target'] | EntityDraftEdit['target'], readonly string[]>>;

type TypedEditTarget = keyof typeof TYPED_EDIT_KEYS;

const TYPED_EDIT_TARGETS = Object.keys(TYPED_EDIT_KEYS) as TypedEditTarget[];

const PIPELINE_APPROVALS: readonly PipelineApproval[] = ['tickets', 'merge'];

/** An option that offers "Other" is the Bridge's own free-text answer, so the agent never sends one. */
const OTHER_OPTION_PATTERN = /^other\s*(?:$|[(:.,;-])/iu;

/** Thrown inside a reading and caught at its edge, so each check names its field in one line. */
class MalformedPayloadField extends Error {
  constructor(readonly field: string) {
    super(field);
  }
}

function malformed(field: string): never {
  throw new MalformedPayloadField(field);
}

function readingOf<Value>(read: () => Value): PayloadReading<Value> {
  try {
    return { verdict: 'read', value: read() };
  } catch (thrown) {
    if (thrown instanceof MalformedPayloadField) return { verdict: 'malformed', field: thrown.field };
    throw thrown;
  }
}

/** The record at `path`, holding no key outside `keys`; the first unknown key is named. */
function closedRecordAt(value: unknown, path: string, keys: readonly string[]): PayloadRecord {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) malformed(path === '' ? 'payload' : path);
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) malformed(fieldPathOf(path, unknownKey));
  return value;
}

function fieldPathOf(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function textAt(record: PayloadRecord, path: string, key: string): string {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  if (typeof value !== 'string' || value.trim() === '') malformed(fieldPathOf(path, key));
  return value;
}

function textListAt(record: PayloadRecord, path: string, key: string): string[] {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  if (!Array.isArray(value)) malformed(fieldPathOf(path, key));
  return value.map((item: unknown, index) => {
    if (typeof item !== 'string' || item.trim() === '') malformed(`${fieldPathOf(path, key)}[${index}]`);
    return item;
  });
}

function oneOf<Word extends string>(words: readonly Word[], record: PayloadRecord, path: string, key: string): Word {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  const word  = words.find((candidate) => candidate === value);
  if (word === undefined) malformed(fieldPathOf(path, key));
  return word;
}

/** Relative to the repository root on every host, as `pipeline.json` stores a path inside the repository. */
function pathInsideRepositoryIsWellFormed(path: string): boolean {
  return path.trim() !== '' && !PathNestingUtil.wirePathIsWellFormed(path) && PathNestingUtil.relativeWirePathStaysInside(path);
}

function sourcePathsAt(record: PayloadRecord, path: string): string[] {
  const sourcePaths = textListAt(record, path, 'sourcePaths');
  const malformedIndex = sourcePaths.findIndex((sourcePath) => !pathInsideRepositoryIsWellFormed(sourcePath));
  if (malformedIndex !== -1) malformed(`${fieldPathOf(path, 'sourcePaths')}[${malformedIndex}]`);
  return sourcePaths;
}

function scriptOf(value: unknown): ResearchScript | null {
  if (value === null || value === undefined) return null;
  const script = closedRecordAt(value, 'script', SCRIPT_KEYS);
  return {
    name:          textAt(script, 'script', 'name'),
    run:           textAt(script, 'script', 'run'),
    meaning:       textAt(script, 'script', 'meaning'),
    gateCandidate: oneOf(GATE_CANDIDACIES, script, 'script', 'gateCandidate'),
    needs:         Object.hasOwn(script, 'needs') ? textListAt(script, 'script', 'needs') : [],
  };
}

/** A finding's value is null when it is only a label; its source paths and script are optional. */
function findingReadingOf(payload: unknown): PayloadReading<ResearchFindingRecording> {
  return readingOf(() => {
    const record = closedRecordAt(payload, '', FINDING_KEYS);
    const value  = Object.hasOwn(record, 'value') ? record['value'] : null;
    if (value !== null && typeof value !== 'string') malformed('value');
    return {
      topic:       oneOf(RESEARCH_FINDING_TOPICS, record, '', 'topic'),
      label:       textAt(record, '', 'label'),
      value,
      sourcePaths: Object.hasOwn(record, 'sourcePaths') ? sourcePathsAt(record, '') : [],
      script:      scriptOf(record['script']),
    };
  });
}

function subjectOf(value: unknown): SetupQuestionSubject | null {
  if (value === null || value === undefined) return null;
  const subject = closedRecordAt(value, 'subject', SUBJECT_KEYS);
  return { kind: oneOf(SETUP_QUESTION_SUBJECT_KINDS, subject, 'subject', 'kind'), reference: textAt(subject, 'subject', 'reference') };
}

/** No option offers "Other"; how many options and recommendations a question takes is the Board's. */
function questionReadingOf(payload: unknown): PayloadReading<SetupQuestionAsking> {
  return readingOf(() => {
    const record      = closedRecordAt(payload, '', QUESTION_KEYS);
    const optionTexts = textListAt(record, '', 'options');
    const otherIndex  = optionTexts.findIndex((text) => OTHER_OPTION_PATTERN.test(text.trim()));
    if (otherIndex !== -1) malformed(`options[${otherIndex}]`);
    const multiple = Object.hasOwn(record, 'multiple') ? record['multiple'] : false;
    if (typeof multiple !== 'boolean') malformed('multiple');
    const context = Object.hasOwn(record, 'context') ? record['context'] : '';
    if (typeof context !== 'string') malformed('context');
    return {
      step:               oneOf(SETUP_QUESTION_STEPS, record, '', 'step'),
      subject:            subjectOf(record['subject']),
      question:           textAt(record, '', 'question'),
      context,
      optionTexts,
      recommendedLetters: textListAt(record, '', 'recommended'),
      multiple,
    };
  });
}

function sourceOf(value: unknown, index: number): SourceAnnotation {
  const path   = `sources[${index}]`;
  const source = closedRecordAt(value, path, SOURCE_KEYS);
  const { lineText, occurrence } = source;
  if (typeof lineText !== 'string') malformed(`${path}.lineText`);
  if (typeof occurrence !== 'number' || !Number.isInteger(occurrence)) malformed(`${path}.occurrence`);
  const sourcePath = Object.hasOwn(source, 'path') ? source['path'] : null;
  if (sourcePath !== null && (typeof sourcePath !== 'string' || !pathInsideRepositoryIsWellFormed(sourcePath))) malformed(`${path}.path`);
  return {
    lineText, occurrence, kind: oneOf(SOURCE_ANNOTATION_KINDS, source, path, 'kind'), path: sourcePath
  };
}

/** The markdown is kept byte for byte; whether each source names a line of it, once, is the Board's. */
function constitutionReadingOf(payload: unknown): PayloadReading<ConstitutionSetting> {
  return readingOf(() => {
    const record       = closedRecordAt(payload, '', CONSTITUTION_KEYS);
    const { markdown } = record;
    if (typeof markdown !== 'string') malformed('markdown');
    const sources = Object.hasOwn(record, 'sources') ? record['sources'] : [];
    if (!Array.isArray(sources)) malformed('sources');
    return { markdown, annotations: sources.map((source: unknown, index) => sourceOf(source, index)) };
  });
}

function textListOrMalformed(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) malformed(path);
  return value;
}

/** A list of non-blank texts, as a whitelist, a reach or the keys an entity depends on, or `null` to remove it. */
function textsOrNullAt(value: unknown, path: string): string[] | null {
  if (value === null) return null;
  const texts = textListOrMalformed(value, path);
  const blankIndex = texts.findIndex((text) => text.trim() === '');
  if (blankIndex !== -1) malformed(`${path}[${blankIndex}]`);
  return texts;
}

/** A whole definition or `null` for a value that must be an object, which the whole draft's validation then judges. */
function definitionOrNullAt(value: unknown, path: string): object | null {
  if (value !== null && !JsonRecordUtil.valueIsAPlainObject(value)) malformed(path);
  return value;
}

/** The edit of what a pipeline and an entity both hold; null for a field that names something else. */
function stepsEditAt(field: string, value: unknown, valuePath: string): PipelineStepsDraftEdit | null {
  const [fieldKind = '', name = ''] = field.split(/:(.*)/su);
  if (fieldKind === 'phase-order' || fieldKind === 'prepare-order') {
    const names = textListOrMalformed(value, valuePath);
    const phase = GATE_PHASES.find((candidate) => candidate === name);
    return phase === undefined ? { target: 'prepare-order', names } : { target: 'phase-order', phase, names };
  }
  if (fieldKind === 'gate') return { target: 'gate', name, value: definitionOrNullAt(value, valuePath) as PipelineGate | null };
  if (fieldKind === 'prepare') return { target: 'prepare', name, value: definitionOrNullAt(value, valuePath) as PipelineStep | null };
  if (fieldKind === 'review') return { target: 'review', value: definitionOrNullAt(value, valuePath) as PipelineReview | null };
  if (fieldKind === 'constitution') return { target: 'constitution', value: definitionOrNullAt(value, valuePath) as PipelineConstitution | null };
  return null;
}

/** An entity's kind, home folders and optional summary, or `null` to remove the entity; whether the homes fit is the draft's validation. */
function entityDefinitionAt(value: unknown, valuePath: string): PipelineEntityDefinition | null {
  if (value === null) return null;
  const record  = closedRecordAt(value, valuePath, ENTITY_DEFINITION_KEYS);
  const home    = textListAt(record, valuePath, 'home');
  const kind    = oneOf(PIPELINE_ENTITY_KINDS, record, valuePath, 'kind');
  const summary = Object.hasOwn(record, 'summary') ? { summary: textAt(record, valuePath, 'summary') } : {};
  return { kind, home, ...summary };
}

/** A field inside an entity: its steps, one of its own roles, a list of keys or paths, or a cap of at least one job. */
function entityEditAt(field: EntityDraftField, value: unknown, valuePath: string): EntityDraftEdit {
  const stepsEdit = stepsEditAt(field, value, valuePath);
  if (stepsEdit !== null) return stepsEdit;
  if (field === 'whitelist' || field === 'reach' || field === 'depends-on') {
    const texts = textsOrNullAt(value, valuePath);
    if (field === 'reach') return { target: 'reach', value: texts };
    return field === 'whitelist' ? { target: 'whitelist', value: texts } : { target: 'depends-on', value: texts };
  }
  if (field === 'concurrency') {
    if (value !== null && !(typeof value === 'number' && Number.isInteger(value) && value >= 1)) malformed(valuePath);
    return { target: 'concurrency', value };
  }
  const role = ENTITY_AGENT_ROLES.find((candidate) => field === `role:${candidate}`);
  if (role === undefined) malformed(valuePath);
  return { target: 'role', role, value: definitionOrNullAt(value, valuePath) as AgentStepSettings | null };
}

/** A field of the pipeline itself: its steps, a role, an approval or the merge train. */
function pipelineEditAt(field: PipelineDraftField, value: unknown, valuePath: string): PipelineDraftEdit {
  const stepsEdit = stepsEditAt(field, value, valuePath);
  if (stepsEdit !== null) return stepsEdit;
  const [fieldKind = '', name = ''] = field.split(/:(.*)/su);
  if (fieldKind === 'approval') {
    if (value !== null && typeof value !== 'boolean') malformed(valuePath);
    return { target: 'approval', approval: name === 'merge' ? 'merge' : 'tickets', value };
  }
  const role = PIPELINE_AGENT_ROLES.find((candidate) => candidate === name);
  if (fieldKind === 'role' && role !== undefined) return { target: 'role', role, value: definitionOrNullAt(value, valuePath) as AgentStepSettings | null };
  return { target: 'airlock', value: definitionOrNullAt(value, valuePath) as PipelineAirlock | null };
}

/**
 * The typed edit a field and its value name: a whole object or `null` for a definition, names for an order, a switch or `null` for an
 * approval, a list or a cap inside an entity. A definition is taken as sent, since the whole draft is validated once every edit is written.
 */
function draftEditAt(fieldEdit: PayloadRecord, path: string): PipelineDraftEdit {
  const { field, value } = fieldEdit;
  if (typeof field !== 'string' || !PipelineDraftEditUtil.fieldIsWellFormed(field)) malformed(`${path}.field`);
  const valuePath = `${path}.value`;
  const scope     = PipelineDraftEditUtil.entityScopeOf(field);
  if (scope === null) return pipelineEditAt(field, value, valuePath);
  const { entityKey } = scope;
  if (scope.field === null) return { target: 'entity', entityKey, value: entityDefinitionAt(value, valuePath) };
  return { target: 'within-entity', entityKey, edit: entityEditAt(scope.field, value, valuePath) };
}

/** A `{field, value}` at `edits[index]`, as `pipeline edit` writes it: a field outside the closed union is malformed. */
function draftEditReadingOf(fieldEdit: unknown, index: number): PayloadReading<PipelineDraftEdit> {
  const path = `edits[${index}]`;
  return readingOf(() => {
    if (!JsonRecordUtil.valueIsAPlainObject(fieldEdit)) malformed(path);
    return draftEditAt(fieldEdit, path);
  });
}

/** The typed edit at `path` with its target's keys alone; a target outside the union is malformed. */
function typedEditRecordAt(value: unknown, path: string): { record: PayloadRecord; target: TypedEditTarget } {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) malformed(path);
  const target = oneOf(TYPED_EDIT_TARGETS, value, path, 'target');
  return { record: closedRecordAt(value, path, TYPED_EDIT_KEYS[target]), target };
}

function valueAt(record: PayloadRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function namesAt(record: PayloadRecord, path: string): string[] {
  return textListOrMalformed(valueAt(record, 'names'), fieldPathOf(path, 'names'));
}

/** What a pipeline and an entity both hold, addressed by its target; null for any other target. */
function typedStepsEditAt(record: PayloadRecord, target: TypedEditTarget, path: string): PipelineStepsDraftEdit | null {
  const valuePath = fieldPathOf(path, 'value');
  const value     = valueAt(record, 'value');
  switch (target) {
    case 'gate':
      return { target, name: textAt(record, path, 'name'), value: definitionOrNullAt(value, valuePath) as PipelineGate | null };
    case 'prepare':
      return { target, name: textAt(record, path, 'name'), value: definitionOrNullAt(value, valuePath) as PipelineStep | null };
    case 'phase-order':
      return { target, phase: oneOf(GATE_PHASES, record, path, 'phase'), names: namesAt(record, path) };
    case 'prepare-order':
      return { target, names: namesAt(record, path) };
    case 'review':
      return { target, value: definitionOrNullAt(value, valuePath) as PipelineReview | null };
    case 'constitution':
      return { target, value: definitionOrNullAt(value, valuePath) as PipelineConstitution | null };
    default:
      return null;
  }
}

/** An edit inside one entity: its steps, one of its own roles, a list of keys or paths, or a cap of at least one job. */
function typedEntityEditAt(value: unknown, path: string): EntityDraftEdit {
  const { record, target } = typedEditRecordAt(value, path);
  const stepsEdit = typedStepsEditAt(record, target, path);
  if (stepsEdit !== null) return stepsEdit;
  const valuePath = fieldPathOf(path, 'value');
  const editValue = valueAt(record, 'value');
  switch (target) {
    case 'whitelist':
    case 'reach':
    case 'depends-on':
      return { target, value: textsOrNullAt(editValue, valuePath) };
    case 'concurrency':
      if (editValue !== null && !(typeof editValue === 'number' && Number.isInteger(editValue) && editValue >= 1)) malformed(valuePath);
      return { target, value: editValue };
    case 'role':
      return { target, role: oneOf(ENTITY_AGENT_ROLES, record, path, 'role'), value: definitionOrNullAt(editValue, valuePath) as AgentStepSettings | null };
    default:
      return malformed(fieldPathOf(path, 'target'));
  }
}

/**
 * A person's typed edit at `edits[index]`, read by its target, its keys and the shape of each value. A definition is taken as sent, as the
 * field reading takes it, since the whole draft is validated once every edit is written.
 */
function typedDraftEditReadingOf(edit: unknown, index: number): PayloadReading<PipelineDraftEdit> {
  const path = `edits[${index}]`;
  return readingOf((): PipelineDraftEdit => {
    const { record, target } = typedEditRecordAt(edit, path);
    const stepsEdit = typedStepsEditAt(record, target, path);
    if (stepsEdit !== null) return stepsEdit;
    const valuePath = fieldPathOf(path, 'value');
    const value     = valueAt(record, 'value');
    switch (target) {
      case 'role':
        return { target, role: oneOf(PIPELINE_AGENT_ROLES, record, path, 'role'), value: definitionOrNullAt(value, valuePath) as AgentStepSettings | null };
      case 'airlock':
        return { target, value: definitionOrNullAt(value, valuePath) as PipelineAirlock | null };
      case 'approval':
        if (value !== null && typeof value !== 'boolean') malformed(valuePath);
        return { target, approval: oneOf(PIPELINE_APPROVALS, record, path, 'approval'), value };
      case 'entity':
        return { target, entityKey: textAt(record, path, 'entityKey'), value: entityDefinitionAt(value, valuePath) };
      case 'within-entity':
        return { target, entityKey: textAt(record, path, 'entityKey'), edit: typedEntityEditAt(valueAt(record, 'edit'), fieldPathOf(path, 'edit')) };
      default:
        return malformed(fieldPathOf(path, 'target'));
    }
  });
}

/** The agent's edits, each with its own summary sentence; a field outside the closed union is malformed. */
function proposalReadingOf(payload: unknown): PayloadReading<SummarisedDraftEdit[]> {
  return readingOf(() => {
    const { edits } = closedRecordAt(payload, '', PROPOSAL_KEYS);
    if (!Array.isArray(edits) || edits.length === 0) malformed('edits');
    return edits.map((proposed: unknown, index) => {
      const path   = `edits[${index}]`;
      const record = closedRecordAt(proposed, path, PROPOSED_EDIT_KEYS);
      return { edit: draftEditAt(record, path), summary: textAt(record, path, 'summary') };
    });
  });
}

/** Only a step the agent works on: research, entities, constitution or design. */
function readyStepReadingOf(payload: unknown): PayloadReading<SetupQuestionStep> {
  return readingOf(() => oneOf(SETUP_QUESTION_STEPS, closedRecordAt(payload, '', READY_STEP_KEYS), '', 'step'));
}

export const SetupPayloadSchemas = Object.freeze({
  findingReadingOf,
  questionReadingOf,
  constitutionReadingOf,
  draftEditReadingOf,
  typedDraftEditReadingOf,
  proposalReadingOf,
  readyStepReadingOf,
});
