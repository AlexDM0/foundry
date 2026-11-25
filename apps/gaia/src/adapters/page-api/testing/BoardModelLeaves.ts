/**
 * The board model a scratch forge recorded, and the leaves of a mapped document by their paths, so a spec can hold that every value of the
 * model reaches the page's board contract under its page name. Test-only.
 */
import type { ForgeBoard }                              from '../../../shared/@types/board/ForgeBoard.ts';
import { BoardStateIngestion }                          from '../../forge-api/BoardStateIngestion.ts';
import { RECORDED_TRACKER_ID, recordedBoardDocumentOf } from '../../forge-api/testing/BoardDocuments.ts';

/** The model's keys the page contract names otherwise: a forge sentence arrives in the page's `text`, Markdown in the HTML field it renders into. */
const PAGE_NAME_OF_MODEL_KEY: Readonly<Record<string, string>> = {
  sentence:             'text',
  causeSentence:        'causeText',
  bodyMarkdown:         'bodyHtml',
  descriptionMarkdown:  'descriptionHtml',
  constitutionMarkdown: 'constitutionHtml',
};

/** A rendering that leaves the Markdown as it is, so a spec that compares leaves sees each Markdown arrive in its HTML field. */
export function markdownLeftAsWritten(markdown: string): string {
  return markdown;
}

/** The keys only the page contract carries: a document's version, who refused, and Gaia's own count of other forges following the machine's program. */
const PAGE_ONLY_KEYS: ReadonlySet<string> = new Set(['boardVersion', 'ticketDocumentsVersion', 'refusedBy', 'otherForgesFollowingMachine']);

const EMPTY_LIST_LEAF = '[]';
const EMPTY_RECORD_LEAF = '{}';

export async function recordedBoardModel(situation: Parameters<typeof recordedBoardDocumentOf>[0] = 'board-at-work'): Promise<ForgeBoard> {
  const reading = new BoardStateIngestion().boardOf(RECORDED_TRACKER_ID, await recordedBoardDocumentOf(situation));
  if (reading.board === null) throw new Error(`The recorded board did not read: ${reading.reason.invalidKeys.join(', ')}.`);
  return reading.board;
}

function pathOf(parentPath: string, key: string): string {
  return parentPath === '' ? key : `${parentPath}.${key}`;
}

function collectLeaves(value: unknown, path: string, keyOf: (key: string) => string | null, leaves: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) leaves.set(path, EMPTY_LIST_LEAF);
    value.forEach((item: unknown, i) => collectLeaves(item, `${path}[${i}]`, keyOf, leaves));
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) leaves.set(path, EMPTY_RECORD_LEAF);
    for (const [key, entryValue] of entries) {
      const leafKey = keyOf(key);
      if (leafKey !== null) collectLeaves(entryValue, pathOf(path, leafKey), keyOf, leaves);
    }
    return;
  }
  leaves.set(path, value);
}

/** Every leaf of a model value, each key under the name the page contract gives it. */
export function modelLeavesOf(model: unknown): ReadonlyMap<string, unknown> {
  const leaves = new Map<string, unknown>();
  collectLeaves(model, '', (key) => Object.hasOwn(PAGE_NAME_OF_MODEL_KEY, key) ? PAGE_NAME_OF_MODEL_KEY[key] ?? key : key, leaves);
  return leaves;
}

/** Every leaf of a page document but those only the page contract carries. */
export function pageLeavesOf(document: unknown): ReadonlyMap<string, unknown> {
  const leaves = new Map<string, unknown>();
  collectLeaves(document, '', (key) => PAGE_ONLY_KEYS.has(key) ? null : key, leaves);
  return leaves;
}
