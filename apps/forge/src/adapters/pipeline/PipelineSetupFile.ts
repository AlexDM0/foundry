/**
 * `pipeline-setup.json` beside the progress file: the one open setup record, read, validated and mapped here, and written through the
 * hold. A file the read cannot map whole is `malformed` with the reason, never a throw. Keys this build does not know are kept at the top
 * level, after its own, in their stored order, so a read and a write leave the file byte-identical.
 */
import { JsonRecordUtil }                        from '../../lib/json-record/JsonRecordUtil.ts';
import type { DraftAnswer, DraftQuestionOption } from '../../lib/tracker-model/@types/Draft.ts';
import type { Pipeline }                         from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ApplyRequest,
  CheckedGate,
  ConstitutionDraft,
  PipelineCheck,
  PipelineCheckResult,
  PipelineSetup,
  PipelineSetupEntity,
  PipelineSetupReading,
  PipelineSetupStepStates,
  ResearchFinding,
  ResearchScript,
  SetupEdit,
  SetupQuestion,
  SetupQuestionSubject,
  SourceAnnotation
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { GATE_OUTCOMES }    from '../../lib/tracker-model/constants/JobStates.ts';
import {
  APPLY_REQUEST_REASONS,
  APPLY_REQUEST_STATES,
  CHECKED_GATE_VERDICTS,
  FIRST_SETUP_ITEM_NUMBER,
  GATE_CANDIDACIES,
  PIPELINE_CHECK_STATES,
  PIPELINE_SETUP_MODES,
  PIPELINE_SETUP_STEP_STATES,
  PIPELINE_SETUP_STEPS,
  RESEARCH_FINDING_TOPICS,
  SETUP_EDIT_AUTHORS,
  SETUP_QUESTION_STEPS,
  SETUP_QUESTION_SUBJECT_KINDS,
  SOURCE_ANNOTATION_KINDS
} from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { PipelineDraftEditUtil } from '../../lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { JsonTextUtil }          from '../../shared/utils/JsonTextUtil.ts';
import { storedFileTextOf }      from '../StoredFileText.ts';
import { StoredValueUtil }       from '../utils/StoredValueUtil.ts';
import { PipelineFile }          from './PipelineFile.ts';

const SETUP_FORMAT_VERSION = 1;

const OWNED_KEYS = [
  'formatVersion',
  'setupId',
  'mode',
  'baseContentHash',
  'stepStates',
  'currentStep',
  'billing',
  'agentJobId',
  'snapshotCommit',
  'readyToContinue',
  'findings',
  'questions',
  'constitution',
  'draft',
  'draftRevision',
  'edits',
  'replacesUnreadablePipeline',
  'applyRequest',
  'nextNumbers',
] as const;

/** `check` is written only once User first asks for one, and `entities` only on a forge over entities, so a record without stays as stored. */
const OPTIONAL_OWNED_KEYS = ['check', 'entities'] as const;

/** Every step has a state but `entities`, which a record has only while it walks that step. */
const ALWAYS_STATED_STEPS = PIPELINE_SETUP_STEPS.filter((step) => step !== 'entities');

