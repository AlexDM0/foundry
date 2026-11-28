/**
 * `gate-profiles.json` beside the progress file: the gate profile runs User started, read, validated and mapped here, and written through
 * the hold. A file the read cannot map whole is `malformed` with the problem, never a throw. Keys this build does not know are kept at the
 * top level, after its own, in their stored order, so a read and a write leave the file byte-identical.
 */
import { GATE_PHASES } from '../../domain/tracker-model/@types/GatePhase.ts';
import type {
  GateProfileRun,
  GateProfiles,
  GateProfilesReading,
  ProfiledGate
} from '../../domain/tracker-model/@types/GateProfile.ts';
import type { GateProfilesProblem } from '../../domain/tracker-model/@types/GateProfilesProblem.ts';
import type { PipelineStep }        from '../../domain/tracker-model/@types/Pipeline.ts';
import {
  FIRST_GATE_PROFILE_RUN_NUMBER,
  GATE_CACHE_REPORTS,
  GATE_PROFILE_RUN_STATES,
  GATE_PROFILES_FORMAT_VERSION
} from '../../domain/tracker-model/constants/GateProfileVocabulary.ts';
import { JsonRecordUtil }   from '../../lib/json-record/JsonRecordUtil.ts';
import { JsonTextUtil }     from '../../shared/utils/JsonTextUtil.ts';
import { storedFileTextOf } from '../StoredFileText.ts';
import { StoredValueUtil }  from '../utils/StoredValueUtil.ts';

const OWNED_KEYS = ['formatVersion', 'nextRunNumber', 'runs'] as const;

const RUN_KEYS = [
  'profileRunId', 'setupId', 'entity', 'phase', 'gate', 'gateHash', 'prepare', 'state', 'stopRequested', 'elapsedMilliseconds', 'cacheReport',
] as const;
const RUN_REQUIRED = ['profileRunId', 'setupId', 'phase', 'gate', 'gateHash', 'prepare', 'state', 'stopRequested', 'elapsedMilliseconds'] as const;

const GATE_KEYS      = ['name', 'run', 'in', 'network'] as const;
const GATE_REQUIRED  = ['name', 'run'] as const;
const STEP_KEYS      = ['name', 'run', 'in'] as const;
const STEP_REQUIRED  = ['name', 'run'] as const;

const PROFILE_RUN_ID_PATTERN = /^P[1-9][0-9]*$/u;
const SETUP_ID_PATTERN       = /^S[1-9][0-9]*$/u;

type Mapped<Value> = { value: Value } | { problem: GateProfilesProblem };

function problemOf(problem: GateProfilesProblem): { problem: GateProfilesProblem } {
  return { problem };
}

/** Every key of `keys` that `required` names must be there, and no key outside `keys`. */
function recordOf(value: unknown, path: string, keys: readonly string[], required: readonly string[] = keys): Mapped<Record<string, unknown>> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf({ code: 'not-an-object', field: path });
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) return problemOf({
    code: 'not-a-key-of', field: path, key: unknownKey, knownKeys: keys
  });
  const missingKey = required.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined ? { value } : problemOf({ code: 'missing', field: `${path}.${missingKey}` });
}

function textOf(value: unknown, path: string): Mapped<string> {
  return typeof value === 'string' && value !== '' ? { value } : problemOf({ code: 'not-a-text', field: path });
}

function idOf(value: unknown, path: string, pattern: RegExp, example: string): Mapped<string> {
  return typeof value === 'string' && pattern.test(value) ? { value } : problemOf({
    code: 'not-an-id', field: path, storedValue: value, example
  });
}

function wordOf<Word extends string>(value: unknown, path: string, vocabulary: readonly Word[]): Mapped<Word> {
  const words: readonly unknown[] = vocabulary;
  return words.includes(value) ? { value: value as Word } : problemOf({
    code: 'not-a-word-of', field: path, storedValue: value, vocabulary
  });
}

