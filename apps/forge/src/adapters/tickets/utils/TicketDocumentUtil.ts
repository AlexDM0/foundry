/**
 * Deliberately not a YAML parser: a ticket is edited by hand between CLI runs, so a rewrite keeps
 * every line the CLI does not own and a file the CLI cannot understand is reported rather than
 * half-applied. The subset it accepts is stated in `docs/cli.md`.
 */

import type { LineEnding, RetiredTicketType, TicketFrontmatter } from '../../../domain/tracker-model/@types/Ticket.ts';
import { EpicUtil }                                              from '../../../domain/tracker-model/utils/EpicUtil.ts';
import { NetworkDomainUtil }                                     from '../../../domain/tracker-model/utils/NetworkDomainUtil.ts';
import { TicketIdUtil }                                          from '../../../domain/tracker-model/utils/TicketIdUtil.ts';
import { VocabularyUtil }                                        from '../../../domain/tracker-model/utils/VocabularyUtil.ts';
import type { TicketFileProblem }                                from '../../../shared/@types/TicketFileProblem.ts';

/** `storedType` is present only when the file holds a retired type, which the frontmatter reads as `ticket`. */
export type ParsedTicketDocument =
  | { verdict: 'parsed'; frontmatter: TicketFrontmatter; body: string; lineEnding: LineEnding; storedType?: RetiredTicketType }
  | { verdict: 'malformed'; problem: TicketFileProblem; line: number };

type FrontmatterValue = string | number | null;

interface KnownValue {
  value: FrontmatterValue;
  line:  number;
}

const FRONTMATTER_FENCE     = '---';
const KEY_VALUE_SEPARATOR   = ': ';
const BYTE_ORDER_MARK   = '\uFEFF';
const KEY_PATTERN       = /^[A-Za-z][A-Za-z0-9_-]*$/;
const INTEGER_PATTERN   = /^-?\d+$/;
const DIGITS_PATTERN    = /^\d+$/;
const CARRIAGE_RETURN   = '\r';

// A comment is written `# text`; a line opening on two or more hashes is a markdown heading the frontmatter ran into.
const MARKDOWN_HEADING_PATTERN = /^#{2,6}(\s|$)/;
// A `# text` followed by blank lines and then prose, no `key: value` line, may be a heading or a comment, and its refusal names both readings.
const SINGLE_HASH_HEADING_PATTERN = /^# \S/;

// A comment starts at column 0: an indented `#` line is neither a comment nor a key, so it is refused like any other indented line.
const LEADING_WHITESPACE_PATTERN = /^\s/;

// The one key read as a number; every other unquoted value is kept verbatim, leading zeros included.
const INTEGER_KEY = 'task';

const COMMENT_KEY    = '#';
const BLANK_LINE_KEY = '';

const OPTIONAL_TEXT_KEYS = ['group', 'branch', 'commit', 'reason'] as const;

const RELEASES_GROUP_KEY   = 'releasesGroup';
const RELEASES_GROUP_VALUE = 'true';

const CONTENT_HASH_KEY = 'contentHash';

/** Sixteen lower-case hex digits, as `TicketBodyHashUtil` writes it, so a stored hash can never name a kept file outside its folder. */
const CONTENT_HASH_PATTERN = /^[0-9a-f]{16}$/;

const TICKET_LINK_KEYS = ['introducedBy', 'foundInReview'] as const;

const FILED_BY_JOB_KEY = 'filedByJob';

const ENTITY_KEY  = 'entity';
const CROSSES_KEY = 'crosses';

const KNOWN_KEYS = new Set<string>([
  'id',
  'title',
  'type',
  'priority',
  'size',
  'model',
  'effort',
  'hold',
  'status',
  'filed',
  'updated',
  'started',
  'finished',
  'delivered',
  'abandonedAt',
  ...OPTIONAL_TEXT_KEYS,
  RELEASES_GROUP_KEY,
  'dependsOn',
  'epics',
  'network',
  ENTITY_KEY,
  CROSSES_KEY,
  ...TICKET_LINK_KEYS,
  FILED_BY_JOB_KEY,
  CONTENT_HASH_KEY,
  'task',
]);

const FRONTMATTER_LIST_SEPARATOR_PATTERN = /[\s,]+/;
const FRONTMATTER_LIST_JOINER       = ', ';

class FrontmatterProblem extends Error {
  readonly problem: TicketFileProblem;
  readonly line:    number;

