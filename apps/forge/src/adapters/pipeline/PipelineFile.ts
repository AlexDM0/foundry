/**
 * `pipeline.json` beside the progress file: the board's pipeline, read, validated and mapped here, and written through the hold. A file
 * that cannot be read whole is `malformed` with the reason, and a file an earlier release wrote is `older`, never a throw.
 */
import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';
import type { GatePhase } from '../../lib/tracker-model/@types/GatePhase.ts';
import {
  type AgentStepSettings,
  type ConditionalReReview,
  type InstructionEntry,
  PIPELINE_FORMAT_VERSION,
  type Pipeline,
  type PipelineAgentRole,
  type PipelineAirlock,
  type PipelineApproval,
  type PipelineBilling,
  type PipelineConstitution,
  type PipelineGate,
  type PipelinePhaseOrders,
  type PipelineReview,
  type PipelineStep
} from '../../lib/tracker-model/@types/Pipeline.ts';
import { RE_REVIEW_THRESHOLD_STEP_LINES } from '../../lib/tracker-model/constants/PipelineDefaults.ts';
import { VocabularyUtil }                 from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import { JsonTextUtil }                   from '../../shared/utils/JsonTextUtil.ts';
import { PathNestingUtil }                from '../../shared/utils/PathNestingUtil.ts';
import { storedFileTextOf }               from '../StoredFileText.ts';
import { StoredValueUtil }                from '../utils/StoredValueUtil.ts';

export type PipelineReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; pipeline: Pipeline }
  | { verdict: 'older' }
  | { verdict: 'malformed'; reason: string };

/** A stored file the board cannot use, which nothing writes over. */
export type UnreadablePipelineReading = Extract<PipelineReading, { verdict: 'older' | 'malformed' }>;

const PIPELINE_KEYS = ['version', 'prepare', 'gates', 'phases', 'review', 'airlock', 'constitution', 'agents', 'approvals', 'billing'] as const;
const REQUIRED_KEYS = ['version', 'prepare', 'gates', 'phases'] as const;
const BILLING_KEYS         = ['mode', 'maxBudgetUsd'] as const;
const APPROVALS            = ['tickets', 'merge'] as const satisfies readonly PipelineApproval[];
const STEP_KEYS            = ['name', 'run'] as const;
const GATE_KEYS            = ['name', 'run', 'fix', 'in', 'definedBy', 'network', 'writes', 'overseerOnly'] as const;
const PHASE_KEYS           = ['build', 'review', 'merge'] as const satisfies readonly GatePhase[];
const REVIEW_KEYS          = ['name', 'reReview'] as const;
const AIRLOCK_KEYS         = ['reReview'] as const;
const RE_REVIEW_KEYS       = ['thresholdLines'] as const;
const CONSTITUTION_KEYS    = ['path'] as const;
const AGENT_SETTING_KEYS   = ['model', 'effort', 'instructions'] as const;
const INSTRUCTION_KINDS    = ['constitution', 'default-brief', 'file'] as const satisfies readonly InstructionEntry['kind'][];
const INSTRUCTION_KEYS_OF_KIND = {
  'constitution':  ['kind'],
  'default-brief': ['kind', 'role'],
  'file':          ['kind', 'path'],
} as const satisfies Record<InstructionEntry['kind'], readonly string[]>;
const AGENT_ROLES = [
  'productOwner',
  'builder',
  'reviewer',
  'reReviewer',
  'conflictReReviewer',
  'pipelineAgent',
  'assistant'
] as const satisfies readonly PipelineAgentRole[];

type Mapped<Value> = { value: Value } | { problem: string };

function problemOf(problem: string): { problem: string } {
  return { problem };
}

function unknownKeyProblemOf(record: Record<string, unknown>, knownKeys: readonly string[], path: string): string | null {
  const unknownKey = Object.keys(record).find((key) => !knownKeys.includes(key));
  return unknownKey === undefined ? null : `${path}${JSON.stringify(unknownKey)} is not a pipeline key; the keys are ${knownKeys.join(', ')}`;
}

