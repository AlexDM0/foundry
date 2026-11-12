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
  ConstitutionDraft,
  PipelineSetup,
  PipelineSetupReading,
  PipelineSetupStep,
  PipelineSetupStepState,
  ResearchFinding,
  ResearchScript,
  SetupEdit,
  SetupQuestion,
  SetupQuestionSubject,
  SourceAnnotation
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import {
  APPLY_REQUEST_REASONS,
  APPLY_REQUEST_STATES,
  FIRST_SETUP_ITEM_NUMBER,
  GATE_CANDIDACIES,
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

function stepStatesOf(value: unknown): Mapped<Record<PipelineSetupStep, PipelineSetupStepState>> {
  const record = closedRecordOf(value, 'stepStates', PIPELINE_SETUP_STEPS);
  if ('problem' in record) return record;
  const states: Partial<Record<PipelineSetupStep, PipelineSetupStepState>> = {};
  for (const step of PIPELINE_SETUP_STEPS) {
    const state = wordOf(record.value[step], `stepStates.${step}`, PIPELINE_SETUP_STEP_STATES);
    if ('problem' in state) return state;
    states[step] = state.value;
  }
  return { value: states as Record<PipelineSetupStep, PipelineSetupStepState> };
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

function constitutionOf(value: unknown): Mapped<ConstitutionDraft | null> {
  if (value === null) return { value: null };
  const record = closedRecordOf(value, 'constitution', CONSTITUTION_KEYS);
  if ('problem' in record) return record;
  const fields  = record.value;
  const sources = closedRecordOf(fields['draftedFrom'], 'constitution.draftedFrom', SOURCES_KEYS);
  if ('problem' in sources) return sources;
  const draftedFrom = fieldsOf<ConstitutionDraft['draftedFrom']>({
    contributing:     flagOf(sources.value['contributing'], 'constitution.draftedFrom.contributing'),
    research:         flagOf(sources.value['research'], 'constitution.draftedFrom.research'),
    installedDefault: flagOf(sources.value['installedDefault'], 'constitution.draftedFrom.installedDefault'),
  });
  return fieldsOf<ConstitutionDraft>({
    markdown:    textOf(fields['markdown'], 'constitution.markdown'),
    annotations: listOf(fields['annotations'], 'constitution.annotations', annotationOf),
    draftedFrom,
    baseBlob:    nullableTextOf(fields['baseBlob'], 'constitution.baseBlob'),
    revision:    countOf(fields['revision'], 'constitution.revision', 0),
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
  const ownedKeys: readonly string[] = OWNED_KEYS;
  const mapped = fieldsOf<Omit<PipelineSetup, 'formatVersion' | 'extra'>>({
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
    constitution:               constitutionOf(document['constitution']),
    draft:                      draftOf(document['draft']),
    draftRevision:              countOf(document['draftRevision'], 'draftRevision', 0),
    edits:                      listOf(document['edits'], 'edits', editOf),
    replacesUnreadablePipeline: flagOf(document['replacesUnreadablePipeline'], 'replacesUnreadablePipeline'),
    applyRequest:               applyRequestOf(document['applyRequest']),
    nextNumbers:                nextNumbersOf(document['nextNumbers']),
  });
  if ('problem' in mapped) return mapped;
  const extra = Object.entries(document).filter(([key]) => !ownedKeys.includes(key));
  return { value: { formatVersion: SETUP_FORMAT_VERSION, ...mapped.value, extra } };
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

function documentOf(setup: Readonly<PipelineSetup>): Record<string, unknown> {
  const draft = setup.draft === null ? null : JSON.parse(PipelineFile.contentsOf(setup.draft)) as unknown;
  // `fromEntries` makes every stored key an own property, so a stored `__proto__` stays data instead of setting the prototype.
  return Object.fromEntries([
    ['formatVersion', SETUP_FORMAT_VERSION],
    ['setupId', setup.setupId],
    ['mode', setup.mode],
    ['baseContentHash', setup.baseContentHash],
    ['stepStates', Object.fromEntries(PIPELINE_SETUP_STEPS.map((step) => [step, setup.stepStates[step]]))],
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

export const PipelineSetupFile = Object.freeze({ read, contentsOf });