  constructor(problem: TicketFileProblem, line: number) {
    super(problem.code);
    this.name    = 'FrontmatterProblem';
    this.problem = problem;
    this.line    = line;
  }
}

/** The closing fence is the first later line equal to `---`, never the last, because ticket bodies contain horizontal rules. */
function parsedTicketDocumentOf(text: string): ParsedTicketDocument {
  const withoutByteOrderMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  const lines                = withoutByteOrderMark.split('\n');

  try {
    const closingFenceIndex = closingFenceIndexOf(lines);
    const knownValues       = new Map<string, KnownValue>();
    const extra: Array<[key: string, rawValue: string]> = [];

    for (let index = 1; index < closingFenceIndex; index++) {
      const lineNumber = index + 1;
      const line       = withoutCarriageReturn(lines[index] ?? '');

      if (line.trim() === '') {
        extra.push([BLANK_LINE_KEY, '']);
        continue;
      }
      // Checked before the indentation refusal, so an indented heading still names the deleted fence.
      if (MARKDOWN_HEADING_PATTERN.test(line.trimStart())) {
        throw new FrontmatterProblem({ code: 'heading-in-frontmatter', lineNumber, lineText: line }, lineNumber);
      }
      const proseLineIndex = proseLineIndexAfterSingleHashLine(lines, index, closingFenceIndex);
      if (proseLineIndex !== null) {
        const proseLineNumber = proseLineIndex + 1;
        throw new FrontmatterProblem({
          code: 'one-hash-line-before-prose', lineNumber, lineText: line, proseLineNumber
        }, lineNumber);
      }
      if (LEADING_WHITESPACE_PATTERN.test(line)) {
        throw new FrontmatterProblem({ code: 'line-indented', lineText: line }, lineNumber);
      }
      if (line.startsWith(COMMENT_KEY)) {
        extra.push([COMMENT_KEY, line.slice(COMMENT_KEY.length).trim()]);
        continue;
      }

      const [key, rawValue] = keyAndRawValueOf(line, lineNumber);

      if (!KNOWN_KEYS.has(key)) {
        extra.push([key, rawValue]);
        continue;
      }
      knownValues.set(key, { value: scalarOf(rawValue, key, lineNumber), line: lineNumber });
    }

    const frontmatter = frontmatterFrom(knownValues, extra, closingFenceIndex + 1);
    const typeText    = knownValues.get('type')?.value;
    return {
      verdict:    'parsed',
      frontmatter,
      body:       bodyAfter(withoutByteOrderMark, lines, closingFenceIndex),
      lineEnding: (lines[0] ?? '').endsWith(CARRIAGE_RETURN) ? '\r\n' : '\n',
      ...(typeof typeText === 'string' && VocabularyUtil.retiredTicketTypeIsKnown(typeText) ? { storedType: typeText } : {}),
    };
  } catch (problem) {
    if (problem instanceof FrontmatterProblem) {
      return { verdict: 'malformed', problem: problem.problem, line: problem.line };
    }
    throw problem;
  }
}

/**
 * An unknown line is copied back with its raw value untouched, and an absent optional key is omitted rather than written as `null`.
 * The line ending is the one the frontmatter was read with; the body is kept byte for byte whatever it holds. A retired stored type is
 * written back as it was stored while the ticket reads as `ticket`.
 */
