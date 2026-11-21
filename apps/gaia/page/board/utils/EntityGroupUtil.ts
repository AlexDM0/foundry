/**
 * How the board groups a forge's entities wherever it lists them, as the pipeline's level rail and the Kanban's entity filter and
 * swimlanes do: apps, then packages, then the root, each group under its label and in the order given; the kind's own words; and the
 * filter that keeps what holds its text.
 */
import type { BoardEntityKind } from '../../@types/board/BoardVocabulary.ts';

export interface EntityGroup<Item> {
  readonly groupKind: BoardEntityKind;
  readonly label:     string;
  readonly items:     readonly Item[];
}

const GROUP_ORDER: readonly BoardEntityKind[] = ['app', 'package', 'root'];

const GROUP_LABELS: Readonly<Record<BoardEntityKind, string>> = Object.freeze({ app: 'Apps', package: 'Packages', root: 'Root' });

const KIND_TEXTS: Readonly<Record<BoardEntityKind, string>> = Object.freeze({ app: 'app', package: 'package', root: 'every other path' });

/** The items in their groups, in the order given within each; an item of no kind, and a group with no item, are left out. */
function groupsOf<Item>(items: readonly Item[], kindOf: (item: Item) => BoardEntityKind | null): EntityGroup<Item>[] {
  return GROUP_ORDER
    .map((groupKind) => ({ groupKind, label: GROUP_LABELS[groupKind], items: items.filter((item) => kindOf(item) === groupKind) }))
    .filter((group) => group.items.length > 0);
}

/** "app", "package", "every other path". */
function kindTextOf(kind: BoardEntityKind): string {
  return KIND_TEXTS[kind];
}

/** Some text holds the filter's text, whatever the case; an empty filter keeps everything. */
function matchesFilter(texts: readonly string[], filterText: string): boolean {
  const needle = filterText.trim().toLowerCase();
  if (needle === '') return true;
  return texts.some((text) => text.toLowerCase().includes(needle));
}

export const EntityGroupUtil = Object.freeze({ groupsOf, kindTextOf, matchesFilter });