const SETUP_ID_PATTERN = /^S[1-9][0-9]*$/u;
const FINDING_KEYS     = ['findingId', 'topic', 'label', 'value', 'sourcePaths', 'script', 'needsRecheck'] as const;
const SCRIPT_KEYS      = ['name', 'run', 'meaning', 'gateCandidate', 'needs'] as const;
const QUESTION_KEYS    = ['questionId', 'step', 'subject', 'question', 'context', 'options', 'recommended', 'multiple', 'answer'] as const;
const SUBJECT_KEYS     = ['kind', 'reference'] as const;
const OPTION_KEYS      = ['letter', 'text'] as const;
const CONSTITUTION_KEYS = ['markdown', 'annotations', 'draftedFrom', 'baseBlob', 'revision'] as const;
const ANNOTATION_KEYS  = ['lineText', 'occurrence', 'kind', 'path'] as const;
const SOURCES_KEYS     = ['contributing', 'research', 'installedDefault'] as const;
const EDIT_KEYS        = ['editId', 'by', 'field', 'summary', 'undone'] as const;
const APPLY_KEYS       = ['draftRevision', 'resumesBoard', 'commitJobId', 'state', 'reason'] as const;
const NEXT_NUMBER_KEYS = ['finding', 'question', 'edit'] as const;
const CHECK_KEYS       = ['draftRevision', 'gateNames', 'state', 'result', 'reason'] as const;
const CHECK_RESULT_KEYS = ['snapshotCommit', 'prepare', 'gates'] as const;
const CHECK_PREPARE_KEYS = ['failedSteps', 'output'] as const;
const CHECKED_GATE_KEYS = ['name', 'outcomes', 'durationsMilliseconds', 'verdict', 'output'] as const;
const SETUP_ENTITY_KEYS = ['agentJobId', 'findings', 'questions', 'constitution'] as const;
const OPTIONAL_SETUP_ENTITY_KEYS = ['check'] as const;

type Mapped<Value> = { value: Value } | { problem: string };

function problemOf(problem: string): { problem: string } {
  return { problem };
}

function closedRecordOf(value: unknown, path: string, keys: readonly string[]): Mapped<Record<string, unknown>> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf(`${path} is not an object`);
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) return problemOf(`${path}.${unknownKey} is not a key of ${path}; the keys are ${keys.join(', ')}`);
  const missingKey = keys.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined ? { value } : problemOf(`${path}.${missingKey} is missing`);
}

function textOf(value: unknown, path: string): Mapped<string> {
  return typeof value === 'string' ? { value } : problemOf(`${path} is not a text`);
}

function nullableTextOf(value: unknown, path: string): Mapped<string | null> {
  return value === null || typeof value === 'string' ? { value } : problemOf(`${path} is neither null nor a text`);
}

function flagOf(value: unknown, path: string): Mapped<boolean> {
  return typeof value === 'boolean' ? { value } : problemOf(`${path} is not true or false`);
}

function countOf(value: unknown, path: string, lowest: number): Mapped<number> {
  return StoredValueUtil.wholeNumberIsAtLeast(value, lowest) ? { value } : problemOf(`${path} is not a whole number of at least ${lowest}`);
}

function wordOf<Word extends string>(value: unknown, path: string, vocabulary: readonly Word[]): Mapped<Word> {
  const words: readonly unknown[] = vocabulary;
  return words.includes(value) ? { value: value as Word } : problemOf(`${path} is ${JSON.stringify(value)}, which is not one of ${vocabulary.join(', ')}`);
}

function textsOf(value: unknown, path: string): Mapped<string[]> {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? { value: [...value] } : problemOf(`${path} is not a list of texts`);
}

function listOf<Item>(value: unknown, path: string, itemOf: (item: unknown, itemPath: string) => Mapped<Item>): Mapped<Item[]> {
  if (!Array.isArray(value)) return problemOf(`${path} is not a list`);
  const items: Item[] = [];
  for (const [index, item] of value.entries()) {
    const mapped = itemOf(item, `${path}[${index}]`);
    if ('problem' in mapped) return mapped;
    items.push(mapped.value);
  }
  return { value: items };
}

/** Each mapped field of one record, in order, or the first problem. */
function fieldsOf<Fields extends object>(mappings: { [Key in keyof Fields]-?: Mapped<Fields[Key]> }): Mapped<Fields> {
  const fields: Record<string, unknown> = {};
  for (const [key, mapped] of Object.entries(mappings) as [string, Mapped<unknown>][]) {
    if ('problem' in mapped) return mapped;
    fields[key] = mapped.value;
  }
  return { value: fields as Fields };
}

