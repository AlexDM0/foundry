/**
 * `gate-profiles.json` beside the progress file: the gate profile runs User started, read, validated and mapped here, and written through
 * the hold. A file the read cannot map whole is `malformed` with the reason, never a throw. Keys this build does not know are kept at the
 * top level, after its own, in their stored order, so a read and a write leave the file byte-identical.
 */
import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES }    from '../../lib/tracker-model/@types/GatePhase.ts';
import type {
  GateProfileRun,
  GateProfiles,
  GateProfilesReading,
  ProfiledGate
} from '../../lib/tracker-model/@types/GateProfile.ts';
import type { PipelineStep }                                                                    from '../../lib/tracker-model/@types/Pipeline.ts';
import { FIRST_GATE_PROFILE_RUN_NUMBER, GATE_PROFILE_RUN_STATES, GATE_PROFILES_FORMAT_VERSION } from '../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { JsonTextUtil }                                                                         from '../../shared/utils/JsonTextUtil.ts';
import { storedFileTextOf }                                                                     from '../StoredFileText.ts';
import { StoredValueUtil }                                                                      from '../utils/StoredValueUtil.ts';

const OWNED_KEYS = ['formatVersion', 'nextRunNumber', 'runs'] as const;

const RUN_KEYS = ['profileRunId', 'setupId', 'phase', 'gate', 'gateHash', 'prepare', 'state', 'stopRequested', 'elapsedMilliseconds'] as const;

const GATE_KEYS      = ['name', 'run', 'in', 'network'] as const;
const GATE_REQUIRED  = ['name', 'run'] as const;
const STEP_KEYS      = ['name', 'run'] as const;

const PROFILE_RUN_ID_PATTERN = /^P[1-9][0-9]*$/u;
const SETUP_ID_PATTERN       = /^S[1-9][0-9]*$/u;

type Mapped<Value> = { value: Value } | { problem: string };

function problemOf(problem: string): { problem: string } {
  return { problem };
}

/** Every key of `keys` that `required` names must be there, and no key outside `keys`. */
function recordOf(value: unknown, path: string, keys: readonly string[], required: readonly string[] = keys): Mapped<Record<string, unknown>> {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return problemOf(`${path} is not an object`);
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) return problemOf(`${path}.${unknownKey} is not a key of ${path}; the keys are ${keys.join(', ')}`);
  const missingKey = required.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined ? { value } : problemOf(`${path}.${missingKey} is missing`);
}

function textOf(value: unknown, path: string): Mapped<string> {
  return typeof value === 'string' && value !== '' ? { value } : problemOf(`${path} is not a text`);
}

function idOf(value: unknown, path: string, pattern: RegExp, example: string): Mapped<string> {
  return typeof value === 'string' && pattern.test(value) ? { value } : problemOf(`${path} is ${JSON.stringify(value)}, and it has to be an id such as ${example}`);
}

function wordOf<Word extends string>(value: unknown, path: string, vocabulary: readonly Word[]): Mapped<Word> {
  const words: readonly unknown[] = vocabulary;
  return words.includes(value) ? { value: value as Word } : problemOf(`${path} is ${JSON.stringify(value)}, which is not one of ${vocabulary.join(', ')}`);
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
  const record = recordOf(value, path, STEP_KEYS);
  if ('problem' in record) return record;
  const name = textOf(record.value['name'], `${path}.name`);
  if ('problem' in name) return name;
  const run = textOf(record.value['run'], `${path}.run`);
  return 'problem' in run ? run : { value: { name: name.value, run: run.value } };
}

function elapsedOf(value: unknown, path: string): Mapped<number | null> {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0) ? { value } : problemOf(`${path} is neither null nor a whole number of at least 0`);
}

function runOf(value: unknown, path: string): Mapped<GateProfileRun> {
  const record = recordOf(value, path, RUN_KEYS);
  if ('problem' in record) return record;
  const fields = record.value;
  const profileRunId = idOf(fields['profileRunId'], `${path}.profileRunId`, PROFILE_RUN_ID_PATTERN, 'P1');
  if ('problem' in profileRunId) return profileRunId;
  const setupId = fields['setupId'] === null ? { value: null } : idOf(fields['setupId'], `${path}.setupId`, SETUP_ID_PATTERN, 'S1');
  if ('problem' in setupId) return setupId;
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
  if (typeof stopRequested !== 'boolean') return problemOf(`${path}.stopRequested is not true or false`);
  const elapsedMilliseconds = elapsedOf(fields['elapsedMilliseconds'], `${path}.elapsedMilliseconds`);
  if ('problem' in elapsedMilliseconds) return elapsedMilliseconds;
  return {
    value: {
      profileRunId:        profileRunId.value,
      setupId:             setupId.value,
      phase:               phase.value,
      gate:                gate.value,
      gateHash:            gateHash.value,
      prepare:             prepare.value,
      state:               state.value,
      stopRequested,
      elapsedMilliseconds: elapsedMilliseconds.value,
    },
  };
}

function profilesOf(document: Record<string, unknown>): Mapped<GateProfiles> {
  const missingKey = OWNED_KEYS.find((key) => !Object.hasOwn(document, key));
  if (missingKey !== undefined) return problemOf(`${missingKey} is missing`);
  const { nextRunNumber } = document;
  if (!StoredValueUtil.wholeNumberIsAtLeast(nextRunNumber, FIRST_GATE_PROFILE_RUN_NUMBER)) {
    return problemOf(`nextRunNumber is not a whole number of at least ${FIRST_GATE_PROFILE_RUN_NUMBER}`);
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
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', reason: 'the document is not a JSON object' };
  const { formatVersion } = document;
  if (formatVersion !== GATE_PROFILES_FORMAT_VERSION) {
    return { verdict: 'malformed', reason: `formatVersion is ${JSON.stringify(formatVersion) ?? 'missing'}, and this build reads ${GATE_PROFILES_FORMAT_VERSION}` };
  }
  const profiles = profilesOf(document);
  return 'problem' in profiles ? { verdict: 'malformed', reason: profiles.problem } : { verdict: 'readable', profiles: profiles.value };
}

function read(profilesFilePath: string): GateProfilesReading {
  const storedText = storedFileTextOf(profilesFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', reason: storedText.reason };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', reason: parsedJson.problem };
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
    phase:               run.phase,
    gate:                gateDocumentOf(run.gate),
    gateHash:            run.gateHash,
    prepare:             run.prepare.map((step) => ({ name: step.name, run: step.run })),
    state:               run.state,
    stopRequested:       run.stopRequested,
    elapsedMilliseconds: run.elapsedMilliseconds,
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