function textIsPresent(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function textListOf(value: unknown, path: string): Mapped<string[] | undefined> {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value) || !value.every(textIsPresent)) return problemOf(`${path} is not a list of non-blank texts`);
  return { value: [...value] };
}

function optionalTextOf(value: unknown, path: string): Mapped<string | undefined> {
  if (value === undefined) return { value: undefined };
  return textIsPresent(value) ? { value } : problemOf(`${path} is present and is not a non-blank text`);
}

function closedRecordOf(value: unknown, path: string, knownKeys: readonly string[]): Mapped<Record<string, unknown>> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf(`${path} is not an object`);
  const unknownKeyProblem = unknownKeyProblemOf(value, knownKeys, `${path}.`);
  return unknownKeyProblem === null ? { value } : problemOf(unknownKeyProblem);
}

function namedRecordOf(value: unknown, path: string, knownKeys: readonly string[]): Mapped<Record<string, unknown>> {
  const record = closedRecordOf(value, path, knownKeys);
  if ('problem' in record) return record;
  if (!textIsPresent(record.value['name'])) return problemOf(`${path} has no name`);
  return record;
}

/** Relative to the repository root on every host: no root, drive, `~/` or `..` segment. */
function pathInsideRepositoryOf(value: unknown, path: string): Mapped<string> {
  if (!textIsPresent(value)) return problemOf(`${path} is not a non-blank text`);
  if (PathNestingUtil.wirePathIsWellFormed(value) || !PathNestingUtil.relativeWirePathStaysInside(value)) {
    return problemOf(`${path} is not a path inside the repository`);
  }
  return { value };
}

function stepOf(value: unknown, path: string): Mapped<PipelineStep> {
  const record = namedRecordOf(value, path, STEP_KEYS);
  if ('problem' in record) return record;
  const { name, run } = record.value;
  if (!textIsPresent(run)) return problemOf(`${path} has no run line`);
  return { value: { name: String(name), run } };
}

