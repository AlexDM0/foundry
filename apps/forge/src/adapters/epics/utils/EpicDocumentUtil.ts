/**
 * An epic file's text to the model and back: a frontmatter of `key`, `title` and `slot` between `---` fences, then the description body,
 * kept byte for byte. Like a ticket it is hand-edited between runs, so every other frontmatter line is kept and a file the CLI cannot
 * understand is a verdict with its problem and line, never a throw.
 */
import type { EpicFrontmatter }                           from '../../../domain/tracker-model/@types/Epic.ts';
import type { LineEnding }                                from '../../../domain/tracker-model/@types/Ticket.ts';
import { EPIC_COLOUR_SLOT_COUNT, FIRST_EPIC_COLOUR_SLOT } from '../../../domain/tracker-model/constants/EpicFields.ts';
import { EpicUtil }                                       from '../../../domain/tracker-model/utils/EpicUtil.ts';
import type { EpicFileProblem }                           from '../@types/EpicFileProblem.ts';

export type ParsedEpicDocument =
  | { verdict: 'parsed'; frontmatter: EpicFrontmatter; body: string; lineEnding: LineEnding }
  | { verdict: 'malformed'; problem: EpicFileProblem; line: number };

interface KnownValue {
  rawValue: string;
  line:     number;
}

const FRONTMATTER_FENCE   = '---';
const KEY_VALUE_SEPARATOR = ': ';
const BYTE_ORDER_MARK     = '﻿';
const CARRIAGE_RETURN     = '\r';
const COMMENT_KEY         = '#';
const BLANK_LINE_KEY      = '';
const KEY_PATTERN         = /^[A-Za-z][A-Za-z0-9_-]*$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const KNOWN_KEYS          = new Set(['key', 'title', 'slot']);

class EpicFrontmatterProblem extends Error {
  readonly problem: EpicFileProblem;
  readonly line:    number;

  constructor(problem: EpicFileProblem, line: number) {
    super(problem.code);
    this.name    = 'EpicFrontmatterProblem';
    this.problem = problem;
    this.line    = line;
  }
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -1) : line;
}

/** The closing fence is the first later `---` line, never the last, because a description may hold a horizontal rule. */
function closingFenceIndexOf(lines: readonly string[]): number {
  if (withoutCarriageReturn(lines[0] ?? '') !== FRONTMATTER_FENCE) throw new EpicFrontmatterProblem({ code: 'first-line-not-a-fence' }, 1);
  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && withoutCarriageReturn(line) === FRONTMATTER_FENCE);
  if (closingFenceIndex === -1) throw new EpicFrontmatterProblem({ code: 'no-closing-fence' }, Math.max(lines.length, 1));
  return closingFenceIndex;
}

/** A quoted value is read as JSON text; any other is kept verbatim. */
function textOf(found: KnownValue, key: string): string {
  if (!found.rawValue.startsWith('"')) return found.rawValue;
  let parsed: unknown;
  try {
    parsed = JSON.parse(found.rawValue);
  } catch {
    throw new EpicFrontmatterProblem({ code: 'quoted-value-unclosed', field: key, storedValue: found.rawValue }, found.line);
  }
  if (typeof parsed !== 'string') throw new EpicFrontmatterProblem({ code: 'quoted-value-not-text', field: key }, found.line);
  return parsed;
}

function requiredValue(knownValues: ReadonlyMap<string, KnownValue>, key: string, closingFenceLine: number): KnownValue {
  const found = knownValues.get(key);
  if (found === undefined) throw new EpicFrontmatterProblem({ code: 'key-missing', field: key }, closingFenceLine);
  return found;
}

