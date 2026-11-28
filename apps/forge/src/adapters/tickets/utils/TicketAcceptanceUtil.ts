/**
 * A ticket's numbered Acceptance items read against its latest `## Review`, so a release can tell whether the review accounted for every
 * item, its `##` sections as text, so a page can quote one, and the files its Brief says the work belongs in. It only reads: a body it
 * cannot make sense of is a verdict, never a throw.
 */

import type { ReadinessGap }                      from '../../../domain/tracker-model/@types/Ticket.ts';
import { openCodeFenceAfter, type OpenCodeFence } from '../../../shared/OpenCodeFence.ts';
import { TICKET_SECTION_PATTERNS }                from '../../../shared/constants/TicketSectionPatterns.ts';

export interface AcceptanceItem {
  label:        string;
  /** What follows `A<n>.`, continuation lines joined by one space, each line trimmed. */
  text:         string;
  /** The reason after `Waived:` when the Acceptance itself marks the item waived, continuation lines joined; `null` otherwise. */
  waivedReason: string | null;
}

/** A `##` section of a ticket body: its heading's text and the source lines under it, the blank lines around them dropped. */
export interface TicketSection {
  heading:  string;
  markdown: string;
}

export type ReviewItemVerdict = 'holds' | 'does not hold' | 'waived';

export interface ReviewItemLine {
  label:   string;
  verdict: ReviewItemVerdict;
  /** What follows the verdict, its leading dash or colon dropped. */
  text:    string;
}

export interface ReviewWaiver {
  label:  string;
  reason: string;
}

export type AcceptanceVerdict =
  | { verdict: 'accounted-for' }
  | { verdict: 'unnumbered' }
  | { verdict: 'unaccounted'; labels: string[] }
  | { verdict: 'waived-in-review-only'; waivers: ReviewWaiver[] };