function stepStatesOf(value: unknown): Mapped<PipelineSetupStepStates> {
  const stepsStated = JsonRecordUtil.valueIsAPlainObject(value) && Object.hasOwn(value, 'entities') ? PIPELINE_SETUP_STEPS : ALWAYS_STATED_STEPS;
  const record = closedRecordOf(value, 'stepStates', stepsStated);
  if ('problem' in record) return record;
  const states: Partial<PipelineSetupStepStates> = {};
  for (const step of stepsStated) {
    const state = wordOf(record.value[step], `stepStates.${step}`, PIPELINE_SETUP_STEP_STATES);
    if ('problem' in state) return state;
    states[step] = state.value;
  }
  return { value: states as PipelineSetupStepStates };
}

function scriptOf(value: unknown, path: string): Mapped<ResearchScript | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, path, SCRIPT_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<ResearchScript>({
    name:          textOf(fields['name'], `${path}.name`),
    run:           textOf(fields['run'], `${path}.run`),
    meaning:       textOf(fields['meaning'], `${path}.meaning`),
    gateCandidate: wordOf(fields['gateCandidate'], `${path}.gateCandidate`, GATE_CANDIDACIES),
    needs:         textsOf(fields['needs'], `${path}.needs`),
  });
}

function findingOf(value: unknown, path: string): Mapped<ResearchFinding> {
  const record = closedRecordOf(value, path, FINDING_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<ResearchFinding>({
    findingId:    textOf(fields['findingId'], `${path}.findingId`),
    topic:        wordOf(fields['topic'], `${path}.topic`, RESEARCH_FINDING_TOPICS),
    label:        textOf(fields['label'], `${path}.label`),
    value:        nullableTextOf(fields['value'], `${path}.value`),
    sourcePaths:  textsOf(fields['sourcePaths'], `${path}.sourcePaths`),
    script:       scriptOf(fields['script'], `${path}.script`),
    needsRecheck: flagOf(fields['needsRecheck'], `${path}.needsRecheck`),
  });
}

function subjectOf(value: unknown, path: string): Mapped<SetupQuestionSubject | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, path, SUBJECT_KEYS);
  if ('problem' in record) return record;
  return fieldsOf<SetupQuestionSubject>({
    kind:      wordOf(record.value['kind'], `${path}.kind`, SETUP_QUESTION_SUBJECT_KINDS),
    reference: textOf(record.value['reference'], `${path}.reference`),
  });
}

function optionOf(value: unknown, path: string): Mapped<DraftQuestionOption> {
  const record = closedRecordOf(value, path, OPTION_KEYS);
  if ('problem' in record) return record;
  return fieldsOf<DraftQuestionOption>({ letter: textOf(record.value['letter'], `${path}.letter`), text: textOf(record.value['text'], `${path}.text`) });
}

/** The chosen letters or the free text, never both, with when it was given. */
function answerOf(value: unknown, path: string): Mapped<DraftAnswer | null> {
  if (value === null) return { value: null };
  if (JsonRecordUtil.valueIsAPlainObject(value) && Object.hasOwn(value, 'letters')) {
    const record = closedRecordOf(value, path, ['letters', 'answeredAt']);
    if ('problem' in record) return record;
    return fieldsOf<{ letters: string[]; answeredAt: string }>({
      letters:    textsOf(record.value['letters'], `${path}.letters`),
      answeredAt: textOf(record.value['answeredAt'], `${path}.answeredAt`),
    });
  }
  const record = closedRecordOf(value, path, ['text', 'answeredAt']);
  if ('problem' in record) return record;
  return fieldsOf<{ text: string; answeredAt: string }>({
    text:       textOf(record.value['text'], `${path}.text`),
    answeredAt: textOf(record.value['answeredAt'], `${path}.answeredAt`),
  });
}

