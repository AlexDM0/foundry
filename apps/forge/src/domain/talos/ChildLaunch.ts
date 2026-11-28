/**
 * What a `launch` frame asks Talos to run: one child, its folder under the board, its whole environment and, for an agent, the standing
 * replies, the closing line, the ending patterns and the act that asks it to quit at the end of its turn. A launch is read as a verdict.
 */
import {
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';

import { JsonRecordUtil }                        from '../../lib/json-record/JsonRecordUtil.ts';
import { type EndingPattern, endingPatternOf }   from '../../lib/line-patterns/EndingPatterns.ts';
import { type LineConditions, lineConditionsOf } from '../../lib/line-patterns/LineConditions.ts';
import { CHILD_KINDS, type ChildKind }           from './ChildRecord.ts';
import { type StandingReply, standingReplyOf }   from './StandingReplies.ts';
import { ParsedValueUtil }                       from './utils/ParsedValueUtil.ts';

export type QuitAtTurnEnd = { act: 'close-input' } | { act: 'write-line'; line: string };

export interface ChildLaunch {
  /** Relative to the board folder, `/`-separated. */
  childFolder:                    string;
  instance:                       number;
  kind:                           ChildKind;
  label:                          string;
  argv:                           readonly string[];
  /** The child's whole environment; nothing of Talos's own is inherited. */
  environment:                    Readonly<Record<string, string>>;
  /** Child variable to the name of Talos's own variable it copies at spawn; no file holds the value. */
  environmentFromTalos:           Readonly<Record<string, string>>;
  workingDirectory:               string;
  verbatimArguments:              boolean;
  standingReplies:                readonly StandingReply[];
  closingLine:                    LineConditions | null;
  endingPatterns:                 readonly EndingPattern[];
  quitAtTurnEnd:                  QuitAtTurnEnd | null;
  treeStopAtEndGraceMilliseconds: number | null;
  /** Lines only. */
  timeBoundMilliseconds:          number | null;
}

/** One line of `launches-<startNumber>.ndjson` per accepted launch. */
export interface LaunchRegistryEntry { childId: string; childFolder: string; instance: number; kind: ChildKind }

export type ChildLaunchRefusalReason = 'malformed-launch' | 'folder-outside-board';

export type ChildLaunchReading =
  | { verdict: 'read'; launch: ChildLaunch }
  | { verdict: 'refused'; reason: ChildLaunchRefusalReason; detail: string };

const CHILD_FOLDER_SEPARATOR = '/';
const PARENT_SEGMENT = '..';
const CURRENT_SEGMENT = '.';
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

const { ownFieldOf, isWholeNumberAtLeast, isStringRecord } = ParsedValueUtil;

export function childIdOf(childFolder: string, instance: number): string {
  return `${childFolder}#${instance}`;
}

function malformed(detail: string): ChildLaunchReading {
  return { verdict: 'refused', reason: 'malformed-launch', detail };
}

function outsideBoard(detail: string): ChildLaunchReading {
  return { verdict: 'refused', reason: 'folder-outside-board', detail };
}

function hasControlCharacter(text: string): boolean {
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0) ?? FIRST_PRINTABLE_CODE_POINT;
    return codePoint < FIRST_PRINTABLE_CODE_POINT || codePoint === DELETE_CODE_POINT;
  });
}

function childFolderRefusalOf(childFolder: unknown, boardFolder: string): ChildLaunchReading | null {
  if (typeof childFolder !== 'string' || childFolder === '') return malformed('childFolder is not a non-empty string');
  if (isAbsolute(childFolder) || win32.isAbsolute(childFolder)) return outsideBoard('childFolder is absolute');
  if (childFolder.includes('\\')) return malformed('childFolder is not /-separated');
  if (hasControlCharacter(childFolder)) return malformed('childFolder has a control character');
  const segments = childFolder.split(CHILD_FOLDER_SEPARATOR);
  if (segments.includes(PARENT_SEGMENT)) return outsideBoard('childFolder has a .. segment');
  if (segments.some((segment) => segment === '' || segment === CURRENT_SEGMENT)) return malformed('childFolder has an empty or . segment');
  const fromBoard = relative(boardFolder, resolve(boardFolder, ...segments));
  if (fromBoard === '' || fromBoard.split(sep)[0] === PARENT_SEGMENT || isAbsolute(fromBoard)) return outsideBoard('childFolder does not resolve under the board folder');
  return null;
}