function frontmatterFrom(knownValues: ReadonlyMap<string, KnownValue>, extra: EpicFrontmatter['extra'], closingFenceLine: number): EpicFrontmatter {
  const keyValue = requiredValue(knownValues, 'key', closingFenceLine);
  const key      = textOf(keyValue, 'key');
  if (!EpicUtil.epicKeyIsWellFormed(key)) throw new EpicFrontmatterProblem({ code: 'not-an-epic-key', field: 'key', storedValue: key }, keyValue.line);

  const slotValue = requiredValue(knownValues, 'slot', closingFenceLine);
  const slot      = WHOLE_NUMBER_PATTERN.test(slotValue.rawValue) ? Number(slotValue.rawValue) : Number.NaN;
  const lastSlot  = FIRST_EPIC_COLOUR_SLOT + EPIC_COLOUR_SLOT_COUNT - 1;
  if (!EpicUtil.slotIsWellFormed(slot)) {
    throw new EpicFrontmatterProblem({
      code: 'not-a-colour-slot', field: 'slot', storedValue: slotValue.rawValue, firstSlot: FIRST_EPIC_COLOUR_SLOT, lastSlot
    }, slotValue.line);
  }

  return {
    key,
    title: textOf(requiredValue(knownValues, 'title', closingFenceLine), 'title'),
    slot,
    extra,
  };
}

function parsedEpicDocumentOf(text: string): ParsedEpicDocument {
  const withoutByteOrderMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  const lines                = withoutByteOrderMark.split('\n');

  try {
    const closingFenceIndex = closingFenceIndexOf(lines);
    const knownValues       = new Map<string, KnownValue>();
    const extra: EpicFrontmatter['extra'] = [];

    for (let index = 1; index < closingFenceIndex; index++) {
      const lineNumber = index + 1;
      const line       = withoutCarriageReturn(lines[index] ?? '');
      if (line.trim() === '') {
        extra.push([BLANK_LINE_KEY, '']);
        continue;
      }
      if (line.startsWith(COMMENT_KEY)) {
        extra.push([COMMENT_KEY, line.slice(COMMENT_KEY.length).trim()]);
        continue;
      }
      const separatorIndex = line.indexOf(KEY_VALUE_SEPARATOR);
      const key            = separatorIndex > 0 ? line.slice(0, separatorIndex) : line.slice(0, -1);
      const rawValue       = separatorIndex > 0 ? line.slice(separatorIndex + KEY_VALUE_SEPARATOR.length) : '';
      if ((separatorIndex <= 0 && !line.endsWith(':')) || !KEY_PATTERN.test(key)) {
        throw new EpicFrontmatterProblem({ code: 'not-a-key-value-line', lineText: line }, lineNumber);
      }
      if (KNOWN_KEYS.has(key)) knownValues.set(key, { rawValue, line: lineNumber });
      else extra.push([key, rawValue]);
    }

    let bodyOffset = 0;
    for (let index = 0; index <= closingFenceIndex; index++) bodyOffset += (lines[index] ?? '').length + 1;
    return {
      verdict:     'parsed',
      frontmatter: frontmatterFrom(knownValues, extra, closingFenceIndex + 1),
      body:        withoutByteOrderMark.slice(bodyOffset),
      lineEnding:  (lines[0] ?? '').endsWith(CARRIAGE_RETURN) ? '\r\n' : '\n',
    };
  } catch (problem) {
    if (problem instanceof EpicFrontmatterProblem) return { verdict: 'malformed', problem: problem.problem, line: problem.line };
    throw problem;
  }
}

function extraLineOf(key: string, rawValue: string): string {
  if (key === BLANK_LINE_KEY) return '';
  if (key === COMMENT_KEY) return rawValue === '' ? COMMENT_KEY : `${COMMENT_KEY} ${rawValue}`;
  return rawValue === '' ? `${key}:` : `${key}: ${rawValue}`;
}

function epicDocumentTextOf(frontmatter: EpicFrontmatter, body: string, lineEnding: LineEnding = '\n'): string {
  const lines = [
    FRONTMATTER_FENCE,
    `key: ${JSON.stringify(frontmatter.key)}`,
    `title: ${JSON.stringify(frontmatter.title)}`,
    `slot: ${frontmatter.slot}`,
    ...frontmatter.extra.map(([key, rawValue]) => extraLineOf(key, rawValue)),
    FRONTMATTER_FENCE,
  ];
  return `${lines.join(lineEnding)}${lineEnding}${body}`;
}

export const EpicDocumentUtil = { epicDocumentTextOf, parsedEpicDocumentOf } as const;
