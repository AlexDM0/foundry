/**
 * "What the plan names", pure: the effect reading's entries as a folder tree of the repository, each entry under its folder with its
 * change mark and reference number, an ambiguous entry under the folder of each candidate; the legend with a count per change; the
 * unresolved entries with their reason and a hint; and the line that says what the reading read and how long it took.
 */
import type { BoardEffectChange }                                    from '../../../@types/board/BoardVocabulary.ts';
import type { BoardEffectEntryDocument, BoardEffectReadingDocument } from '../../../@types/board/TicketDocumentsDocument.ts';

export const EFFECT_SIGILS: Readonly<Record<BoardEffectChange, string>> = {
  adds: '+', changes: '~', removes: '−', unresolved: '?'
};

const CHANGE_WORDS: Readonly<Record<BoardEffectChange, string>> = {
  adds: 'adds', changes: 'changes', removes: 'removes', unresolved: 'unresolved'
};

const LEGEND_ORDER: readonly BoardEffectChange[] = ['adds', 'changes', 'removes', 'unresolved'];

const MILLISECONDS_PER_SECOND = 1000;

const PATH_SEPARATOR = '/';

export type EffectTreeRow =
  | { readonly kind: 'folder'; readonly key: string; readonly depth: number; readonly name: string }
  | {
    readonly kind:      'entry';
    readonly key:       string;
    readonly depth:     number;
    readonly name:      string;
    readonly change:    BoardEffectChange;
    readonly sigil:     string;
    readonly reference: number;
    readonly detail:    string;
  };

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

function folderKeyOf(folder: readonly string[]): string {
  return folder.join(PATH_SEPARATOR);
}

/**
 * The tree in path order: a row for each folder before what it holds, named after the folder it shares a start with, and indented under it;
 * each entry one step in from its folder.
 */
function rowsOf(entries: readonly BoardEffectEntryDocument[]): EffectTreeRow[] {
  const pathOf = (place: PlacedEntry): string => [...place.folder, place.name].join(PATH_SEPARATOR);
  const placed = entries.flatMap(placesOf).sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
  const rows: EffectTreeRow[] = [];
  let openFolder: readonly string[] | null = null;
  let openFolderDepth = 0;
  for (const place of placed) {
    const { entry, folder, name } = place;
    if (openFolder === null || folderKeyOf(openFolder) !== folderKeyOf(folder)) {
      const previous: readonly string[] = openFolder ?? [];
      let shared = 0;
      while (shared < previous.length && shared < folder.length && previous[shared] === folder[shared]) shared += 1;
      openFolderDepth = shared === 0 ? 0 : 1;
      if (folder.length > 0) {
        rows.push({
          kind: 'folder', key: `folder:${folderKeyOf(folder)}`, depth: openFolderDepth, name: `${folder.slice(shared).join(PATH_SEPARATOR)}${PATH_SEPARATOR}`
        });
      }
      openFolder = folder;
    }
    const change = entry.unresolvedReason === null ? entry.change : 'unresolved';
    rows.push({
      kind:      'entry',
      key:       `entry:${entry.reference}:${pathOf(place)}`,
      depth:     folder.length === 0 ? 0 : openFolderDepth + 1,
      name,
      change,
      sigil:     EFFECT_SIGILS[change],
      reference: entry.reference,
      detail:    entry.detail,
    });
  }
  return rows;
}

function legendOf(entries: readonly BoardEffectEntryDocument[]): EffectLegendItem[] {
  return LEGEND_ORDER.map((change) => ({
    change,
    sigil: EFFECT_SIGILS[change],
    word:  CHANGE_WORDS[change],
    count: entries.filter((entry) => (entry.unresolvedReason === null ? entry.change : 'unresolved') === change).length,
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

/** The references the plan's text carries, each with whether its place is unresolved, for the marks after its sentences. */
function referenceMarksOf(reading: BoardEffectReadingDocument | null): { readonly reference: number; readonly line: number; readonly unresolved: boolean }[] {
  if (reading?.state !== 'read') return [];
  const unresolvedReferences = new Set(reading.entries.filter((entry) => entry.unresolvedReason !== null || entry.change === 'unresolved').map((entry) => entry.reference));
  return reading.references.map((reference) => ({ reference: reference.reference, line: reference.lines.to, unresolved: unresolvedReferences.has(reference.reference) }));
}

export const EffectTreeModel = Object.freeze({
  paneOf, rowsOf, legendOf, referenceMarksOf, durationTextOf
});
