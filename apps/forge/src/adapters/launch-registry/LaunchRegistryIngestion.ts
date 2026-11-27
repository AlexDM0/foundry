/**
 * Talos's launch registry, `talos/launches-<startNumber>.ndjson`, read line by line into the launches it accepted. Talos appends a line before
 * it spawns the child, so an unterminated last line that does not parse was cut short and names no child that ran: it is passed over. Every
 * other line that does not fit is named, and the readable lines still count. The lines carry no version: Talos writes them, and a Hephaestus
 * reads the registry of a Talos of older code.
 */
import { JsonRecordUtil }           from '../../lib/json-record/JsonRecordUtil.ts';
import type { LaunchRegistryEntry } from '../../lib/talos/ChildLaunch.ts';
import { CHILD_KINDS }              from '../../lib/talos/ChildRecord.ts';
import { ParsedValueUtil }          from '../../lib/talos/utils/ParsedValueUtil.ts';
import { storedFileTextOf }         from '../StoredFileText.ts';
import { StoredValueUtil }          from '../utils/StoredValueUtil.ts';

/** A line that does not fit, numbered from 1, and why. */
export interface UnreadableRegistryLine {
  lineNumber: number;
  reason:     string;
}

export type LaunchRegistryReading =
  | { verdict: 'readable'; entries: LaunchRegistryEntry[]; unreadableLines: UnreadableRegistryLine[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const LINE_SEPARATOR = '\n';

/** `unparseable` apart from `unreadable`: only a line that does not parse can have been cut short. */
type LineReading =
  | { verdict: 'readable'; entry: LaunchRegistryEntry }
  | { verdict: 'unparseable'; reason: string }
  | { verdict: 'unreadable'; reason: string };

function lineReadingOf(line: string): LineReading {
  const parsedJson = StoredValueUtil.parsedJsonOf(line);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'unparseable', reason: parsedJson.problem };
  const entry = parsedJson.value;
  if (!JsonRecordUtil.valueIsAPlainObject(entry)) return { verdict: 'unreadable', reason: 'it is not a JSON object' };
  const field = (key: keyof LaunchRegistryEntry): unknown => (Object.hasOwn(entry, key) ? entry[key] : undefined);
  const childId = field('childId');
  const childFolder = field('childFolder');
  const instance = field('instance');
  const kind = field('kind');
  if (typeof childId !== 'string') return { verdict: 'unreadable', reason: 'childId is not a string' };
  if (typeof childFolder !== 'string') return { verdict: 'unreadable', reason: 'childFolder is not a string' };
  if (!StoredValueUtil.valueIsAWholeNumber(instance)) return { verdict: 'unreadable', reason: 'instance is not a whole number' };
  if (!ParsedValueUtil.isOneOf(kind, CHILD_KINDS)) return { verdict: 'unreadable', reason: 'kind is neither agent nor line' };
  return {
    verdict: 'readable',
    entry:   {
      childId, childFolder, instance, kind
    },
  };
}

export class LaunchRegistryIngestion {
  constructor(private readonly launchRegistryFilePath: string) {}

  /** Never throws; a Talos that accepted no launch has no registry, which is `absent`. */
  read(): LaunchRegistryReading {
    const storedText = storedFileTextOf(this.launchRegistryFilePath);
    if (storedText.verdict !== 'readable') return storedText;
    const lines = storedText.text.split(LINE_SEPARATOR);
    const unterminatedLine = lines.pop() ?? '';
    const entries: LaunchRegistryEntry[] = [];
    const unreadableLines: UnreadableRegistryLine[] = [];
    lines.forEach((line, index) => {
      const reading = lineReadingOf(line);
      if (reading.verdict === 'readable') entries.push(reading.entry);
      else unreadableLines.push({ lineNumber: index + 1, reason: reading.reason });
    });
    const lastReading = unterminatedLine === '' ? null : lineReadingOf(unterminatedLine);
    if (lastReading?.verdict === 'readable') entries.push(lastReading.entry);
    if (lastReading?.verdict === 'unreadable') unreadableLines.push({ lineNumber: lines.length + 1, reason: lastReading.reason });
    return { verdict: 'readable', entries, unreadableLines };
  }
}