function ticketDocumentTextOf(frontmatter: TicketFrontmatter, body: string, lineEnding: LineEnding = '\n', storedType?: RetiredTicketType): string {
  const writtenType = storedType !== undefined && frontmatter.type === 'ticket' ? storedType : frontmatter.type;
  const lines: string[] = [
    `id: ${JSON.stringify(frontmatter.id)}`,
    `title: ${JSON.stringify(frontmatter.title)}`,
    `type: ${JSON.stringify(writtenType)}`,
    ...(frontmatter.priority === undefined ? [] : [`priority: ${JSON.stringify(frontmatter.priority)}`]),
    ...(frontmatter.size === undefined ? [] : [`size: ${JSON.stringify(frontmatter.size)}`]),
    ...(frontmatter.model === undefined ? [] : [`model: ${JSON.stringify(frontmatter.model)}`]),
    ...(frontmatter.effort === undefined ? [] : [`effort: ${JSON.stringify(frontmatter.effort)}`]),
    ...(frontmatter.hold === undefined ? [] : [`hold: ${JSON.stringify(frontmatter.hold)}`]),
    `status: ${JSON.stringify(frontmatter.status)}`,
    `filed: ${JSON.stringify(frontmatter.filed)}`,
    `updated: ${JSON.stringify(frontmatter.updated)}`,
    `started: ${nullableTextLiteral(frontmatter.started)}`,
    `finished: ${nullableTextLiteral(frontmatter.finished)}`,
    `delivered: ${nullableTextLiteral(frontmatter.delivered)}`,
    `abandonedAt: ${nullableTextLiteral(frontmatter.abandonedAt)}`,
  ];

  for (const key of OPTIONAL_TEXT_KEYS) {
    const value = frontmatter[key];
    if (value !== undefined) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (frontmatter.releasesGroup === true) {
    lines.push(`${RELEASES_GROUP_KEY}: ${RELEASES_GROUP_VALUE}`);
  }

  if (frontmatter.dependsOn !== undefined && frontmatter.dependsOn.length > 0) {
    lines.push(`dependsOn: ${JSON.stringify(frontmatter.dependsOn.join(FRONTMATTER_LIST_JOINER))}`);
  }

  if (frontmatter.epics !== undefined && frontmatter.epics.length > 0) {
    lines.push(`epics: ${JSON.stringify(frontmatter.epics.join(FRONTMATTER_LIST_JOINER))}`);
  }

  if (frontmatter.network !== undefined && frontmatter.network.length > 0) {
    lines.push(`network: ${JSON.stringify(frontmatter.network.join(FRONTMATTER_LIST_JOINER))}`);
  }

  if (frontmatter.entity !== undefined) {
    lines.push(`${ENTITY_KEY}: ${JSON.stringify(frontmatter.entity)}`);
  }

  if (frontmatter.crosses !== undefined && frontmatter.crosses.length > 0) {
    lines.push(`${CROSSES_KEY}: ${JSON.stringify(frontmatter.crosses.join(FRONTMATTER_LIST_JOINER))}`);
  }

  for (const key of TICKET_LINK_KEYS) {
    const linkedTicketId = frontmatter[key];
    if (linkedTicketId !== undefined) {
      lines.push(`${key}: ${JSON.stringify(linkedTicketId)}`);
    }
  }

  if (frontmatter.filedByJob !== undefined) {
    lines.push(`${FILED_BY_JOB_KEY}: ${JSON.stringify(frontmatter.filedByJob)}`);
  }

  if (frontmatter.contentHash !== undefined) {
    lines.push(`${CONTENT_HASH_KEY}: ${JSON.stringify(frontmatter.contentHash)}`);
  }

  lines.push(`task: ${frontmatter.task === null ? 'null' : String(frontmatter.task)}`);

  for (const [key, rawValue] of frontmatter.extra) {
    lines.push(extraLineOf(key, rawValue));
  }

  return `${[FRONTMATTER_FENCE, ...lines, FRONTMATTER_FENCE].join(lineEnding)}${lineEnding}${body}`;
}

/**
 * A parsed document's frontmatter text, its fences included, with only its `title` line rewritten and every other byte kept. The last
 * `title` line is the one replaced, since that is the one the parse reads.
 */
function frontmatterTextWithTextValueOf(frontmatterText: string, key: 'title' | typeof CONTENT_HASH_KEY, value: string): string {
  const lines = frontmatterText.split('\n');
  const keyLineIndex = lines.findLastIndex((line) => {
    const reading = keyValueReadingOf(withoutCarriageReturn(line));
    return Array.isArray(reading) && reading[0] === key;
  });
  if (keyLineIndex === -1) return frontmatterText;
  const carriageReturn = (lines[keyLineIndex] ?? '').endsWith(CARRIAGE_RETURN) ? CARRIAGE_RETURN : '';
  lines[keyLineIndex] = `${key}: ${JSON.stringify(value)}${carriageReturn}`;
  return lines.join('\n');
}

function closingFenceIndexOf(lines: readonly string[]): number {
  if (withoutCarriageReturn(lines[0] ?? '') !== FRONTMATTER_FENCE) {
    throw new FrontmatterProblem({ code: 'first-line-not-a-fence' }, 1);
  }
  for (let index = 1; index < lines.length; index++) {
    if (withoutCarriageReturn(lines[index] ?? '') === FRONTMATTER_FENCE) {
      return index;
    }
  }
  const lastWrittenLine = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  throw new FrontmatterProblem({ code: 'no-closing-fence' }, Math.max(lastWrittenLine, 1));
}

/** The body is returned byte for byte from the character after the closing fence's newline. */
function bodyAfter(text: string, lines: readonly string[], closingFenceIndex: number): string {
  let offset = 0;
  for (let index = 0; index <= closingFenceIndex; index++) {
    offset += (lines[index] ?? '').length + 1;
  }
  return text.slice(offset);
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function proseLineIndexAfterSingleHashLine(lines: readonly string[], index: number, closingFenceIndex: number): number | null {
  if (!SINGLE_HASH_HEADING_PATTERN.test(withoutCarriageReturn(lines[index] ?? ''))) {
    return null;
  }
  let followingIndex = index + 1;
  while (followingIndex < closingFenceIndex && withoutCarriageReturn(lines[followingIndex] ?? '').trim() === '') {
    followingIndex++;
  }
  if (followingIndex === index + 1 || followingIndex >= closingFenceIndex) {
    return null;
  }
  const followingLine = withoutCarriageReturn(lines[followingIndex] ?? '');
  const followingLineIsProse = !followingLine.trim().startsWith(COMMENT_KEY) && !Array.isArray(keyValueReadingOf(followingLine));
  return followingLineIsProse ? followingIndex : null;
}

/** Splits at the first `': '`, so `title: Fix: the thing` keeps its second colon; anything that is not a `key: value` line is refused. */
function keyAndRawValueOf(line: string, lineNumber: number): [key: string, rawValue: string] {
  const reading = keyValueReadingOf(line);
  if (!Array.isArray(reading)) {
    throw new FrontmatterProblem(reading, lineNumber);
  }
  return reading;
}

/** The key and raw value of a `key: value` line, or the problem that it is not one. */
function keyValueReadingOf(line: string): [key: string, rawValue: string] | TicketFileProblem {
  const separatorIndex = line.indexOf(KEY_VALUE_SEPARATOR);
  const key            = separatorIndex > 0 ? line.slice(0, separatorIndex) : line.slice(0, -1);
  const rawValue       = separatorIndex > 0 ? line.slice(separatorIndex + KEY_VALUE_SEPARATOR.length) : '';

  if (separatorIndex <= 0 && !line.endsWith(':')) {
    return { code: 'not-a-key-value-line', lineText: line };
  }
  if (!KEY_PATTERN.test(key)) {
    return { code: 'key-unusable', field: key };
  }
  return [key, rawValue];
}

function scalarOf(rawValue: string, key: string, lineNumber: number): FrontmatterValue {
  if (rawValue === 'null') {
    return null;
  }
  if (key === INTEGER_KEY && INTEGER_PATTERN.test(rawValue)) {
    if (!Number.isSafeInteger(Number(rawValue))) {
      throw new FrontmatterProblem({ code: 'task-not-a-safe-whole-number', field: key, storedValue: rawValue }, lineNumber);
    }
    return Number(rawValue);
  }
  if (key === INTEGER_KEY && rawValue.startsWith('"')) {
    throw new FrontmatterProblem({ code: 'task-quoted', field: key, storedValue: rawValue }, lineNumber);
  }
  if (rawValue.startsWith('"')) {
    return jsonStringOf(rawValue, key, lineNumber);
  }
  return rawValue;
}

function jsonStringOf(rawValue: string, key: string, lineNumber: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new FrontmatterProblem({ code: 'quoted-value-unclosed', field: key, storedValue: rawValue }, lineNumber);
  }
  if (typeof parsed !== 'string') {
    throw new FrontmatterProblem({ code: 'quoted-value-not-text', field: key }, lineNumber);
  }
  return parsed;
}

function frontmatterFrom(
  knownValues: Map<string, KnownValue>,
  extra: Array<[key: string, rawValue: string]>,
  closingFenceLine: number,
): TicketFrontmatter {
  const typeText   = requiredText(knownValues, 'type', closingFenceLine);
  const statusText = requiredText(knownValues, 'status', closingFenceLine);

  const typeIsRetired = VocabularyUtil.retiredTicketTypeIsKnown(typeText);
  if (!typeIsRetired && !VocabularyUtil.ticketTypeIsKnown(typeText)) {
    throw new FrontmatterProblem({
      code: 'value-unknown', field: 'type', storedValue: typeText, vocabulary: 'ticket-type'
    }, lineOf(knownValues, 'type', closingFenceLine));
  }
  if (!VocabularyUtil.ticketStatusIsKnown(statusText)) {
    throw new FrontmatterProblem({ code: 'status-unknown', field: 'status', storedValue: statusText }, lineOf(knownValues, 'status', closingFenceLine));
  }

  const frontmatter: TicketFrontmatter = {
    id:          identifierFrom(knownValues, closingFenceLine),
    title:       requiredText(knownValues, 'title', closingFenceLine),
    type:        typeIsRetired ? 'ticket' : typeText,
    ...priorityField(knownValues),
    ...sizeField(knownValues),
    ...agentFields(knownValues),
    ...holdField(knownValues),
    status:      statusText,
    filed:       requiredText(knownValues, 'filed', closingFenceLine),
    updated:     requiredText(knownValues, 'updated', closingFenceLine),
    started:     nullableText(knownValues, 'started'),
    finished:    nullableText(knownValues, 'finished'),
    delivered:   nullableText(knownValues, 'delivered'),
    abandonedAt: nullableText(knownValues, 'abandonedAt'),
    ...optionalTextFields(knownValues),
    ...releasesGroupField(knownValues),
    ...dependencyField(knownValues),
    ...epicsField(knownValues),
    ...networkField(knownValues),
    ...entityFields(knownValues),
    ...ticketLinkFields(knownValues),
    ...findingFields(knownValues),
    ...contentHashField(knownValues),
    task:        nullableInteger(knownValues, 'task'),
    extra,
  };
  return frontmatter;
}

/** The id is stored padded however it was written, so `id: 003`, `id: "003"` and `id: 3` name the same ticket. */
function identifierFrom(knownValues: Map<string, KnownValue>, closingFenceLine: number): string {
  const text       = requiredText(knownValues, 'id', closingFenceLine);
  // Digits only first: the reference parser also takes `#3`, which is a way to name a ticket, not to write its id.
  const identifier = DIGITS_PATTERN.test(text) ? TicketIdUtil.parseTicketReference(text) : null;
  if (identifier === null) {
    throw new FrontmatterProblem({ code: 'id-not-a-ticket-number', field: 'id', storedValue: text }, lineOf(knownValues, 'id', closingFenceLine));
  }
  return identifier;
}

function optionalTextFields(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'group' | 'branch' | 'commit' | 'reason'> {
  const fields: Pick<TicketFrontmatter, 'group' | 'branch' | 'commit' | 'reason'> = {};

  for (const key of OPTIONAL_TEXT_KEYS) {
    const found = knownValues.get(key);
    // `group: null` reads as "no group", the same as the key being absent.
    if (found !== undefined && found.value !== null) {
      fields[key] = textOf(found, key);
    }
  }
  return fields;
}

/** An absent or `null` priority stays absent, so a ticket filed before priorities existed is not rewritten with one just for being read. */
function priorityField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'priority'> {
  const found = knownValues.get('priority');
  if (found === undefined || found.value === null) {
    return {};
  }
  const priorityText = textOf(found, 'priority');
  if (!VocabularyUtil.ticketPriorityIsKnown(priorityText)) {
    throw new FrontmatterProblem({
      code: 'value-unknown', field: 'priority', storedValue: priorityText, vocabulary: 'ticket-priority'
    }, found.line);
  }
  return { priority: priorityText };
}

/** Absent or `null` stays absent like `priority`; a size is written in capitals, and `m` is refused like any unknown value. */
function sizeField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'size'> {
  const found = knownValues.get('size');
  if (found === undefined || found.value === null) {
    return {};
  }
  const sizeText = textOf(found, 'size');
  if (!VocabularyUtil.ticketSizeIsKnown(sizeText)) {
    throw new FrontmatterProblem({
      code: 'value-unknown', field: 'size', storedValue: sizeText, vocabulary: 'ticket-size'
    }, found.line);
  }
  return { size: sizeText };
}

/** Absent or `null` stays absent like `priority`, so a ticket filed before agents were named is never rewritten with the default. */
function agentFields(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'model' | 'effort'> {
  const fields: Pick<TicketFrontmatter, 'model' | 'effort'> = {};
  const model  = knownValues.get('model');
  const effort = knownValues.get('effort');

  if (model !== undefined && model.value !== null) {
    const modelText = textOf(model, 'model');
    if (!VocabularyUtil.agentModelIsKnown(modelText)) {
      throw new FrontmatterProblem({
        code: 'value-unknown', field: 'model', storedValue: modelText, vocabulary: 'agent-model'
      }, model.line);
    }
    fields.model = modelText;
  }
  if (effort !== undefined && effort.value !== null) {
    const effortText = textOf(effort, 'effort');
    if (!VocabularyUtil.agentEffortIsKnown(effortText)) {
      throw new FrontmatterProblem({
        code: 'value-unknown', field: 'effort', storedValue: effortText, vocabulary: 'agent-effort'
      }, effort.line);
    }
    fields.effort = effortText;
  }
  return fields;
}

/** Absent or `null` is not the release ticket; `true`, quoted or not, is; anything else is refused rather than guessed at. */
function releasesGroupField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'releasesGroup'> {
  const found = knownValues.get(RELEASES_GROUP_KEY);
  if (found === undefined || found.value === null) {
    return {};
  }
  if (found.value !== RELEASES_GROUP_VALUE) {
    throw new FrontmatterProblem({ code: 'releases-group-not-true-or-null', field: RELEASES_GROUP_KEY, storedValue: String(found.value) }, found.line);
  }
  return { releasesGroup: true };
}

/** Absent or `null` is not held; any other value is held, a bare `hold:` included, and is the hold's reason. */
function holdField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'hold'> {
  const found = knownValues.get('hold');
  if (found === undefined || found.value === null) {
    return {};
  }
  return { hold: textOf(found, 'hold') };
}

/** Written `"003, 004"`; any mix of commas and spaces, with or without `#` or padding, reads the same. */
function dependencyField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'dependsOn'> {
  const found = knownValues.get('dependsOn');
  if (found === undefined || found.value === null) {
    return {};
  }
  const dependsOn: string[] = [];
  for (const reference of String(found.value).split(FRONTMATTER_LIST_SEPARATOR_PATTERN).filter((part) => part !== '')) {
    const identifier = TicketIdUtil.parseTicketReference(reference);
    if (identifier === null) {
      throw new FrontmatterProblem({ code: 'names-a-non-ticket-number', field: 'dependsOn', storedValue: reference }, found.line);
    }
    if (!dependsOn.includes(identifier)) {
      dependsOn.push(identifier);
    }
  }
  return dependsOn.length === 0 ? {} : { dependsOn };
}

/** Each written `"005"`, one ticket id read like a `dependsOn` entry; absent or `null` names no ticket. */
function ticketLinkFields(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, typeof TICKET_LINK_KEYS[number]> {
  const fields: Pick<TicketFrontmatter, typeof TICKET_LINK_KEYS[number]> = {};
  for (const key of TICKET_LINK_KEYS) {
    const found = knownValues.get(key);
    if (found === undefined || found.value === null) continue;
    const identifier = TicketIdUtil.parseTicketReference(String(found.value));
    if (identifier === null) {
      throw new FrontmatterProblem({ code: 'names-a-non-ticket-number', field: key, storedValue: String(found.value) }, found.line);
    }
    fields[key] = identifier;
  }
  return fields;
}

/** Written `"loyalty-programme, checkout-redesign"` and read like `dependsOn`; the order is kept, since the first key is the primary epic. */
function epicsField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'epics'> {
  const found = knownValues.get('epics');
  if (found === undefined || found.value === null) {
    return {};
  }
  const epics: string[] = [];
  for (const epicKey of String(found.value).split(FRONTMATTER_LIST_SEPARATOR_PATTERN).filter((part) => part !== '')) {
    if (!EpicUtil.epicKeyIsWellFormed(epicKey)) {
      throw new FrontmatterProblem({ code: 'names-a-non-epic-key', field: 'epics', storedValue: epicKey }, found.line);
    }
    if (!epics.includes(epicKey)) {
      epics.push(epicKey);
    }
  }
  return epics.length === 0 ? {} : { epics };
}

/**
 * Written `"api.example.com, cdn.example.com"` and read like `epics`; a domain that is not public makes the file malformed, so a hand edit
 * grants nothing local.
 */
function networkField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'network'> {
  const found = knownValues.get('network');
  if (found === undefined || found.value === null) {
    return {};
  }
  const network = NetworkDomainUtil.normalisedDomainListOf(String(found.value).split(FRONTMATTER_LIST_SEPARATOR_PATTERN));
  const nonPublicDomain = network.find((domain) => !NetworkDomainUtil.domainIsPublic(domain));
  if (nonPublicDomain !== undefined) {
    throw new FrontmatterProblem({ code: 'names-a-non-public-domain', field: 'network', storedValue: nonPublicDomain }, found.line);
  }
  return network.length === 0 ? {} : { network };
}

/**
 * Absent or `null` stays absent like `priority`. `entity` is one key and a blank one is malformed; `crosses` is written
 * `"design-system, contracts"` and read like `epics`. Whether a key names an entity of the pipeline is not the file's to say.
 */
function entityFields(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'entity' | 'crosses'> {
  const fields: Pick<TicketFrontmatter, 'entity' | 'crosses'> = {};
  const entity  = knownValues.get(ENTITY_KEY);
  const crosses = knownValues.get(CROSSES_KEY);

  if (entity !== undefined && entity.value !== null) {
    const entityKey = textOf(entity, ENTITY_KEY);
    if (entityKey.trim() === '') throw new FrontmatterProblem({ code: 'entity-blank', field: ENTITY_KEY }, entity.line);
    fields.entity = entityKey;
  }
  if (crosses !== undefined && crosses.value !== null) {
    const crossedEntityKeys: string[] = [];
    for (const crossedEntityKey of String(crosses.value).split(FRONTMATTER_LIST_SEPARATOR_PATTERN).filter((part) => part !== '')) {
      if (!crossedEntityKeys.includes(crossedEntityKey)) crossedEntityKeys.push(crossedEntityKey);
    }
    if (crossedEntityKeys.length > 0) fields.crosses = crossedEntityKeys;
  }
  return fields;
}

/** Absent or `null` stays absent like `priority`. */
function findingFields(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'filedByJob'> {
  const filedByJob = knownValues.get(FILED_BY_JOB_KEY);
  return filedByJob === undefined || filedByJob.value === null ? {} : { filedByJob: textOf(filedByJob, FILED_BY_JOB_KEY) };
}

/** Absent or `null` was never committed; any other value must be a content hash, since the store reads the kept content it names. */
function contentHashField(knownValues: Map<string, KnownValue>): Pick<TicketFrontmatter, 'contentHash'> {
  const found = knownValues.get(CONTENT_HASH_KEY);
  if (found === undefined || found.value === null) {
    return {};
  }
  const contentHash = textOf(found, CONTENT_HASH_KEY);
  if (!CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new FrontmatterProblem({ code: 'content-hash-malformed', field: CONTENT_HASH_KEY, storedValue: contentHash }, found.line);
  }
  return { contentHash };
}

function requiredText(knownValues: Map<string, KnownValue>, key: string, closingFenceLine: number): string {
  const found = knownValues.get(key);
  if (found === undefined) {
    throw new FrontmatterProblem({ code: 'key-missing', field: key }, closingFenceLine);
  }
  return textOf(found, key);
}

function nullableText(knownValues: Map<string, KnownValue>, key: string): string | null {
  const found = knownValues.get(key);
  if (found === undefined || found.value === null) {
    return null;
  }
  return textOf(found, key);
}

function nullableInteger(knownValues: Map<string, KnownValue>, key: string): number | null {
  const found = knownValues.get(key);
  if (found === undefined || found.value === null) {
    return null;
  }
  if (typeof found.value !== 'number') {
    throw new FrontmatterProblem({ code: 'not-a-whole-number', field: key, storedValue: String(found.value) }, found.line);
  }
  return found.value;
}

function textOf(found: KnownValue, key: string): string {
  if (found.value === null) {
    throw new FrontmatterProblem({ code: 'value-null', field: key }, found.line);
  }
  return String(found.value);
}

function lineOf(knownValues: Map<string, KnownValue>, key: string, closingFenceLine: number): number {
  return knownValues.get(key)?.line ?? closingFenceLine;
}

function nullableTextLiteral(value: string | null): string {
  return value === null ? 'null' : JSON.stringify(value);
}

function extraLineOf(key: string, rawValue: string): string {
  if (key === BLANK_LINE_KEY) {
    return '';
  }
  if (key === COMMENT_KEY) {
    return rawValue === '' ? COMMENT_KEY : `${COMMENT_KEY} ${rawValue}`;
  }
  return rawValue === '' ? `${key}:` : `${key}: ${rawValue}`;
}

export const TicketDocumentUtil = { frontmatterTextWithTextValueOf, parsedTicketDocumentOf, ticketDocumentTextOf } as const;