function questionOf(value: unknown, path: string): Mapped<SetupQuestion> {
  const record = closedRecordOf(value, path, QUESTION_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<SetupQuestion>({
    questionId:  textOf(fields['questionId'], `${path}.questionId`),
    step:        wordOf(fields['step'], `${path}.step`, SETUP_QUESTION_STEPS),
    subject:     subjectOf(fields['subject'], `${path}.subject`),
    question:    textOf(fields['question'], `${path}.question`),
    context:     textOf(fields['context'], `${path}.context`),
    options:     listOf(fields['options'], `${path}.options`, optionOf),
    recommended: textsOf(fields['recommended'], `${path}.recommended`),
    multiple:    flagOf(fields['multiple'], `${path}.multiple`),
    answer:      answerOf(fields['answer'], `${path}.answer`),
  });
}

function annotationOf(value: unknown, path: string): Mapped<SourceAnnotation> {
  const record = closedRecordOf(value, path, ANNOTATION_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<SourceAnnotation>({
    lineText:   textOf(fields['lineText'], `${path}.lineText`),
    occurrence: countOf(fields['occurrence'], `${path}.occurrence`, 1),
    kind:       wordOf(fields['kind'], `${path}.kind`, SOURCE_ANNOTATION_KINDS),
    path:       nullableTextOf(fields['path'], `${path}.path`),
  });
}

function constitutionOf(value: unknown, path: string): Mapped<ConstitutionDraft | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, path, CONSTITUTION_KEYS);
  if ('problem' in record) return record;
  const fields  = record.value;
  const sources = closedRecordOf(fields['draftedFrom'], `${path}.draftedFrom`, SOURCES_KEYS);
  if ('problem' in sources) return sources;
  const draftedFrom = fieldsOf<ConstitutionDraft['draftedFrom']>({
    contributing:     flagOf(sources.value['contributing'], `${path}.draftedFrom.contributing`),
    research:         flagOf(sources.value['research'], `${path}.draftedFrom.research`),
    installedDefault: flagOf(sources.value['installedDefault'], `${path}.draftedFrom.installedDefault`),
  });
  return fieldsOf<ConstitutionDraft>({
    markdown:    textOf(fields['markdown'], `${path}.markdown`),
    annotations: listOf(fields['annotations'], `${path}.annotations`, annotationOf),
    draftedFrom,
    baseBlob:    nullableTextOf(fields['baseBlob'], `${path}.baseBlob`),
    revision:    countOf(fields['revision'], `${path}.revision`, 0),
  });
}

function draftOf(value: unknown): Mapped<Pipeline | null> {
  if (value === null) return { value: null };
  const reading = PipelineFile.documentReadingOf(value);
  if (reading.verdict === 'readable') return { value: reading.pipeline };
  return problemOf(`draft is not a pipeline: ${reading.verdict === 'malformed' ? reading.reason : 'its version is older'}`);
}

function editOf(value: unknown, path: string): Mapped<SetupEdit> {
  const record = closedRecordOf(value, path, EDIT_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const { field } = fields;
  if (typeof field !== 'string' || !PipelineDraftEditUtil.fieldIsWellFormed(field)) return problemOf(`${path}.field is not a draft field`);
  return fieldsOf<SetupEdit>({
    editId:  textOf(fields['editId'], `${path}.editId`),
    by:      wordOf(fields['by'], `${path}.by`, SETUP_EDIT_AUTHORS),
    field:   { value: field },
    summary: textOf(fields['summary'], `${path}.summary`),
    undone:  flagOf(fields['undone'], `${path}.undone`),
  });
}

function applyRequestOf(value: unknown): Mapped<ApplyRequest | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, 'applyRequest', APPLY_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const reason = fields['reason'] === null ? { value: null } : wordOf(fields['reason'], 'applyRequest.reason', APPLY_REQUEST_REASONS);
  return fieldsOf<ApplyRequest>({
    draftRevision: countOf(fields['draftRevision'], 'applyRequest.draftRevision', 0),
    resumesBoard:  flagOf(fields['resumesBoard'], 'applyRequest.resumesBoard'),
    commitJobId:   nullableTextOf(fields['commitJobId'], 'applyRequest.commitJobId'),
    state:         wordOf(fields['state'], 'applyRequest.state', APPLY_REQUEST_STATES),
    reason,
  });
}

