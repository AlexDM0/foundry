/**
 * Talos's lines: a connection's first line read as `hello` by its own frozen parser, every later client line read as a frame, a Talos frame
 * written as a line, and the event log's `client` entries. A line that is no frame reads as `null`; keys a frame does not name are dropped.
 */
import { JsonRecordUtil } from '../json-record/JsonRecordUtil.ts';
import type {
  AppliedInput,
  ChildInput,
  ClientEntry,
  HelloFrame,
  ReceivedClientFrame,
  RefusedFrame,
  TalosFrame,
  VersionMismatchFrame,
} from './@types/TalosFrame.ts';
import type { QuitAtTurnEnd } from './ChildLaunch.ts';
import { leaseRenewerOf }     from './TalosRecord.ts';
import { ParsedValueUtil }    from './utils/ParsedValueUtil.ts';

const { ownFieldOf, isWholeNumberAtLeast } = ParsedValueUtil;

function parsedObjectOf(line: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return JsonRecordUtil.valueIsAPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSingleLine(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\n');
}

function isChildId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** The only parser of a connection's first line, held by `FrozenTalosHandshake.json`: it reads `kind` and the two keys of `hello`. */
export function helloFrameOf(line: string): HelloFrame | null {
  const parsed = parsedObjectOf(line);
  if (parsed === null || ownFieldOf(parsed, 'kind') !== 'hello') return null;
  const requiredProtocolVersion = ownFieldOf(parsed, 'requiredProtocolVersion');
  const secret = ownFieldOf(parsed, 'secret');
  // Any whole version is a hello, so a client of another protocol, an older one included, is answered `version-mismatch`.
  if (!isWholeNumberAtLeast(requiredProtocolVersion, 0) || typeof secret !== 'string') return null;
  return { kind: 'hello', requiredProtocolVersion, secret };
}

function appliedInputOf(value: Readonly<Record<string, unknown>>): AppliedInput | null {
  const act = ownFieldOf(value, 'act');
  const line = ownFieldOf(value, 'line');
  if (act === 'close') return { act };
  return act === 'write-line' && isSingleLine(line) ? { act, line } : null;
}

function childInputOf(value: unknown): ChildInput | null {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return null;
  return ownFieldOf(value, 'act') === 'quit-at-turn-end' ? { act: 'quit-at-turn-end' } : appliedInputOf(value);
}

/** Every frame after the first line; a `hello` there is no frame. */
export function clientFrameOf(line: string): ReceivedClientFrame | null {
  const parsed = parsedObjectOf(line);
  if (parsed === null) return null;
  const frameId = ownFieldOf(parsed, 'frameId');
  if (!isWholeNumberAtLeast(frameId, 1)) return null;
  const field = (key: string): unknown => ownFieldOf(parsed, key);
  switch (field('kind')) {
    case 'lease-renewal': {
      const renewer = leaseRenewerOf(field('renewer'));
      return renewer === null ? null : { kind: 'lease-renewal', frameId, renewer };
    }
    case 'launch': {
      const launch = field('launch');
      return JsonRecordUtil.valueIsAPlainObject(launch) ? { kind: 'launch', frameId, launch } : null;
    }
    case 'input': {
      const childId = field('childId');
      const input = childInputOf(field('input'));
      return isChildId(childId) && input !== null ? {
        kind: 'input', frameId, childId, input
      } : null;
    }
    case 'stop': {
      const childId = field('childId');
      const graceMilliseconds = field('graceMilliseconds');
      return isChildId(childId) && isWholeNumberAtLeast(graceMilliseconds, 0) ? {
        kind: 'stop', frameId, childId, graceMilliseconds
      } : null;
    }
    case 'stop-lines':
      return { kind: 'stop-lines', frameId };
    case 'quit':
      return field('reason') === 'restart' ? { kind: 'quit', frameId, reason: 'restart' } : null;
    default:
      return null;
  }
}

/** Built here, so the key order of a frozen frame belongs to this module. */
export function versionMismatchFrameOf(protocolVersion: number): VersionMismatchFrame {
  return { kind: 'version-mismatch', protocolVersion };
}

export function refusedFrameOf(reason: RefusedFrame['reason']): RefusedFrame {
  return { kind: 'refused', reason };
}

export function talosFrameLineOf(frame: TalosFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

/** The input act that applies a launch's own quit at its turn end, or `null` for a child launched with none. */
export function quitActInputOf(quitAct: QuitAtTurnEnd | null): AppliedInput | null {
  if (quitAct === null) return null;
  return quitAct.act === 'write-line' ? { act: 'write-line', line: quitAct.line } : { act: 'close' };
}

export function clientEntryLineOf(entry: ClientEntry): string {
  return JSON.stringify(entry);
}

export function clientEntryOf(line: string): ClientEntry | null {
  const parsed = parsedObjectOf(line);
  if (parsed === null) return null;
  if (ownFieldOf(parsed, 'act') !== 'stop') return appliedInputOf(parsed);
  const graceMilliseconds = ownFieldOf(parsed, 'graceMilliseconds');
  return isWholeNumberAtLeast(graceMilliseconds, 0) ? { act: 'stop', graceMilliseconds } : null;
}
