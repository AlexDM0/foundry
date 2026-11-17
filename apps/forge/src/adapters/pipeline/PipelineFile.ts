/**
 * `pipeline.json` beside the progress file: the board's pipeline, read, validated and mapped here, and written through the hold, in version
 * 2, 3 or 4. A file that cannot be read whole is `malformed` with the reason, and one below version 2 is `older`, never a throw. Version 4
 * holds entities, which this build maps and validates in full and then refuses as not yet supported.
 */
import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';
import type { GatePhase } from '../../lib/tracker-model/@types/GatePhase.ts';
import {
  type AgentStepSettings,
  type ConditionalReReview,
  EARLIEST_PIPELINE_FORMAT_VERSION,
  type EntityAgentRole,
  type EntityKey,
  ENTITIES_PIPELINE_FORMAT_VERSION,
  type InstructionEntry,
  PIPELINE_FORMAT_VERSION,
  type Pipeline,
  type PipelineAgentRole,
  type PipelineAirlock,
  type PipelineApproval,
  type PipelineBilling,
  type PipelineConstitution,
  type PipelineEntity,
  type PipelineEntityKind,
  type PipelineFormatVersion,
  type PipelineGate,
  type PipelinePhaseOrders,
  type PipelineReview,
  type PipelineStep
} from '../../lib/tracker-model/@types/Pipeline.ts';
import { RE_REVIEW_THRESHOLD_STEP_LINES }           from '../../lib/tracker-model/constants/PipelineDefaults.ts';
import { EntityValidationUtil, type EntityRefusal } from '../../lib/tracker-model/utils/EntityValidationUtil.ts';
import { PipelineUtil }                             from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { VocabularyUtil }                           from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import { JsonTextUtil }                             from '../../shared/utils/JsonTextUtil.ts';
import { PathNestingUtil }                          from '../../shared/utils/PathNestingUtil.ts';
import { storedFileTextOf }                         from '../StoredFileText.ts';
import { StoredValueUtil }                          from '../utils/StoredValueUtil.ts';

/** Entities that are sound as stored but that this build or this tracker cannot hold, which a refusal names instead of a repair. */
export type UnsupportedEntities = { kind: 'entities-not-supported' } | { kind: 'entities-in-a-folder'; projectPrefix: string };

export type PipelineReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; pipeline: Pipeline }
  | { verdict: 'older' }
  | { verdict: 'malformed'; reason: string; unsupportedEntities?: UnsupportedEntities };

/** A stored file the board cannot use, which nothing writes over. */
export type UnreadablePipelineReading = Extract<PipelineReading, { verdict: 'older' | 'malformed' }>;

const EARLIEST_PIPELINE_KEYS = ['version', 'prepare', 'gates', 'phases', 'review', 'airlock', 'constitution', 'agents', 'approvals', 'billing'] as const;
const PIPELINE_KEYS_OF_VERSION = {
  [EARLIEST_PIPELINE_FORMAT_VERSION]: EARLIEST_PIPELINE_KEYS,
  [PIPELINE_FORMAT_VERSION]:          [...EARLIEST_PIPELINE_KEYS, 'reach'],
  [ENTITIES_PIPELINE_FORMAT_VERSION]: [...EARLIEST_PIPELINE_KEYS, 'reach', 'entities'],
} as const satisfies Record<PipelineFormatVersion, readonly string[]>;
const READABLE_FORMAT_VERSIONS = [
  EARLIEST_PIPELINE_FORMAT_VERSION,
  PIPELINE_FORMAT_VERSION,
  ENTITIES_PIPELINE_FORMAT_VERSION
] as const satisfies readonly PipelineFormatVersion[];
const REQUIRED_KEYS = ['version', 'prepare', 'gates', 'phases'] as const;
/** Each entity holds its own steps, gates, constitution and reach, so beside `entities` the forge's own stay empty. */
const KEYS_EMPTY_BESIDE_ENTITIES = ['prepare', 'gates', 'constitution', 'reach'] as const satisfies readonly (keyof Pipeline)[];
const ENTITY_KEYS = [
  'kind',
  'home',
  'summary',
  'constitution',
  'prepare',
  'gates',
  'phases',
  'review',
  'agents',
  'whitelist',
  'reach',
  'dependsOn',
  'concurrency'
] as const satisfies readonly (keyof PipelineEntity)[];
const REQUIRED_ENTITY_KEYS = ['kind', 'home', 'prepare', 'gates', 'phases'] as const satisfies readonly (keyof PipelineEntity)[];
const ENTITY_KINDS         = ['app', 'package', 'root'] as const satisfies readonly PipelineEntityKind[];
const REPOSITORY_ROOT_HOME = '/';
const ENTITY_AGENT_ROLES   = ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'] as const satisfies readonly EntityAgentRole[];
const BILLING_KEYS         = ['mode', 'maxBudgetUsd'] as const;
const APPROVALS            = ['tickets', 'merge'] as const satisfies readonly PipelineApproval[];
const STEP_KEYS_OF_VERSION = {
  [EARLIEST_PIPELINE_FORMAT_VERSION]: ['name', 'run'],
  [PIPELINE_FORMAT_VERSION]:          ['name', 'run', 'in'],
  [ENTITIES_PIPELINE_FORMAT_VERSION]: ['name', 'run', 'in'],
} as const satisfies Record<PipelineFormatVersion, readonly string[]>;
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