function checkedGateOf(value: unknown, path: string): Mapped<CheckedGate> {
  const record = closedRecordOf(value, path, CHECKED_GATE_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<CheckedGate>({
    name:                  textOf(fields['name'], `${path}.name`),
    outcomes:              listOf(fields['outcomes'], `${path}.outcomes`, (item, itemPath) => wordOf(item, itemPath, GATE_OUTCOMES)),
    durationsMilliseconds: listOf(fields['durationsMilliseconds'], `${path}.durationsMilliseconds`, (item, itemPath) => countOf(item, itemPath, 0)),
    verdict:               wordOf(fields['verdict'], `${path}.verdict`, CHECKED_GATE_VERDICTS),
    output:                textOf(fields['output'], `${path}.output`),
  });
}

function checkResultOf(value: unknown, path: string): Mapped<PipelineCheckResult | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, path, CHECK_RESULT_KEYS);
  if ('problem' in record) return record;
  const prepare = closedRecordOf(record.value['prepare'], `${path}.prepare`, CHECK_PREPARE_KEYS);
  if ('problem' in prepare) return prepare;
  return fieldsOf<PipelineCheckResult>({
    snapshotCommit: textOf(record.value['snapshotCommit'], `${path}.snapshotCommit`),
    prepare:        fieldsOf<PipelineCheckResult['prepare']>({
      failedSteps: listOf(prepare.value['failedSteps'], `${path}.prepare.failedSteps`, nullableTextOf),
      output:      textOf(prepare.value['output'], `${path}.prepare.output`),
    }),
    gates: listOf(record.value['gates'], `${path}.gates`, checkedGateOf),
  });
}