function quitAtTurnEndOf(value: unknown): QuitAtTurnEnd | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const act = ownFieldOf(value, 'act');
  const line = ownFieldOf(value, 'line');
  if (act === 'close-input') return { act };
  return act === 'write-line' && typeof line === 'string' && !line.includes('\n') ? { act, line } : undefined;
}

function listOf<Item>(value: unknown, itemOf: (item: unknown) => Item | null): Item[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(itemOf);
  return items.every((item) => item !== null) ? items : null;
}

function nullOrWholeNumberAtLeast(value: unknown, least: number): value is number | null {
  return value === null || isWholeNumberAtLeast(value, least);
}

/** A line runs with no reply, no recognition and no quit act; only a line carries a time bound. */
function kindRefusalOf(launch: ChildLaunch): ChildLaunchReading | null {
  if (launch.kind === 'agent') return launch.timeBoundMilliseconds === null ? null : malformed('timeBoundMilliseconds is set on an agent');
  if (launch.standingReplies.length > 0) return malformed('a line has standing replies');
  if (launch.closingLine !== null) return malformed('a line has a closing line');
  if (launch.endingPatterns.length > 0) return malformed('a line has ending patterns');
  if (launch.quitAtTurnEnd !== null) return malformed('a line has a quit at its turn end');
  return null;
}

/** Every field validated, keys it does not name dropped; `boardFolder` is absolute. */
export function childLaunchOf(value: unknown, boardFolder: string): ChildLaunchReading {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return malformed('the launch is not an object');
  const field = (key: keyof ChildLaunch): unknown => ownFieldOf(value, key);
  const childFolder = field('childFolder');
  const folderRefusal = childFolderRefusalOf(childFolder, boardFolder);
  if (folderRefusal !== null) return folderRefusal;
  const instance = field('instance');
  const kind = field('kind');
  const label = field('label');
  const argv = field('argv');
  const environment = field('environment');
  const environmentFromTalos = field('environmentFromTalos');
  const workingDirectory = field('workingDirectory');
  const verbatimArguments = field('verbatimArguments');
  const standingReplies = listOf(field('standingReplies'), standingReplyOf);
  const storedClosingLine = field('closingLine');
  const closingLine = storedClosingLine === null ? null : lineConditionsOf(storedClosingLine);
  const endingPatterns = listOf(field('endingPatterns'), endingPatternOf);
  const quitAtTurnEnd = quitAtTurnEndOf(field('quitAtTurnEnd'));
  const treeStopAtEndGraceMilliseconds = field('treeStopAtEndGraceMilliseconds');
  const timeBoundMilliseconds = field('timeBoundMilliseconds');
  if (!isWholeNumberAtLeast(instance, 1)) return malformed('instance is not a whole number from 1');
  if (!ParsedValueUtil.isOneOf(kind, CHILD_KINDS)) return malformed('kind is neither agent nor line');
  if (typeof label !== 'string') return malformed('label is not a string');
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((argument) => typeof argument === 'string')) return malformed('argv is not a non-empty list of strings');
  if (!isStringRecord(environment)) return malformed('environment is not a record of strings');
  if (!isStringRecord(environmentFromTalos)) return malformed('environmentFromTalos is not a record of strings');
  if (typeof workingDirectory !== 'string' || !isAbsolute(workingDirectory)) return malformed('workingDirectory is not an absolute path');
  if (typeof verbatimArguments !== 'boolean') return malformed('verbatimArguments is not a boolean');
  if (standingReplies === null) return malformed('standingReplies is not a list of rules');
  if (storedClosingLine !== null && closingLine === null) return malformed('closingLine is neither null nor line conditions');
  if (endingPatterns === null) return malformed('endingPatterns is not a list of ending patterns');
  if (quitAtTurnEnd === undefined) return malformed('quitAtTurnEnd is neither null nor a quit act');
  if (!nullOrWholeNumberAtLeast(treeStopAtEndGraceMilliseconds, 0)) return malformed('treeStopAtEndGraceMilliseconds is neither null nor a whole number of milliseconds');
  if (!nullOrWholeNumberAtLeast(timeBoundMilliseconds, 1)) return malformed('timeBoundMilliseconds is neither null nor a whole number above 0');
  const launch: ChildLaunch = {
    childFolder: childFolder as string,
    instance,
    kind,
    label,
    argv:        argv as string[],
    environment,
    environmentFromTalos,
    workingDirectory,
    verbatimArguments,
    standingReplies,
    closingLine,
    endingPatterns,
    quitAtTurnEnd,
    treeStopAtEndGraceMilliseconds,
    timeBoundMilliseconds,
  };
  return kindRefusalOf(launch) ?? { verdict: 'read', launch };
}
