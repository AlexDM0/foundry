/**
 * `config.json` in the monitor folder: what every forge of this user on this machine shares, `{version: 1, agents: {<vendor>: {programPath}}}`,
 * each vendor's program as it was found. Read, validate and map; written through the atomic-file package, every key it does not know kept.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import { JsonRecordUtil }      from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }    from '../StoredFileText.ts';
import { StoredValueUtil }     from '../utils/StoredValueUtil.ts';

export const MACHINE_CONFIG_VERSION = 1;

export interface MachineConfig {
  /** Each vendor's program, by the vendor's name as its agent adapter gives it. */
  agents: Record<string, { programPath: string }>;
}

export type MachineConfigReading =
  | { verdict: 'absent' }
  | { verdict: 'read'; config: MachineConfig }
  | { verdict: 'newer-version'; version: number }
  | { verdict: 'malformed'; reason: string };

/** A file that is newer or malformed is never written over: what it holds is not this build's to replace. */
export type MachineConfigWrite = 'written' | Extract<MachineConfigReading, { verdict: 'newer-version' | 'malformed' }>;

const MACHINE_CONFIG_FILE_NAME = 'config.json';

function pathIn(monitorFolder: string): string {
  return join(monitorFolder, MACHINE_CONFIG_FILE_NAME);
}

type StoredDocumentReading = { verdict: 'absent' } | { verdict: 'read'; document: Record<string, unknown> } | { verdict: 'malformed'; reason: string };

function storedDocumentIn(monitorFolder: string): StoredDocumentReading {
  const storedText = storedFileTextOf(pathIn(monitorFolder));
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', reason: storedText.reason };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', reason: parsedJson.problem };
  if (!JsonRecordUtil.valueIsAPlainObject(parsedJson.value)) return { verdict: 'malformed', reason: 'it is not a JSON object' };
  return { verdict: 'read', document: parsedJson.value };
}

function agentsOf(value: unknown): MachineConfig['agents'] | string {
  if (value === undefined) return {};
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return 'its "agents" is not an object';
  const agents: MachineConfig['agents'] = {};
  for (const [vendor, entry] of Object.entries(value)) {
    const programPath = JsonRecordUtil.valueIsAPlainObject(entry) ? entry['programPath'] : undefined;
    if (typeof programPath !== 'string' || programPath === '') return `its agent "${vendor}" names no "programPath"`;
    agents[vendor] = { programPath };
  }
  return agents;
}

function readingOf(document: Record<string, unknown>): MachineConfigReading {
  const { version } = document;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return { verdict: 'malformed', reason: 'its "version" is not a whole number' };
  if (version > MACHINE_CONFIG_VERSION) return { verdict: 'newer-version', version };
  if (version < MACHINE_CONFIG_VERSION) return { verdict: 'malformed', reason: `its "version" ${version} is older than ${MACHINE_CONFIG_VERSION}` };
  const agents = agentsOf(document['agents']);
  return typeof agents === 'string' ? { verdict: 'malformed', reason: agents } : { verdict: 'read', config: { agents } };
}

/** Never throws: a file that cannot be read or trusted whole is `malformed`, which every reader treats as naming no program. */
function read(monitorFolder: string): MachineConfigReading {
  const stored = storedDocumentIn(monitorFolder);
  return stored.verdict === 'read' ? readingOf(stored.document) : stored;
}

/** The program `vendor` runs on this machine, `null` when the file names none or cannot be trusted. */
function programPathOf(reading: MachineConfigReading, vendor: string): string | null {
  if (reading.verdict !== 'read' || !Object.hasOwn(reading.config.agents, vendor)) return null;
  return reading.config.agents[vendor]?.programPath ?? null;
}

/** Sets one vendor's program; every other key of the file, an unknown vendor's included, stays as it was, in its place. */
function writeAgentProgram(monitorFolder: string, vendor: string, programPath: string): MachineConfigWrite {
  const stored = storedDocumentIn(monitorFolder);
  if (stored.verdict === 'malformed') return stored;
  const document = stored.verdict === 'read' ? stored.document : {};
  if (stored.verdict === 'read') {
    const reading = readingOf(stored.document);
    if (reading.verdict === 'newer-version' || reading.verdict === 'malformed') return reading;
  }
  const storedAgents = JsonRecordUtil.valueIsAPlainObject(document['agents']) ? document['agents'] : {};
  const existingEntry = Object.hasOwn(storedAgents, vendor) && JsonRecordUtil.valueIsAPlainObject(storedAgents[vendor]) ? storedAgents[vendor] : {};
  const agents = Object.fromEntries([...Object.entries(storedAgents).filter(([key]) => key !== vendor), [vendor, { ...existingEntry, programPath }]]);
  const written = Object.fromEntries([
    ['version', MACHINE_CONFIG_VERSION],
    ...Object.entries(document).filter(([key]) => key !== 'version' && key !== 'agents'),
    ['agents', Object.hasOwn(storedAgents, vendor) ? { ...storedAgents, [vendor]: agents[vendor] } : agents],
  ]);
  mkdirSync(monitorFolder, { recursive: true });
  writeFileAtomically(pathIn(monitorFolder), `${JSON.stringify(written, null, 2)}\n`);
  return 'written';
}

export const MachineConfigFile = Object.freeze({
  pathIn, read, programPathOf, writeAgentProgram
});