function listOf<Item>(value: unknown, path: string, itemOf: (item: unknown, itemPath: string) => Mapped<Item>): Mapped<Item[]> {
  if (!Array.isArray(value)) return problemOf({ code: 'not-a-list', field: path });
  const items: Item[] = [];
  for (const [index, item] of value.entries()) {
    const mapped = itemOf(item, `${path}[${index}]`);
    if ('problem' in mapped) return mapped;
    items.push(mapped.value);
  }
  return { value: items };
}

function gateOf(value: unknown, path: string): Mapped<ProfiledGate> {
  const record = recordOf(value, path, GATE_KEYS, GATE_REQUIRED);
  if ('problem' in record) return record;
  const name = textOf(record.value['name'], `${path}.name`);
  if ('problem' in name) return name;
  const run = textOf(record.value['run'], `${path}.run`);
  if ('problem' in run) return run;
  const gate: ProfiledGate = { name: name.value, run: run.value };
  if (Object.hasOwn(record.value, 'in')) {
    const folder = textOf(record.value['in'], `${path}.in`);
    if ('problem' in folder) return folder;
    gate.in = folder.value;
  }
  if (Object.hasOwn(record.value, 'network')) {
    const network = listOf(record.value['network'], `${path}.network`, textOf);
    if ('problem' in network) return network;
    gate.network = network.value;
  }
  return { value: gate };
}

function stepOf(value: unknown, path: string): Mapped<PipelineStep> {
  const record = recordOf(value, path, STEP_KEYS, STEP_REQUIRED);
  if ('problem' in record) return record;
  const name = textOf(record.value['name'], `${path}.name`);
  if ('problem' in name) return name;
  const run = textOf(record.value['run'], `${path}.run`);
  if ('problem' in run) return run;
  if (!Object.hasOwn(record.value, 'in')) return { value: { name: name.value, run: run.value } };
  const folder = textOf(record.value['in'], `${path}.in`);
  return 'problem' in folder ? folder : { value: { name: name.value, run: run.value, in: folder.value } };
}

function elapsedOf(value: unknown, path: string): Mapped<number | null> {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0) ? { value } : problemOf({ code: 'neither-null-nor-a-whole-number-of-at-least', field: path, lowest: 0 });
}

function runOf(value: unknown, path: string): Mapped<GateProfileRun> {
  const record = recordOf(value, path, RUN_KEYS, RUN_REQUIRED);
  if ('problem' in record) return record;
  const fields = record.value;
  const profileRunId = idOf(fields['profileRunId'], `${path}.profileRunId`, PROFILE_RUN_ID_PATTERN, 'P1');
  if ('problem' in profileRunId) return profileRunId;
  const setupId = fields['setupId'] === null ? { value: null } : idOf(fields['setupId'], `${path}.setupId`, SETUP_ID_PATTERN, 'S1');
  if ('problem' in setupId) return setupId;
  const entity = Object.hasOwn(fields, 'entity') ? textOf(fields['entity'], `${path}.entity`) : null;
  if (entity !== null && 'problem' in entity) return entity;
  const phase = wordOf(fields['phase'], `${path}.phase`, GATE_PHASES);
  if ('problem' in phase) return phase;
  const gate = gateOf(fields['gate'], `${path}.gate`);
  if ('problem' in gate) return gate;
  const gateHash = textOf(fields['gateHash'], `${path}.gateHash`);
  if ('problem' in gateHash) return gateHash;
  const prepare = listOf(fields['prepare'], `${path}.prepare`, stepOf);
  if ('problem' in prepare) return prepare;
  const state = wordOf(fields['state'], `${path}.state`, GATE_PROFILE_RUN_STATES);
  if ('problem' in state) return state;
  const { stopRequested } = fields;
  if (typeof stopRequested !== 'boolean') return problemOf({ code: 'not-true-or-false', field: `${path}.stopRequested` });
  const elapsedMilliseconds = elapsedOf(fields['elapsedMilliseconds'], `${path}.elapsedMilliseconds`);
  if ('problem' in elapsedMilliseconds) return elapsedMilliseconds;
  const cacheReport = Object.hasOwn(fields, 'cacheReport') ? wordOf(fields['cacheReport'], `${path}.cacheReport`, GATE_CACHE_REPORTS) : null;
  if (cacheReport !== null && 'problem' in cacheReport) return cacheReport;
  return {
    value: {
      profileRunId:        profileRunId.value,
      setupId:             setupId.value,
      ...(entity === null ? {} : { entity: entity.value }),
      phase:               phase.value,
      gate:                gate.value,
      gateHash:            gateHash.value,
      prepare:             prepare.value,
      state:               state.value,
      stopRequested,
      elapsedMilliseconds: elapsedMilliseconds.value,
      ...(cacheReport === null ? {} : { cacheReport: cacheReport.value }),
    },
  };
}