function gateOf(value: unknown, path: string): Mapped<PipelineGate> {
  const record = namedRecordOf(value, path, GATE_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const { name, run, overseerOnly } = fields;
  if (!textIsPresent(run)) return problemOf(`${path} has no run line`);
  if (overseerOnly !== undefined && overseerOnly !== true) return problemOf(`${path}.overseerOnly is present and is not true`);
  const gate: PipelineGate = { name: String(name), run };
  for (const key of ['fix', 'in'] as const) {
    const text = optionalTextOf(fields[key], `${path}.${key}`);
    if ('problem' in text) return text;
    if (text.value !== undefined) gate[key] = text.value;
  }
  for (const key of ['definedBy', 'network', 'writes'] as const) {
    const texts = textListOf(fields[key], `${path}.${key}`);
    if ('problem' in texts) return texts;
    if (texts.value !== undefined) gate[key] = texts.value;
  }
  // A relative folder would resolve against wherever the Overseer runs.
  if (gate.writes !== undefined && !gate.writes.every(PathNestingUtil.wirePathIsWellFormed)) return problemOf(`${path}.writes holds a folder that is not absolute or ~/`);
  if (overseerOnly === true) gate.overseerOnly = true;
  return { value: gate };
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

function namedListOf<Item extends { name: string }>(
  value: unknown,
  path: string,
  itemOf: (item: unknown, itemPath: string) => Mapped<Item>,
): Mapped<Item[]> {
  const items = listOf(value, path, itemOf);
  if ('problem' in items) return items;
  const names    = items.value.map((item) => item.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  return repeated === undefined ? items : problemOf(`${path} names ${JSON.stringify(repeated)} twice`);
}

function phasesOf(value: unknown, gates: readonly PipelineGate[]): Mapped<PipelinePhaseOrders> {
  const record = closedRecordOf(value, 'phases', PHASE_KEYS);
  if ('problem' in record) return record;
  const gateNames = gates.map((gate) => gate.name);
  const phases: PipelinePhaseOrders = { build: [], review: [], merge: [] };
  for (const phase of PHASE_KEYS) {
    const names = record.value[phase];
    if (names === undefined) return problemOf(`phases.${phase} is missing`);
    if (!Array.isArray(names) || !names.every(textIsPresent)) return problemOf(`phases.${phase} is not a list of gate names`);
    const unknownName = names.find((name) => !gateNames.includes(name));
    if (unknownName !== undefined) return problemOf(`phases.${phase} names ${JSON.stringify(unknownName)}, which is not a gate`);
    const repeated = names.find((name, index) => names.indexOf(name) !== index);
    if (repeated !== undefined) return problemOf(`phases.${phase} names ${JSON.stringify(repeated)} twice`);
    phases[phase] = [...names];
  }
  const gateInNoPhase = gateNames.find((name) => PHASE_KEYS.every((phase) => !phases[phase].includes(name)));
  return gateInNoPhase === undefined ? { value: phases } : problemOf(`the gate ${JSON.stringify(gateInNoPhase)} runs in no phase`);
}

function reReviewOf(value: unknown, path: string): Mapped<ConditionalReReview | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, path, RE_REVIEW_KEYS);
  if ('problem' in record) return record;
  const { thresholdLines } = record.value;
  if (typeof thresholdLines !== 'number' || !Number.isInteger(thresholdLines) || thresholdLines < RE_REVIEW_THRESHOLD_STEP_LINES) {
    return problemOf(`${path}.thresholdLines is not a whole number of at least ${RE_REVIEW_THRESHOLD_STEP_LINES}`);
  }
  return { value: { thresholdLines } };
}

function reviewOf(value: unknown): Mapped<PipelineReview | undefined> {
  if (value === undefined) return { value: undefined };
  const record = namedRecordOf(value, 'review', REVIEW_KEYS);
  if ('problem' in record) return record;
  const reReview = reReviewOf(record.value['reReview'], 'review.reReview');
  if ('problem' in reReview) return reReview;
  return { value: { name: String(record.value['name']), ...(reReview.value === undefined ? {} : { reReview: reReview.value }) } };
}

function airlockOf(value: unknown): Mapped<PipelineAirlock | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, 'airlock', AIRLOCK_KEYS);
  if ('problem' in record) return record;
  const reReview = reReviewOf(record.value['reReview'], 'airlock.reReview');
  if ('problem' in reReview) return reReview;
  return { value: reReview.value === undefined ? {} : { reReview: reReview.value } };
}

function constitutionOf(value: unknown): Mapped<PipelineConstitution | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, 'constitution', CONSTITUTION_KEYS);
  if ('problem' in record) return record;
  const path = pathInsideRepositoryOf(record.value['path'], 'constitution.path');
  return 'problem' in path ? path : { value: { path: path.value } };
}

function roleIsKnown(value: unknown): value is PipelineAgentRole {
  return (AGENT_ROLES as readonly unknown[]).includes(value);
}

function instructionKindIsKnown(value: unknown): value is InstructionEntry['kind'] {
  return (INSTRUCTION_KINDS as readonly unknown[]).includes(value);
}

function instructionEntryOf(value: unknown, path: string): Mapped<InstructionEntry> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf(`${path} is not an object`);
  const entryKind = value['kind'];
  if (!instructionKindIsKnown(entryKind)) return problemOf(`${path}.kind is not one of ${INSTRUCTION_KINDS.join(', ')}`);
  const record = closedRecordOf(value, path, INSTRUCTION_KEYS_OF_KIND[entryKind]);
  if ('problem' in record) return record;
  if (entryKind === 'constitution') return { value: { kind: entryKind } };
  if (entryKind === 'default-brief') {
    const { role } = record.value;
    return roleIsKnown(role) ? { value: { kind: entryKind, role } } : problemOf(`${path}.role is not one of ${AGENT_ROLES.join(', ')}`);
  }
  const filePath = pathInsideRepositoryOf(record.value['path'], `${path}.path`);
  return 'problem' in filePath ? filePath : { value: { kind: entryKind, path: filePath.value } };
}

