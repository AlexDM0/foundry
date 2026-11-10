/**
 * A ticket's numbered Acceptance items read against its latest `## Review`, so a release can tell whether the review accounted for every
 * item, and its `##` sections as text, so a page can quote one. It only reads: a body it cannot make sense of is a verdict, never a throw.
 */

import type { ReadinessGap }       from '../../../lib/tracker-model/@types/Ticket.ts';
import { TICKET_SECTION_PATTERNS } from '../../../shared/constants/TicketSectionPatterns.ts';

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
  let insideCodeFence = false;
  for (const line of body.split(LINE_BREAK_PATTERN)) {
    if (TICKET_SECTION_PATTERNS.CODE_FENCE.test(line)) insideCodeFence = !insideCodeFence;
    if (!insideCodeFence && TICKET_SECTION_PATTERNS.SECTION_BOUNDARY.test(line)) {
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

export const TicketAcceptanceUtil = {
  sectionsOf,
  acceptanceItemsOf,
  latestReviewLinesOf,
  acceptanceVerdictOf,
  readinessGapsOf,
} as const;
