/**
 * "What the plan names", pure: the effect reading's entries as a folder tree of the repository, each entry under its folder with its
 * change mark and reference number, an ambiguous entry under the folder of each candidate, and the files one reference changes alike in
 * one folder folded into one row; the legend with a count per change; the unresolved entries with their reason and a hint; and the line
 * that says what the reading read and how long it took.
 */
import type { BoardEffectChange }                                    from '../../../@types/board/BoardVocabulary.ts';
import type { BoardEffectEntryDocument, BoardEffectReadingDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import type { ReferenceMark }                                        from './DocumentBlocks.tsx';

export const EFFECT_SIGILS: Readonly<Record<BoardEffectChange, string>> = {
  adds: '+', changes: '~', removes: '−', unresolved: '?'
};

const CHANGE_WORDS: Readonly<Record<BoardEffectChange, string>> = {
  adds: 'adds', changes: 'changes', removes: 'removes', unresolved: 'unresolved'
};

const LEGEND_ORDER: readonly BoardEffectChange[] = ['adds', 'changes', 'removes', 'unresolved'];

const MILLISECONDS_PER_SECOND = 1000;

const PATH_SEPARATOR = '/';

export interface EffectEntryRow {
  readonly kind:      'entry';
  readonly key:       string;
  readonly depth:     number;
  readonly name:      string;
  /** What a folded row holds, `7 files`; `null` for one file. */
  readonly fileCount: string | null;
  readonly change:    BoardEffectChange;
  readonly sigil:     string;
  readonly reference: number;
  readonly detail:    string;
  /** What the change makes of the file, shown after its name: `→ v2`; `null` where the detail only describes it. */
  readonly becomes:   string | null;
}

export type EffectTreeRow = { readonly kind: 'folder'; readonly key: string; readonly depth: number; readonly name: string } | EffectEntryRow;

export interface EffectLegendItem {
  readonly change: BoardEffectChange;
  readonly sigil:  string;
  readonly word:   string;
  readonly count:  number;
}

export interface UnresolvedItem {
  readonly key:       string;
  readonly reference: number;
  /** The path the plan named, or its words where it named no path: "the settings page". */
  readonly named:     string;
  readonly reason:    string;
  readonly hint:      string;
}

export interface EffectPaneModel {
  readonly sourceLine: string;
  readonly rows:       readonly EffectTreeRow[];
  readonly legend:     readonly EffectLegendItem[];
  readonly unresolved: readonly UnresolvedItem[];
}

interface PlacedEntry {
  readonly entry:  BoardEffectEntryDocument;
  readonly folder: readonly string[];
  readonly name:   string;
}

function segmentsOf(path: string): string[] {
  return path.split(PATH_SEPARATOR).filter((segment) => segment !== '');
}

/** Each place an entry stands in the tree: its own path, or, for an ambiguous one, each candidate's; a no-match entry stands nowhere. */
function placesOf(entry: BoardEffectEntryDocument): PlacedEntry[] {
  const paths = entry.unresolvedReason === 'ambiguous' && entry.candidates.length > 0 ? entry.candidates : [entry.path];
  if (entry.unresolvedReason === 'no-match') return [];
  return paths.flatMap((path) => {
    const segments = segmentsOf(path);
    const name = segments.at(-1);
    return name === undefined ? [] : [{ entry, folder: segments.slice(0, -1), name }];
  });
}

interface FolderNode {
  readonly path:    readonly string[];
  readonly folders: Map<string, FolderNode>;
  readonly places:  PlacedEntry[];
}

function folderTreeOf(placed: readonly PlacedEntry[]): FolderNode {
  const root: FolderNode = { path: [], folders: new Map(), places: [] };
  for (const place of placed) {
    let node = root;
    for (const segment of place.folder) {
      const known = node.folders.get(segment);
      const child = known ?? { path: [...node.path, segment], folders: new Map<string, FolderNode>(), places: [] };
      if (known === undefined) node.folders.set(segment, child);
      node = child;
    }
    node.places.push(place);
  }
  return root;
}

/** A folder that holds only one folder shares its row: `apps/storefront/src/`. */
function shownFolderOf(folder: FolderNode, parentDepth: number): { readonly folder: FolderNode; readonly name: string } {
  let shown = folder;
  while (shown.places.length === 0 && shown.folders.size === 1) {
    const [only] = shown.folders.values();
    if (only === undefined) break;
    shown = only;
  }
  return { folder: shown, name: `${shown.path.slice(parentDepth).join(PATH_SEPARATOR)}${PATH_SEPARATOR}` };
}

function changeOf(entry: BoardEffectEntryDocument): BoardEffectChange {
  return entry.unresolvedReason === null ? entry.change : 'unresolved';
}

function entryRowOf(place: PlacedEntry, depth: number): EffectEntryRow {
  const { entry, folder, name } = place;
  const change = changeOf(entry);
  return {
    kind:      'entry',
    key:       `entry:${entry.reference}:${[...folder, name].join(PATH_SEPARATOR)}`,
    depth,
    name,
    fileCount: null,
    change,
    sigil:     EFFECT_SIGILS[change],
    reference: entry.reference,
    detail:    entry.detail,
    becomes:   entry.detail.startsWith(BECOMES_MARK) ? entry.detail : null,
  };
}

const BECOMES_MARK = '→';

/** The last capitalised word every file name ends on before its extension, as `page` for `AccountPage.tsx` and `BillingPage.tsx`. */
function sharedKindOf(names: readonly string[]): string | null {
  const kinds = names.map((name) => /([A-Z][a-z]+)\.[^.]+$/u.exec(name)?.[1] ?? null);
  const [first] = kinds;
  return first !== null && first !== undefined && kinds.every((kind) => kind === first) ? first.toLowerCase() : null;
}

/** The files one reference changes alike in one folder share a row: `every page · 7 files`, `every file` where they share no kind. */
function entryRowsOf(places: readonly PlacedEntry[], depth: number): EffectTreeRow[] {
  const alike = new Map<string, PlacedEntry[]>();
  for (const place of [...places].sort((a, b) => a.entry.reference - b.entry.reference || a.name.localeCompare(b.name))) {
    const alikeKey = `${place.entry.reference}:${changeOf(place.entry)}`;
    alike.set(alikeKey, [...alike.get(alikeKey) ?? [], place]);
  }
  return [...alike.values()].flatMap((group): EffectTreeRow[] => {
    const [first] = group;
    if (first === undefined) return [];
    if (group.length === 1) return [entryRowOf(first, depth)];
    return [{
      ...entryRowOf(first, depth),
      key:       `entry:${first.entry.reference}:${first.folder.join(PATH_SEPARATOR)}${PATH_SEPARATOR}*`,
      name:      `every ${sharedKindOf(group.map((place) => place.name)) ?? 'file'}`,
      fileCount: `${group.length} files`,
    }];
  });
}

/** The first reference a folder holds, in it or below it, which orders the folders as the plan names them. */
function firstReferenceOf(folder: FolderNode): number {
  return Math.min(...folder.places.map((place) => place.entry.reference), ...[...folder.folders.values()].map(firstReferenceOf));
}

function folderRowsOf(folders: readonly FolderNode[], parentDepth: number, depth: number): EffectTreeRow[] {
  return folders.flatMap((child): EffectTreeRow[] => {
    const shown = shownFolderOf(child, parentDepth);
    return [
      {
        kind: 'folder', key: `folder:${shown.folder.path.join(PATH_SEPARATOR)}`, depth, name: shown.name
      },
      ...rowsUnder(shown.folder, depth + 1),
    ];
  });
}

function rowsUnder(folder: FolderNode, depth: number): EffectTreeRow[] {
  const folders = [...folder.folders.values()]
    .sort((a, b) => firstReferenceOf(a) - firstReferenceOf(b) || a.path.join(PATH_SEPARATOR).localeCompare(b.path.join(PATH_SEPARATOR)));
  return [...folderRowsOf(folders, folder.path.length, depth), ...entryRowsOf(folder.places, depth)];
}

/**
 * The tree: a top folder of the repository that holds no file of its own lends its name to each of its folders, so `packages/contracts/`
 * and `packages/shared/utils/` are two roots, in path order. Below a root each folder comes in the order the plan names it, before what
 * it holds, its folders before its files, and each one step in from its folder.
 */
function rowsOf(entries: readonly BoardEffectEntryDocument[]): EffectTreeRow[] {
  const repository = folderTreeOf(entries.flatMap(placesOf));
  const roots = [...repository.folders.values()]
    .flatMap((top) => (top.places.length === 0 ? [...top.folders.values()] : [top]))
    .sort((a, b) => a.path.join(PATH_SEPARATOR).localeCompare(b.path.join(PATH_SEPARATOR)));
  return [...folderRowsOf(roots, 0, 0), ...entryRowsOf(repository.places, 0)];
}

/** The legend counts the places the plan names, so a reference that changes 7 files counts once. */
function legendOf(entries: readonly BoardEffectEntryDocument[]): EffectLegendItem[] {
  return LEGEND_ORDER.map((change) => ({
    change,
    sigil: EFFECT_SIGILS[change],
    word:  CHANGE_WORDS[change],
    count: new Set(entries.filter((entry) => changeOf(entry) === change).map((entry) => entry.reference)).size,
  }));
}

function unresolvedItemOf(entry: BoardEffectEntryDocument): UnresolvedItem {
  const named = entry.path.includes(PATH_SEPARATOR) || entry.path.includes('.') ? entry.path : `“${entry.path}”`;
  if (entry.unresolvedReason === 'ambiguous') {
    return {
      key:       `${entry.reference}`,
      reference: entry.reference,
      named,
      reason:    `Could be either of ${entry.candidates.length} files in the tree.`,
      hint:      'Name the full path in the plan.',
    };
  }
  return {
    key: `${entry.reference}`, reference: entry.reference, named, reason: 'No matching file or folder.', hint: 'Say where it lives, or that it is new.',
  };
}

function durationTextOf(milliseconds: number | null): string | null {
  return milliseconds === null ? null : `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(1)}s`;
}

function sourceLineOf(reading: BoardEffectReadingDocument): string {
  switch (reading.state) {
    case 'reading':
      return `Reading plan v${reading.versionNumber} against the file tree. No code read.`;
    case 'failed':
      return `The reading of v${reading.versionNumber} failed. Refresh to read it again.`;
    case 'read': {
      const duration = durationTextOf(reading.durationMilliseconds);
      return `From ${reading.document} v${reading.versionNumber} and the file tree only. No code read.${duration === null ? '' : ` ${duration}`}`;
    }
  }
}

function paneOf(reading: BoardEffectReadingDocument): EffectPaneModel {
  const unresolvedEntries = reading.entries.filter((entry) => entry.unresolvedReason !== null || entry.change === 'unresolved');
  return {
    sourceLine: sourceLineOf(reading),
    rows:       reading.state === 'read' ? rowsOf(reading.entries) : [],
    legend:     legendOf(reading.entries),
    unresolved: reading.state === 'read' ? unresolvedEntries.map(unresolvedItemOf) : [],
  };
}

/**
 * The references the plan's text carries, each with whether its place is unresolved, for the marks after its sentences, and the words
 * and lines it quotes, which an unresolved one underlines.
 */
function referenceMarksOf(reading: BoardEffectReadingDocument | null): ReferenceMark[] {
  if (reading?.state !== 'read') return [];
  const unresolvedReferences = new Set(reading.entries.filter((entry) => entry.unresolvedReason !== null || entry.change === 'unresolved').map((entry) => entry.reference));
  return reading.references.map((reference) => ({
    reference:  reference.reference,
    line:       reference.lines.to,
    unresolved: unresolvedReferences.has(reference.reference),
    quote:      reference.quote,
    quoteLines: reference.lines,
  }));
}

export const EffectTreeModel = Object.freeze({
  paneOf, rowsOf, legendOf, referenceMarksOf, durationTextOf
});