/** The constitution once, each default brief once and each file once: a list read top to bottom never repeats a text. */
function instructionsOf(value: unknown, path: string): Mapped<InstructionEntry[] | undefined> {
  if (value === undefined) return { value: undefined };
  const entries = listOf(value, path, instructionEntryOf);
  if ('problem' in entries) return entries;
  const identities = entries.value.map((entry) => JSON.stringify(entry));
  const repeated   = entries.value.find((_entry, index) => identities.indexOf(identities[index] ?? '') !== index);
  return repeated === undefined ? entries : problemOf(`${path} lists ${JSON.stringify(repeated)} twice`);
}

function agentSettingsOf(value: unknown, path: string): Mapped<AgentStepSettings> {
  const record = closedRecordOf(value, path, AGENT_SETTING_KEYS);
  if ('problem' in record) return record;
  const { model, effort } = record.value;
  if (model !== undefined && !(typeof model === 'string' && VocabularyUtil.agentModelIsKnown(model))) return problemOf(`${path}.model is not a known model`);
  if (effort !== undefined && !(typeof effort === 'string' && VocabularyUtil.agentEffortIsKnown(effort))) return problemOf(`${path}.effort is not a known effort`);
  const instructions = instructionsOf(record.value['instructions'], `${path}.instructions`);
  if ('problem' in instructions) return instructions;
  return {
    value: {
      ...(model === undefined ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
      ...(instructions.value === undefined ? {} : { instructions: instructions.value }),
    },
  };
}

function agentsOf(value: unknown): Mapped<Pipeline['agents']> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, 'agents', AGENT_ROLES);
  if ('problem' in record) return record;
  const agents: Partial<Record<PipelineAgentRole, AgentStepSettings>> = {};
  for (const role of AGENT_ROLES) {
    if (record.value[role] === undefined) continue;
    const settings = agentSettingsOf(record.value[role], `agents.${role}`);
    if ('problem' in settings) return settings;
    agents[role] = settings.value;
  }
  return { value: agents };
}

function approvalsOf(value: unknown): Mapped<Pipeline['approvals']> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, 'approvals', APPROVALS);
  if ('problem' in record) return record;
  const approvals: Partial<Record<PipelineApproval, boolean>> = {};
  for (const approval of APPROVALS) {
    const switchValue = record.value[approval];
    if (switchValue === undefined) continue;
    if (typeof switchValue !== 'boolean') return problemOf(`approvals.${approval} is not true or false`);
    approvals[approval] = switchValue;
  }
  return { value: approvals };
}

/** Only a mode and a budget: a key, a key helper or any command stays out of the file, so no stored file can hold a credential. */
function billingOf(value: unknown): Mapped<PipelineBilling | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, 'billing', BILLING_KEYS);
  if ('problem' in record) return record;
  const { mode, maxBudgetUsd } = record.value;
  if (mode === 'subscription') {
    return maxBudgetUsd === undefined ? { value: { mode } } : problemOf('billing.maxBudgetUsd is present with mode subscription');
  }
  if (mode !== 'api') return problemOf('billing.mode is neither subscription nor api');
  if (maxBudgetUsd === undefined) return { value: { mode } };
  if (typeof maxBudgetUsd !== 'number' || !Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) return problemOf('billing.maxBudgetUsd is not a positive number');
  return { value: { mode, maxBudgetUsd } };
}

function sharedNameProblemOf(prepare: readonly PipelineStep[], gates: readonly PipelineGate[]): { problem: string } | null {
  const shared = prepare.find((step) => gates.some((gate) => gate.name === step.name));
  return shared === undefined ? null : problemOf(`${JSON.stringify(shared.name)} names both a prepare step and a gate`);
}