/** Relative to the project's folder, or to the repository's root when it leads with `/`: no drive, backslash or `..` segment. */
function optionalFolderInRepositoryOf(value: unknown, path: string): Mapped<string | undefined> {
  const folder = optionalTextOf(value, path);
  if ('problem' in folder || folder.value === undefined) return folder;
  return PathNestingUtil.projectWirePathStaysInside(folder.value) ? folder : problemOf(`${path} is not a folder inside the repository`);
}

/** Each a repository path leading with `/`, named once. */
function repositoryPathsOf(value: unknown, path: string): Mapped<string[] | undefined> {
  const paths = textListOf(value, path);
  if ('problem' in paths || paths.value === undefined) return paths;
  const repositoryPaths = paths.value;
  const outsideRepository = repositoryPaths.find((repositoryPath) => !PathNestingUtil.repositoryWirePathStaysInside(repositoryPath));
  if (outsideRepository !== undefined) return problemOf(`${path} names ${JSON.stringify(outsideRepository)}, which is not a repository path leading with /`);
  const repeated = repositoryPaths.find((repositoryPath, index) => repositoryPaths.indexOf(repositoryPath) !== index);
  return repeated === undefined ? paths : problemOf(`${path} names ${JSON.stringify(repeated)} twice`);
}

function stepOf(value: unknown, path: string, formatVersion: PipelineFormatVersion): Mapped<PipelineStep> {
  const record = namedRecordOf(value, path, STEP_KEYS_OF_VERSION[formatVersion]);
  if ('problem' in record) return record;
  const { name, run } = record.value;
  if (!textIsPresent(run)) return problemOf(`${path} has no run line`);
  const folder = optionalFolderInRepositoryOf(record.value['in'], `${path}.in`);
  if ('problem' in folder) return folder;
  return { value: { name: String(name), run, ...(folder.value === undefined ? {} : { in: folder.value }) } };
}

/** Version 2 stored any text as a gate's folder, so its file reads as that release read it. */
function gateFolderOf(value: unknown, path: string, formatVersion: PipelineFormatVersion): Mapped<string | undefined> {
  return formatVersion === EARLIEST_PIPELINE_FORMAT_VERSION ? optionalTextOf(value, path) : optionalFolderInRepositoryOf(value, path);
}