function checkOf(value: unknown, path: string): Mapped<PipelineCheck> {
  const record = closedRecordOf(value, path, CHECK_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  return fieldsOf<PipelineCheck>({
    draftRevision: countOf(fields['draftRevision'], `${path}.draftRevision`, 0),
    gateNames:     textsOf(fields['gateNames'], `${path}.gateNames`),
    state:         wordOf(fields['state'], `${path}.state`, PIPELINE_CHECK_STATES),
    result:        checkResultOf(fields['result'], `${path}.result`),
    reason:        nullableTextOf(fields['reason'], `${path}.reason`),
  });
}

/** One entity's part of the record, its `check` written only once set like the record's own. */
function setupEntityOf(value: unknown, path: string): Mapped<PipelineSetupEntity> {
  const hasCheck = JsonRecordUtil.valueIsAPlainObject(value) && Object.hasOwn(value, 'check');
  const record = closedRecordOf(value, path, hasCheck ? [...SETUP_ENTITY_KEYS, ...OPTIONAL_SETUP_ENTITY_KEYS] : SETUP_ENTITY_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const check  = hasCheck ? checkOf(fields['check'], `${path}.check`) : null;
  if (check !== null && 'problem' in check) return check;
  const mapped = fieldsOf<Omit<PipelineSetupEntity, 'check'>>({
    agentJobId:   nullableTextOf(fields['agentJobId'], `${path}.agentJobId`),
    findings:     listOf(fields['findings'], `${path}.findings`, findingOf),
    questions:    listOf(fields['questions'], `${path}.questions`, questionOf),
    constitution: constitutionOf(fields['constitution'], `${path}.constitution`),
  });
  if ('problem' in mapped) return mapped;
  return { value: { ...mapped.value, ...(check === null ? {} : { check: check.value }) } };
}

function setupEntitiesOf(value: unknown): Mapped<Record<string, PipelineSetupEntity>> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf('entities is not an object');
  const entries: [string, PipelineSetupEntity][] = [];
  for (const [entityKey, entityValue] of Object.entries(value)) {
    if (entityKey === '') return problemOf('entities has an empty entity key');
    const entity = setupEntityOf(entityValue, `entities.${entityKey}`);
    if ('problem' in entity) return entity;
    entries.push([entityKey, entity.value]);
  }
  // `fromEntries` keeps a stored `__proto__` key as data instead of setting the prototype.
  return { value: Object.fromEntries(entries) };
}

function nextNumbersOf(value: unknown): Mapped<PipelineSetup['nextNumbers']> {
  const record = closedRecordOf(value, 'nextNumbers', NEXT_NUMBER_KEYS);
  if ('problem' in record) return record;
  return fieldsOf<PipelineSetup['nextNumbers']>({
    finding:  countOf(record.value['finding'], 'nextNumbers.finding', FIRST_SETUP_ITEM_NUMBER),
    question: countOf(record.value['question'], 'nextNumbers.question', FIRST_SETUP_ITEM_NUMBER),
    edit:     countOf(record.value['edit'], 'nextNumbers.edit', FIRST_SETUP_ITEM_NUMBER),
  });
}

function billingOf(value: unknown): Mapped<PipelineSetup['billing']> {
  const billing = PipelineFile.billingOf(value);
  if ('problem' in billing) return billing;
  return billing.value === undefined ? problemOf('billing is missing') : { value: billing.value };
}

function setupIdOf(value: unknown): Mapped<string> {
  if (typeof value === 'string' && SETUP_ID_PATTERN.test(value)) return { value };
  return problemOf(`setupId is ${JSON.stringify(value) ?? 'missing'}, and it has to be a setup id such as S1`);
}

function setupOf(document: Record<string, unknown>): Mapped<PipelineSetup> {
  const missingKey = OWNED_KEYS.find((key) => !Object.hasOwn(document, key));
  if (missingKey !== undefined) return problemOf(`${missingKey} is missing`);
  const ownedKeys: readonly string[] = [...OWNED_KEYS, ...OPTIONAL_OWNED_KEYS];
  const check = Object.hasOwn(document, 'check') ? checkOf(document['check'], 'check') : null;
  if (check !== null && 'problem' in check) return check;
  const entities = Object.hasOwn(document, 'entities') ? setupEntitiesOf(document['entities']) : null;
  if (entities !== null && 'problem' in entities) return entities;
  const mapped = fieldsOf<Omit<PipelineSetup, 'formatVersion' | 'extra' | 'check' | 'entities'>>({
    setupId:                    setupIdOf(document['setupId']),
    mode:                       wordOf(document['mode'], 'mode', PIPELINE_SETUP_MODES),
    baseContentHash:            nullableTextOf(document['baseContentHash'], 'baseContentHash'),
    stepStates:                 stepStatesOf(document['stepStates']),
    currentStep:                wordOf(document['currentStep'], 'currentStep', PIPELINE_SETUP_STEPS),
    billing:                    billingOf(document['billing']),
    agentJobId:                 nullableTextOf(document['agentJobId'], 'agentJobId'),
    snapshotCommit:             nullableTextOf(document['snapshotCommit'], 'snapshotCommit'),
    readyToContinue:            listOf(document['readyToContinue'], 'readyToContinue', (item, path) => wordOf(item, path, PIPELINE_SETUP_STEPS)),
    findings:                   listOf(document['findings'], 'findings', findingOf),
    questions:                  listOf(document['questions'], 'questions', questionOf),
    constitution:               constitutionOf(document['constitution'], 'constitution'),
    draft:                      draftOf(document['draft']),
    draftRevision:              countOf(document['draftRevision'], 'draftRevision', 0),
    edits:                      listOf(document['edits'], 'edits', editOf),
    replacesUnreadablePipeline: flagOf(document['replacesUnreadablePipeline'], 'replacesUnreadablePipeline'),
    applyRequest:               applyRequestOf(document['applyRequest']),
    nextNumbers:                nextNumbersOf(document['nextNumbers']),
  });
  if ('problem' in mapped) return mapped;
  const extra = Object.entries(document).filter(([key]) => !ownedKeys.includes(key));
  return {
    value: {
      formatVersion: SETUP_FORMAT_VERSION,
      ...mapped.value,
      ...(check === null ? {} : { check: check.value }),
      ...(entities === null ? {} : { entities: entities.value }),
      extra
    }
  };
}

function documentReadingOf(document: unknown): PipelineSetupReading {
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', reason: 'the document is not a JSON object' };
  const { formatVersion } = document;
  if (formatVersion !== SETUP_FORMAT_VERSION) {
    return { verdict: 'malformed', reason: `formatVersion is ${JSON.stringify(formatVersion) ?? 'missing'}, and this build reads ${SETUP_FORMAT_VERSION}` };
  }
  const setup = setupOf(document);
  return 'problem' in setup ? { verdict: 'malformed', reason: setup.problem } : { verdict: 'readable', setup: setup.value };
}

function read(setupFilePath: string): PipelineSetupReading {
  const storedText = storedFileTextOf(setupFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', reason: storedText.reason };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', reason: parsedJson.problem };
  return documentReadingOf(parsedJson.value);
}

function setupEntitiesDocumentOf(entities: Readonly<Record<string, PipelineSetupEntity>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entities).map(([entityKey, entity]) => [entityKey, Object.fromEntries([
    ['agentJobId', entity.agentJobId],
    ['findings', entity.findings],
    ['questions', entity.questions],
    ['constitution', entity.constitution],
    ...(entity.check === undefined ? [] : [['check', entity.check]]),
  ])]));
}