function pipelineOf(document: Record<string, unknown>): Mapped<Pipeline> {
  const unknownKeyProblem = unknownKeyProblemOf(document, PIPELINE_KEYS, '');
  if (unknownKeyProblem !== null) return problemOf(unknownKeyProblem);
  const missingKey = REQUIRED_KEYS.find((key) => document[key] === undefined);
  if (missingKey !== undefined) return problemOf(`${missingKey} is missing`);
  const prepare = namedListOf(document['prepare'], 'prepare', stepOf);
  if ('problem' in prepare) return prepare;
  const gates = namedListOf(document['gates'], 'gates', gateOf);
  if ('problem' in gates) return gates;
  const sharedNameProblem = sharedNameProblemOf(prepare.value, gates.value);
  if (sharedNameProblem !== null) return sharedNameProblem;
  const phases       = phasesOf(document['phases'], gates.value);
  const review       = reviewOf(document['review']);
  const airlock      = airlockOf(document['airlock']);
  const constitution = constitutionOf(document['constitution']);
  const agents       = agentsOf(document['agents']);
  const approvals    = approvalsOf(document['approvals']);
  const billing      = billingOf(document['billing']);
  if ('problem' in phases) return phases;
  if ('problem' in review) return review;
  if ('problem' in airlock) return airlock;
  if ('problem' in constitution) return constitution;
  if ('problem' in agents) return agents;
  if ('problem' in approvals) return approvals;
  if ('problem' in billing) return billing;
  return {
    value: {
      version: PIPELINE_FORMAT_VERSION,
      prepare: prepare.value,
      gates:   gates.value,
      phases:  phases.value,
      ...(review.value === undefined ? {} : { review: review.value }),
      ...(airlock.value === undefined ? {} : { airlock: airlock.value }),
      ...(constitution.value === undefined ? {} : { constitution: constitution.value }),
      ...(agents.value === undefined ? {} : { agents: agents.value }),
      ...(approvals.value === undefined ? {} : { approvals: approvals.value }),
      ...(billing.value === undefined ? {} : { billing: billing.value }),
    },
  };
}

/** No release converts an earlier file, so one with no version or a lower one is `older`, never mapped; a higher one is malformed. */
function documentReadingOf(document: unknown): PipelineReading {
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', reason: 'the document is not a JSON object' };
  const { version } = document;
  if (version === undefined) return { verdict: 'older' };
  if (typeof version !== 'number' || !Number.isInteger(version)) return { verdict: 'malformed', reason: 'version is not a whole number' };
  if (version < PIPELINE_FORMAT_VERSION) return { verdict: 'older' };
  if (version > PIPELINE_FORMAT_VERSION) {
    return { verdict: 'malformed', reason: `version is ${version}, a newer format than version ${PIPELINE_FORMAT_VERSION}, which this build reads (newer-format)` };
  }
  const pipeline = pipelineOf(document);
  return 'problem' in pipeline ? { verdict: 'malformed', reason: pipeline.problem } : { verdict: 'readable', pipeline: pipeline.value };
}

function read(pipelineFilePath: string): PipelineReading {
  const storedText = storedFileTextOf(pipelineFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', reason: storedText.reason };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', reason: parsedJson.problem };
  return documentReadingOf(parsedJson.value);
}

/**
 * Mapped through the read, so `version` is written first and every key in the order the read lists them; the required keys are always
 * written, so an empty gate list stays the deliberate "no gates" it was set as, and an optional key only once set.
 */
function contentsOf(pipeline: Readonly<Pipeline>): string {
  const reading = documentReadingOf(JSON.parse(JSON.stringify(pipeline)));
  return JsonTextUtil.storedFileTextOf(reading.verdict === 'readable' ? reading.pipeline : pipeline);
}

export const PipelineFile = Object.freeze({
  read, contentsOf, documentReadingOf, billingOf
});