function gateOf(value: unknown, path: string, formatVersion: PipelineFormatVersion): Mapped<PipelineGate> {
  const record = namedRecordOf(value, path, GATE_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const { name, run, overseerOnly } = fields;
  if (!textIsPresent(run)) return problemOf(`${path} has no run line`);
  if (overseerOnly !== undefined && overseerOnly !== true) return problemOf(`${path}.overseerOnly is present and is not true`);
  const gate: PipelineGate = { name: String(name), run };
  const fix = optionalTextOf(fields['fix'], `${path}.fix`);
  if ('problem' in fix) return fix;
  if (fix.value !== undefined) gate.fix = fix.value;
  const folder = gateFolderOf(fields['in'], `${path}.in`, formatVersion);
  if ('problem' in folder) return folder;
  if (folder.value !== undefined) gate.in = folder.value;
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

function phasesOf(value: unknown, gates: readonly PipelineGate[], keyPrefix: string): Mapped<PipelinePhaseOrders> {
  const record = closedRecordOf(value, `${keyPrefix}phases`, PHASE_KEYS);
  if ('problem' in record) return record;
  const gateNames = gates.map((gate) => gate.name);
  const phases: PipelinePhaseOrders = { build: [], review: [], merge: [] };
  for (const phase of PHASE_KEYS) {
    const names = record.value[phase];
    const phasePath = `${keyPrefix}phases.${phase}`;
    if (names === undefined) return problemOf(`${phasePath} is missing`);
    if (!Array.isArray(names) || !names.every(textIsPresent)) return problemOf(`${phasePath} is not a list of gate names`);
    const unknownName = names.find((name) => !gateNames.includes(name));
    if (unknownName !== undefined) return problemOf(`${phasePath} names ${JSON.stringify(unknownName)}, which is not a gate`);
    const repeated = names.find((name, index) => names.indexOf(name) !== index);
    if (repeated !== undefined) return problemOf(`${phasePath} names ${JSON.stringify(repeated)} twice`);
    phases[phase] = [...names];
  }
  const gateInNoPhase = gateNames.find((name) => PHASE_KEYS.every((phase) => !phases[phase].includes(name)));
  if (gateInNoPhase === undefined) return { value: phases };
  return problemOf(`the gate ${JSON.stringify(gateInNoPhase)}${keyPrefix === '' ? '' : ` of ${keyPrefix}gates`} runs in no phase`);
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

function reviewOf(value: unknown, path: string): Mapped<PipelineReview | undefined> {
  if (value === undefined) return { value: undefined };
  const record = namedRecordOf(value, path, REVIEW_KEYS);
  if ('problem' in record) return record;
  const reReview = reReviewOf(record.value['reReview'], `${path}.reReview`);
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

function constitutionOf(value: unknown, path: string): Mapped<PipelineConstitution | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, path, CONSTITUTION_KEYS);
  if ('problem' in record) return record;
  const constitutionPath = pathInsideRepositoryOf(record.value['path'], `${path}.path`);
  return 'problem' in constitutionPath ? constitutionPath : { value: { path: constitutionPath.value } };
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

function agentsOf<Role extends PipelineAgentRole>(value: unknown, path: string, roles: readonly Role[]): Mapped<Partial<Record<Role, AgentStepSettings>> | undefined> {
  if (value === undefined) return { value: undefined };
  const record = closedRecordOf(value, path, roles);
  if ('problem' in record) return record;
  const agents: Partial<Record<Role, AgentStepSettings>> = {};
  for (const role of roles) {
    if (record.value[role] === undefined) continue;
    const settings = agentSettingsOf(record.value[role], `${path}.${role}`);
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

interface OwnSteps {
  prepare: PipelineStep[];
  gates:   PipelineGate[];
  phases:  PipelinePhaseOrders;
}

/** The prepare steps, gates and phases a pipeline or an entity runs, each path named under `keyPrefix`. */
function ownStepsOf(record: Record<string, unknown>, keyPrefix: string, formatVersion: PipelineFormatVersion): Mapped<OwnSteps> {
  const prepare = namedListOf(record['prepare'], `${keyPrefix}prepare`, (step, stepPath) => stepOf(step, stepPath, formatVersion));
  if ('problem' in prepare) return prepare;
  const gates = namedListOf(record['gates'], `${keyPrefix}gates`, (gate, gatePath) => gateOf(gate, gatePath, formatVersion));
  if ('problem' in gates) return gates;
  const sharedNameProblem = sharedNameProblemOf(prepare.value, gates.value);
  if (sharedNameProblem !== null) return sharedNameProblem;
  const phases = phasesOf(record['phases'], gates.value, keyPrefix);
  return 'problem' in phases ? phases : { value: { prepare: prepare.value, gates: gates.value, phases: phases.value } };
}

function entityKindOf(value: unknown, path: string): Mapped<PipelineEntityKind> {
  const entityKind = ENTITY_KINDS.find((knownKind) => knownKind === value);
  return entityKind === undefined ? problemOf(`${path} is not one of ${ENTITY_KINDS.join(', ')}`) : { value: entityKind };
}

function concurrencyOf(value: unknown, path: string): Mapped<number | undefined> {
  if (value === undefined) return { value: undefined };
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? { value } : problemOf(`${path} is not a positive whole number`);
}

/** The root entity's home may be the repository's root alone, `/`, as the Bridge writes it; any other home names folders below the root. */
function homeOf(value: unknown, path: string, entityKind: PipelineEntityKind): Mapped<string[]> {
  if (entityKind === 'root' && Array.isArray(value) && value.length === 1 && value[0] === REPOSITORY_ROOT_HOME) return { value: [REPOSITORY_ROOT_HOME] };
  const folders = repositoryPathsOf(value, path);
  if ('problem' in folders) return folders;
  return folders.value === undefined || folders.value.length === 0 ? problemOf(`${path} names no folder`) : { value: folders.value };
}

function entityOf(value: unknown, entityKey: EntityKey, formatVersion: PipelineFormatVersion): Mapped<PipelineEntity> {
  const path   = `entities.${entityKey}`;
  const record = closedRecordOf(value, path, ENTITY_KEYS);
  if ('problem' in record) return record;
  const fields     = record.value;
  const missingKey = REQUIRED_ENTITY_KEYS.find((key) => fields[key] === undefined);
  if (missingKey !== undefined) return problemOf(`${path}.${missingKey} is missing`);
  const entityKind = entityKindOf(fields['kind'], `${path}.kind`);
  if ('problem' in entityKind) return entityKind;
  const home = homeOf(fields['home'], `${path}.home`, entityKind.value);
  if ('problem' in home) return home;
  const ownSteps = ownStepsOf(fields, `${path}.`, formatVersion);
  if ('problem' in ownSteps) return ownSteps;
  const summary      = optionalTextOf(fields['summary'], `${path}.summary`);
  const constitution = constitutionOf(fields['constitution'], `${path}.constitution`);
  const review       = reviewOf(fields['review'], `${path}.review`);
  const agents       = agentsOf(fields['agents'], `${path}.agents`, ENTITY_AGENT_ROLES);
  const whitelist    = textListOf(fields['whitelist'], `${path}.whitelist`);
  const reach        = repositoryPathsOf(fields['reach'], `${path}.reach`);
  const dependsOn    = textListOf(fields['dependsOn'], `${path}.dependsOn`);
  const concurrency  = concurrencyOf(fields['concurrency'], `${path}.concurrency`);
  if ('problem' in summary) return summary;
  if ('problem' in constitution) return constitution;
  if ('problem' in review) return review;
  if ('problem' in agents) return agents;
  if ('problem' in whitelist) return whitelist;
  if ('problem' in reach) return reach;
  if ('problem' in dependsOn) return dependsOn;
  if ('problem' in concurrency) return concurrency;
  return {
    value: {
      kind: entityKind.value,
      home: home.value,
      ...(summary.value === undefined ? {} : { summary: summary.value }),
      ...(constitution.value === undefined ? {} : { constitution: constitution.value }),
      ...ownSteps.value,
      ...(review.value === undefined ? {} : { review: review.value }),
      ...(agents.value === undefined ? {} : { agents: agents.value }),
      ...(whitelist.value === undefined ? {} : { whitelist: whitelist.value }),
      ...(reach.value === undefined ? {} : { reach: reach.value }),
      ...(dependsOn.value === undefined ? {} : { dependsOn: dependsOn.value }),
      ...(concurrency.value === undefined ? {} : { concurrency: concurrency.value }),
    },
  };
}

function entityRefusalProblemOf(refusal: EntityRefusal): string {
  switch (refusal.reason) {
    case 'more-than-one-root':
      return `the entities ${refusal.entityKeys.join(', ')} are each of kind root, and one at most is`;
    case 'equal-homes':
      return `the entities ${refusal.entityKeys.join(', ')} share the home ${JSON.stringify(refusal.home)}`;
    case 'unknown-whitelist-key':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'unknown-dependency-key':
      return `entities.${refusal.entityKey}.dependsOn names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'whitelisted-entity-not-package':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, which is not a package`;
    case 'whitelisted-package-without-review':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, a package without a review`;
    case 'dependency-circle':
      return `the entities ${[...refusal.entityKeys, refusal.entityKeys[0]].join(' -> ')} depend on each other in a circle`;
  }
}

/** Each entity mapped, then the entities checked together by the validator the Bridge shares. */
function entitiesOf(value: unknown, formatVersion: PipelineFormatVersion): Mapped<Record<EntityKey, PipelineEntity> | undefined> {
  if (value === undefined) return { value: undefined };
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf('entities is not an object');
  const entities: Record<EntityKey, PipelineEntity> = {};
  for (const [entityKey, entityValue] of Object.entries(value)) {
    if (!textIsPresent(entityKey)) return problemOf('entities holds a blank key');
    const entity = entityOf(entityValue, entityKey, formatVersion);
    if ('problem' in entity) return entity;
    entities[entityKey] = entity.value;
  }
  const firstRefusal = EntityValidationUtil.refusalsOf(entities)[0];
  return firstRefusal === undefined ? { value: entities } : problemOf(entityRefusalProblemOf(firstRefusal));
}

/** A version 4 file holds entities, the only reason it exists, and beside them the forge's own steps, gates, constitution and reach stay empty. */
function entitiesProblemOf(document: Record<string, unknown>, formatVersion: PipelineFormatVersion): { problem: string } | null {
  const holdsEntities = document['entities'] !== undefined;
  if (formatVersion === ENTITIES_PIPELINE_FORMAT_VERSION && !holdsEntities) return problemOf(`version is ${formatVersion} and entities is missing`);
  if (!holdsEntities) return null;
  const keyNotEmpty = KEYS_EMPTY_BESIDE_ENTITIES.find((key) => {
    const keyValue = document[key];
    return keyValue !== undefined && !(Array.isArray(keyValue) && keyValue.length === 0);
  });
  return keyNotEmpty === undefined ? null : problemOf(`${keyNotEmpty} is not empty beside entities; each entity holds its own`);
}

function pipelineOf(document: Record<string, unknown>, formatVersion: PipelineFormatVersion): Mapped<Pipeline> {
  const unknownKeyProblem = unknownKeyProblemOf(document, PIPELINE_KEYS_OF_VERSION[formatVersion], '');
  if (unknownKeyProblem !== null) return problemOf(unknownKeyProblem);
  const missingKey = REQUIRED_KEYS.find((key) => document[key] === undefined);
  if (missingKey !== undefined) return problemOf(`${missingKey} is missing`);
  const entitiesProblem = entitiesProblemOf(document, formatVersion);
  if (entitiesProblem !== null) return entitiesProblem;
  const ownSteps = ownStepsOf(document, '', formatVersion);
  if ('problem' in ownSteps) return ownSteps;
  const review       = reviewOf(document['review'], 'review');
  const airlock      = airlockOf(document['airlock']);
  const constitution = constitutionOf(document['constitution'], 'constitution');
  const agents       = agentsOf(document['agents'], 'agents', AGENT_ROLES);
  const approvals    = approvalsOf(document['approvals']);
  const billing      = billingOf(document['billing']);
  const reach        = repositoryPathsOf(document['reach'], 'reach');
  const entities     = entitiesOf(document['entities'], formatVersion);
  if ('problem' in review) return review;
  if ('problem' in airlock) return airlock;
  if ('problem' in constitution) return constitution;
  if ('problem' in agents) return agents;
  if ('problem' in approvals) return approvals;
  if ('problem' in billing) return billing;
  if ('problem' in reach) return reach;
  if ('problem' in entities) return entities;
  return {
    value: {
      version: PIPELINE_FORMAT_VERSION,
      ...ownSteps.value,
      ...(review.value === undefined ? {} : { review: review.value }),
      ...(airlock.value === undefined ? {} : { airlock: airlock.value }),
      ...(constitution.value === undefined ? {} : { constitution: constitution.value }),
      ...(agents.value === undefined ? {} : { agents: agents.value }),
      ...(approvals.value === undefined ? {} : { approvals: approvals.value }),
      ...(billing.value === undefined ? {} : { billing: billing.value }),
      ...(reach.value === undefined ? {} : { reach: reach.value }),
      ...(entities.value === undefined ? {} : { entities: entities.value }),
    },
  };
}

/**
 * Version 2, 3 and 4 are mapped, each by its exact version with its own keys; no release converts an earlier file, so one with no version
 * or a lower one is `older`, never mapped, and a higher one is malformed.
 */
function mappedReadingOf(document: unknown): PipelineReading {
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', reason: 'the document is not a JSON object' };
  const { version } = document;
  if (version === undefined) return { verdict: 'older' };
  if (typeof version !== 'number' || !Number.isInteger(version)) return { verdict: 'malformed', reason: 'version is not a whole number' };
  if (version < EARLIEST_PIPELINE_FORMAT_VERSION) return { verdict: 'older' };
  const formatVersion = READABLE_FORMAT_VERSIONS.find((readableVersion) => readableVersion === version);
  if (formatVersion === undefined) {
    return { verdict: 'malformed', reason: `version is ${version}, a newer format than version ${Math.max(...READABLE_FORMAT_VERSIONS)}, which this build reads (newer-format)` };
  }
  const pipeline = pipelineOf(document, formatVersion);
  return 'problem' in pipeline ? { verdict: 'malformed', reason: pipeline.problem } : { verdict: 'readable', pipeline: pipeline.value };
}

/** A pipeline with entities maps whole, so every refusal of its entities shows, and is then refused: no forge runs entities yet. */
function documentReadingOf(document: unknown): PipelineReading {
  const reading = mappedReadingOf(document);
  if (reading.verdict === 'readable' && reading.pipeline.entities !== undefined) {
    return {
      verdict:             'malformed',
      reason:              'it holds entities, which this build does not support yet (entities-not-supported)',
      unsupportedEntities: { kind: 'entities-not-supported' },
    };
  }
  return reading;
}

/** A stored pipeline with entities in a tracker in a folder, which the board cannot use, as any malformed one. */
function entitiesInAFolderReadingOf(projectPrefix: string): PipelineReading {
  return {
    verdict:             'malformed',
    reason:              `it holds entities, and only a tracker at the repository's root may hold them, not one in the folder ${projectPrefix} (entities-in-a-folder)`,
    unsupportedEntities: { kind: 'entities-in-a-folder', projectPrefix },
  };
}

function read(pipelineFilePath: string): PipelineReading {
  const storedText = storedFileTextOf(pipelineFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', reason: storedText.reason };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', reason: parsedJson.problem };
  return documentReadingOf(parsedJson.value);
}

/** The document the pipeline is stored as: in the earliest format that holds it, so a release that reads only version 2 still can. */
function storedDocumentOf(pipeline: Readonly<Pipeline>): Record<string, unknown> {
  return { ...(JSON.parse(JSON.stringify(pipeline)) as Record<string, unknown>), version: PipelineUtil.formatVersionOf(pipeline) };
}

/**
 * Mapped through the read, so `version` is written first and every key in the order the read lists them; the required keys are always
 * written, so an empty gate list stays the deliberate "no gates" it was set as, and an optional key only once set.
 */
function contentsOf(pipeline: Readonly<Pipeline>): string {
  const document = storedDocumentOf(pipeline);
  const reading  = mappedReadingOf(document);
  return JsonTextUtil.storedFileTextOf(reading.verdict === 'readable' ? { ...reading.pipeline, version: document['version'] } : document);
}

export const PipelineFile = Object.freeze({
  read, contentsOf, documentReadingOf, entitiesInAFolderReadingOf, storedDocumentOf, billingOf
});