function documentOf(setup: Readonly<PipelineSetup>): Record<string, unknown> {
  const draft = setup.draft === null ? null : JSON.parse(PipelineFile.contentsOf(setup.draft)) as unknown;
  // `fromEntries` makes every stored key an own property, so a stored `__proto__` stays data instead of setting the prototype.
  return Object.fromEntries([
    ['formatVersion', SETUP_FORMAT_VERSION],
    ['setupId', setup.setupId],
    ['mode', setup.mode],
    ['baseContentHash', setup.baseContentHash],
    ['stepStates', Object.fromEntries(PIPELINE_SETUP_STEPS.flatMap((step) => {
      const state = setup.stepStates[step];
      return state === undefined ? [] : [[step, state]];
    }))],
    ['currentStep', setup.currentStep],
    ['billing', setup.billing],
    ['agentJobId', setup.agentJobId],
    ['snapshotCommit', setup.snapshotCommit],
    ['readyToContinue', setup.readyToContinue],
    ['findings', setup.findings],
    ['questions', setup.questions],
    ['constitution', setup.constitution],
    ['draft', draft],
    ['draftRevision', setup.draftRevision],
    ['edits', setup.edits],
    ['replacesUnreadablePipeline', setup.replacesUnreadablePipeline],
    ['applyRequest', setup.applyRequest],
    ...(setup.check === undefined ? [] : [['check', setup.check]]),
    ...(setup.entities === undefined ? [] : [['entities', setupEntitiesDocumentOf(setup.entities)]]),
    ['nextNumbers', setup.nextNumbers],
    ...setup.extra,
  ]);
}

/**
 * Mapped through the read, so every nested record is written in the order the read lists its keys, whatever order a move built it in;
 * the record's own keys come first, then every key this build does not know.
 */
function contentsOf(setup: Readonly<PipelineSetup>): string {
  const reading = documentReadingOf(JSON.parse(JSON.stringify(documentOf(setup))));
  return JsonTextUtil.storedFileTextOf(documentOf(reading.verdict === 'readable' ? reading.setup : setup));
}

export const PipelineSetupFile = Object.freeze({ read, contentsOf, annotationOf });