const LINE_BREAK_PATTERN        = /\r?\n/;
const LEVEL_TWO_HEADING         = /^##[ \t]+(.*?)[ \t]*$/;
const REVIEW_HEADING            = /^## Review(?:[ \t]+\d+)?[ \t]*$/;
const BRIEF_HEADING             = /^## Brief[ \t]*$/;
const WAIVED_MARKER_PATTERN     = /^Waived:[ \t]*(.*)$/;
const REVIEW_LINE_PATTERN       = /^[ \t]*(?:[-*+][ \t]+)?A(\d+)[ \t]+(holds|does not hold|waived)\b(.*)$/;
const VERDICT_SEPARATOR_PATTERN = /^[\s—–:-]+/;
const WORK_FILES_LABEL_PATTERN  = /^[ \t]*Work belongs in:(.*)$/;
/** A line that starts the next part of the Brief: a label ending in a colon, or a numbered or bulleted item. */
const NEXT_BRIEF_PART_PATTERN   = /^[ \t]*(?:[A-Z][^:/]*:|\d+\.|[-*+][ \t])/;
const WORK_FILE_SEPARATOR       = /[\s,;]+/;
/** Quotes, brackets and sentence punctuation around a path as prose writes it. */
const SURROUNDING_PUNCTUATION   = /^[`'"([{<]+|[`'")\]}>.,;:]+$/g;
/** A line range after a file: `:12` or `:12-30`. */
const LINE_RANGE_SUFFIX         = /:\d+(?:-\d+)?$/;
/** Where a glob's wildcards or brace alternatives start: the path is cut there. */
const GLOB_START_PATTERN        = /[*?{[]/;
/** Path characters only, so prose such as `(read/write` is no path. */
const PATH_CHARACTERS_PATTERN   = /^\/?[\w.@+-]+(?:\/[\w.@+-]*)*$/u;
const FILE_EXTENSION_PATTERN    = /\.[A-Za-z0-9]+$/;
/** Prose such as `and/or` holds two segments; a folder path written without a trailing `/` holds at least this many. */
const SEGMENTS_OF_A_BARE_FOLDER = 3;

function labelOf(digits: string): string {
  return `A${Number.parseInt(digits, 10)}`;
}

interface HeadedLines {
  headingLine: string;
  lines:       string[];
}

/** Every `#` or `##` heading with the lines under it; a heading inside a code fence is a line, and lines before the first heading belong to none. */
function headedLinesOf(body: string): HeadedLines[] {
  const sections: HeadedLines[] = [];
  let openFence: OpenCodeFence | null = null;
  for (const line of body.split(LINE_BREAK_PATTERN)) {
    openFence = openCodeFenceAfter(line, openFence);
    if (openFence === null && TICKET_SECTION_PATTERNS.SECTION_BOUNDARY.test(line)) {
      sections.push({ headingLine: line, lines: [] });
      continue;
    }
    sections.at(-1)?.lines.push(line);
  }
  return sections;
}

/** Each section's lines under the heading the pattern matches. */
function sectionsUnder(body: string, headingPattern: RegExp): string[][] {
  return headedLinesOf(body).filter(({ headingLine }) => headingPattern.test(headingLine)).map(({ lines }) => lines);
}

function withoutSurroundingBlankLines(lines: readonly string[]): string[] {
  const firstWritten = lines.findIndex((line) => line.trim() !== '');
  if (firstWritten === -1) return [];
  const lastWritten = lines.findLastIndex((line) => line.trim() !== '');
  return lines.slice(firstWritten, lastWritten + 1);
}

/** Every `##` section in written order, a repeated heading kept each time; a `#` title ends the section before it and starts none. */
function sectionsOf(body: string): TicketSection[] {
  return headedLinesOf(body).flatMap(({ headingLine, lines }) => {
    const heading = LEVEL_TWO_HEADING.exec(headingLine);
    if (heading === null) return [];
    return [{ heading: heading[1] ?? '', markdown: withoutSurroundingBlankLines(lines).join('\n') }];
  });
}

function joinedTextOf(lines: readonly string[]): string {
  return lines.map((line) => line.trim()).filter((line) => line !== '').join(' ');
}

function waivedReasonOf(itemText: string, continuationLines: readonly string[]): string | null {
  const marker = WAIVED_MARKER_PATTERN.exec(itemText);
  if (marker === null) return null;
  return joinedTextOf([marker[1] ?? '', ...continuationLines]);
}

/** The items of the first `## Acceptance`, in written order; an item numbered twice counts once, as first written. */
function acceptanceItemsOf(body: string): AcceptanceItem[] {
  const items: AcceptanceItem[] = [];
  const lines = sectionsUnder(body, TICKET_SECTION_PATTERNS.ACCEPTANCE_HEADING)[0] ?? [];
  for (let i = 0; i < lines.length; i++) {
    const itemLine = TICKET_SECTION_PATTERNS.ACCEPTANCE_ITEM_LINE.exec(lines[i] ?? '');
    if (itemLine === null) continue;
    const continuationLines: string[] = [];
    while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() !== ''
      && !TICKET_SECTION_PATTERNS.ACCEPTANCE_ITEM_LINE.test(lines[i + 1] ?? '')) {
      i++;
      continuationLines.push(lines[i] ?? '');
    }
    const label = labelOf(itemLine[1] ?? '');
    if (items.some((item) => item.label === label)) continue;
    const itemText = itemLine[2] ?? '';
    items.push({ label, text: joinedTextOf([itemText, ...continuationLines]), waivedReason: waivedReasonOf(itemText, continuationLines) });
  }
  return items;
}

/** The item lines of the last `## Review` alone: an earlier round's verdicts were made on another tip. */
function latestReviewLinesOf(body: string): ReviewItemLine[] {
  const latestReview = sectionsUnder(body, REVIEW_HEADING).at(-1) ?? [];
  return latestReview.flatMap((line) => {
    const reviewLine = REVIEW_LINE_PATTERN.exec(line);
    if (reviewLine === null) return [];
    return [{
      label:   labelOf(reviewLine[1] ?? ''),
      verdict: reviewLine[2] as ReviewItemVerdict,
      text:    (reviewLine[3] ?? '').replace(VERDICT_SEPARATOR_PATTERN, '').trim(),
    }];
  });
}

/**
 * An item the Acceptance marks waived is accounted for whatever the Review says. Otherwise it needs a `holds` or `waived` line and no
 * `does not hold` one; a gap outranks a waiver, since only an otherwise complete review asks the user to agree to one.
 */
function acceptanceVerdictOf(body: string): AcceptanceVerdict {
  const items = acceptanceItemsOf(body);
  if (items.length === 0) return { verdict: 'unnumbered' };
  const reviewLines   = latestReviewLinesOf(body);
  const linesOf       = (label: string): ReviewItemLine[] => reviewLines.filter((line) => line.label === label);
  const itemsToReview = items.filter((item) => item.waivedReason === null);

  const unaccountedLabels = itemsToReview
    .filter(({ label }) => {
      const verdicts = linesOf(label).map(({ verdict }) => verdict);
      return verdicts.includes('does not hold') || !(verdicts.includes('holds') || verdicts.includes('waived'));
    })
    .map(({ label }) => label);
  if (unaccountedLabels.length > 0) return { verdict: 'unaccounted', labels: unaccountedLabels };

  const waivers = itemsToReview.flatMap(({ label }) => {
    const waiverLine = linesOf(label).find(({ verdict }) => verdict === 'waived');
    return waiverLine === undefined ? [] : [{ label, reason: waiverLine.text }];
  });
  if (waivers.length > 0) return { verdict: 'waived-in-review-only', waivers };
  return { verdict: 'accounted-for' };
}

/** What `ticket ready` refuses a draft for: the Acceptance read as the release reads it, and the first `## Brief` holding a non-blank line. */
function readinessGapsOf(body: string): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (acceptanceItemsOf(body).length === 0) gaps.push('acceptance-unnumbered');
  const briefLines = sectionsUnder(body, BRIEF_HEADING)[0] ?? [];
  if (briefLines.every((line) => line.trim() === '')) gaps.push('brief-missing');
  return gaps;
}

/**
 * A token of the Work line as a repository path leading with `/`, a glob cut at its first wildcard or brace; `null` when it names no path.
 * Prose with one slash, such as `and/or` or `n/a`, names no path: a path is quoted in backticks, ends in `/`, names a file with an
 * extension, or holds at least three segments.
 */
function workFileOf(token: string): string | null {
  if (token.includes('://') || token.includes('<')) return null;
  const isQuotedAsCode = token.startsWith('`');
  const trimmed        = token.replace(SURROUNDING_PUNCTUATION, '').replace(LINE_RANGE_SUFFIX, '').replace(/^\.\//u, '');
  const path           = trimmed.split(GLOB_START_PATTERN)[0] ?? '';
  if (!path.includes('/') || !PATH_CHARACTERS_PATTERN.test(path)) return null;
  const withoutTrailingSlash = path.replace(/\/+$/u, '');
  if (withoutTrailingSlash === '') return null;
  const segmentCount = withoutTrailingSlash.split('/').filter((segment) => segment !== '').length;
  const looksLikeAPath = isQuotedAsCode || path.endsWith('/') || FILE_EXTENSION_PATTERN.test(withoutTrailingSlash)
    || segmentCount >= SEGMENTS_OF_A_BARE_FOLDER;
  if (!looksLikeAPath) return null;
  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

/**
 * The files the first `## Brief` says the work belongs in: each path on its `Work belongs in:` line and the lines that continue it, up to
 * a blank line or the next part of the Brief. A bare file name with no folder names no path.
 */
function workFilesOf(body: string): string[] {
  const briefLines = sectionsUnder(body, BRIEF_HEADING)[0] ?? [];
  const labelIndex = briefLines.findIndex((line) => WORK_FILES_LABEL_PATTERN.test(line));
  if (labelIndex === -1) return [];
  const workLines = [WORK_FILES_LABEL_PATTERN.exec(briefLines[labelIndex] ?? '')?.[1] ?? ''];
  for (const line of briefLines.slice(labelIndex + 1)) {
    if (line.trim() === '' || NEXT_BRIEF_PART_PATTERN.test(line)) break;
    workLines.push(line);
  }
  const files = workLines.join(' ').split(WORK_FILE_SEPARATOR).flatMap((token) => workFileOf(token) ?? []);
  return [...new Set(files)];
}

/**
 * A ticket body with a blank line before every `A<number>.` line of its `## Acceptance` section that follows a non-blank one, so a Markdown
 * reader shows each item as its own paragraph instead of joining them into one; every other line, and the stored file, stay as written.
 */
function withAcceptanceItemsSeparated(ticketBody: string): string {
  const lines = ticketBody.split('\n');
  const separatedLines: string[] = [];
  let insideAcceptance = false;
  let openFence: OpenCodeFence | null = null;
  for (const line of lines) {
    openFence = openCodeFenceAfter(line, openFence);
    const insideCodeFence = openFence !== null;
    if (!insideCodeFence && TICKET_SECTION_PATTERNS.SECTION_BOUNDARY.test(line)) {
      insideAcceptance = TICKET_SECTION_PATTERNS.ACCEPTANCE_HEADING.test(line.trimEnd());
    }
    const previousLine = separatedLines.at(-1);
    const startsAnItemAfterText = insideAcceptance && !insideCodeFence && TICKET_SECTION_PATTERNS.ACCEPTANCE_ITEM_LINE.test(line)
      && previousLine !== undefined && previousLine.trim() !== '';
    if (startsAnItemAfterText) separatedLines.push('');
    separatedLines.push(line);
  }
  return separatedLines.join('\n');
}

export const TicketAcceptanceUtil = {
  sectionsOf,
  acceptanceItemsOf,
  latestReviewLinesOf,
  acceptanceVerdictOf,
  readinessGapsOf,
  workFilesOf,
  withAcceptanceItemsSeparated,
} as const;
