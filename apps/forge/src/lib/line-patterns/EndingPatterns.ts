/**
 * Recognising a named ending of one child: each pattern counts the lines that meet its counted conditions since the previous closing line,
 * and the first pattern whose conditions the closing line meets, with enough counted lines, names the ending. Every closing line resets
 * the counts, whether a pattern matched or not.
 */
import {
  type LineConditions,
  lineConditionsOf,
  lineMeets,
  type ParsedLine,
} from './LineConditions.ts';

export interface EndingPattern {
  name:                string;
  closingLineMatches:  LineConditions;
  countedLineMatches:  LineConditions | null;
  minimumCountedLines: number;
}

export interface RecognisedEnding {
  name:                string;
  /** The event-log sequence of the closing line it matched. */
  closingLineSequence: number;
  countedLines:        number;
}

export interface EndingRecognition {
  readonly observe: (parsed: ParsedLine | null, sequence: number) => RecognisedEnding | null;
}

const ENDING_NAME_PATTERN = /^[a-z][a-z-]*$/;

/** With no closing line nothing is ever recognised. */
export function createEndingRecognition(closingLine: LineConditions | null, patterns: readonly EndingPattern[]): EndingRecognition {
  const countedLinesPerPattern = patterns.map(() => 0);
  return {
    observe: (parsed, sequence) => {
      if (parsed === null) return null;
      patterns.forEach((pattern, patternIndex) => {
        if (pattern.countedLineMatches !== null && lineMeets(parsed, pattern.countedLineMatches)) {
          countedLinesPerPattern[patternIndex] = (countedLinesPerPattern[patternIndex] ?? 0) + 1;
        }
      });
      if (closingLine === null || !lineMeets(parsed, closingLine)) return null;
      const countedLinesAtClose = [...countedLinesPerPattern];
      countedLinesPerPattern.fill(0);
      const matchingIndex = patterns.findIndex((pattern, patternIndex) => lineMeets(parsed, pattern.closingLineMatches)
        && (countedLinesAtClose[patternIndex] ?? 0) >= pattern.minimumCountedLines);
      const matchingPattern = patterns[matchingIndex];
      if (matchingPattern === undefined) return null;
      return { name: matchingPattern.name, closingLineSequence: sequence, countedLines: countedLinesAtClose[matchingIndex] ?? 0 };
    },
  };
}

function ownFieldOf(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** The launch frame's validator: a well-formed pattern, or `null`. */
export function endingPatternOf(value: unknown): EndingPattern | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const name = ownFieldOf(record, 'name');
  const minimumCountedLines = ownFieldOf(record, 'minimumCountedLines');
  const closingLineMatches = lineConditionsOf(ownFieldOf(record, 'closingLineMatches'));
  const countedLineValue = ownFieldOf(record, 'countedLineMatches');
  const countedLineMatches = countedLineValue === null ? null : lineConditionsOf(countedLineValue);
  if (typeof name !== 'string' || !ENDING_NAME_PATTERN.test(name)) return null;
  if (!Number.isSafeInteger(minimumCountedLines) || (minimumCountedLines as number) < 0) return null;
  if (closingLineMatches === null || (countedLineValue !== null && countedLineMatches === null)) return null;
  return {
    name,
    closingLineMatches,
    countedLineMatches,
    minimumCountedLines: minimumCountedLines as number,
  };
}