function profilesOf(document: Record<string, unknown>): Mapped<GateProfiles> {
  const missingKey = OWNED_KEYS.find((key) => !Object.hasOwn(document, key));
  if (missingKey !== undefined) return problemOf({ code: 'missing', field: missingKey });
  const { nextRunNumber } = document;
  if (!StoredValueUtil.wholeNumberIsAtLeast(nextRunNumber, FIRST_GATE_PROFILE_RUN_NUMBER)) {
    return problemOf({ code: 'not-a-whole-number-of-at-least', field: 'nextRunNumber', lowest: FIRST_GATE_PROFILE_RUN_NUMBER });
  }
  const runs = listOf(document['runs'], 'runs', runOf);
  if ('problem' in runs) return runs;
  const ownedKeys: readonly string[] = OWNED_KEYS;
  const extra = Object.entries(document).filter(([key]) => !ownedKeys.includes(key));
  return {
    value: {
      formatVersion: GATE_PROFILES_FORMAT_VERSION, nextRunNumber, runs: runs.value, extra
    },
  };
}

function documentReadingOf(document: unknown): GateProfilesReading {
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', problem: { code: 'not-a-json-object' } };
  const { formatVersion } = document;
  if (formatVersion !== GATE_PROFILES_FORMAT_VERSION) {
    return {
      verdict: 'malformed',
      problem: {
        code: 'format-version-not-read', field: 'formatVersion', storedValue: formatVersion, readVersion: GATE_PROFILES_FORMAT_VERSION
      }
    };
  }
  const profiles = profilesOf(document);
  return 'problem' in profiles ? { verdict: 'malformed', problem: profiles.problem } : { verdict: 'readable', profiles: profiles.value };
}

function read(profilesFilePath: string): GateProfilesReading {
  const storedText = storedFileTextOf(profilesFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', problem: storedText.problem };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', problem: parsedJson.problem };
  return documentReadingOf(parsedJson.value);
}

function gateDocumentOf(gate: Readonly<ProfiledGate>): Record<string, unknown> {
  return {
    name: gate.name,
    run:  gate.run,
    ...(gate.in === undefined ? {} : { in: gate.in }),
    ...(gate.network === undefined ? {} : { network: gate.network }),
  };
}

function runDocumentOf(run: Readonly<GateProfileRun>): Record<string, unknown> {
  return {
    profileRunId:        run.profileRunId,
    setupId:             run.setupId,
    ...(run.entity === undefined ? {} : { entity: run.entity }),
    phase:               run.phase,
    gate:                gateDocumentOf(run.gate),
    gateHash:            run.gateHash,
    prepare:             run.prepare.map((step) => ({ name: step.name, run: step.run, ...(step.in === undefined ? {} : { in: step.in }) })),
    state:               run.state,
    stopRequested:       run.stopRequested,
    elapsedMilliseconds: run.elapsedMilliseconds,
    ...(run.cacheReport === undefined ? {} : { cacheReport: run.cacheReport }),
  };
}

/** The file's own keys first, in the order the read lists them, then every key this build does not know. */
function contentsOf(profiles: Readonly<GateProfiles>): string {
  // `fromEntries` makes every stored key an own property, so a stored `__proto__` stays data instead of setting the prototype.
  return JsonTextUtil.storedFileTextOf(Object.fromEntries([
    ['formatVersion', GATE_PROFILES_FORMAT_VERSION],
    ['nextRunNumber', profiles.nextRunNumber],
    ['runs', profiles.runs.map(runDocumentOf)],
    ...profiles.extra,
  ]));
}

export const GateProfilesFile = Object.freeze({ read, contentsOf });
