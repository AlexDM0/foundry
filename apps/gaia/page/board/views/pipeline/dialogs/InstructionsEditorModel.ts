/**
 * The instruction list's model, pure: each entry as a row (its file name, the note on whose it is, its Edit link or the text Open shows),
 * the list after a remove, an added file or the constitution switched back on, and which roles may read the constitution. A row takes the
 * file name and text the Overseer resolved on main when the facts carry the same entry; an entry added in the dialog is worded here.
 */
import type { BoardInstructionDocument, BoardPipelineDefinitionDocument, BoardResolvedInstructionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { ConstitutionState }                                                                           from '../entities/ConstitutionStateTagModel.ts';
import type { StepDialogRole }                                                                              from './AgentStepDialogModel.ts';

/** Before Apply the draft constitution is this file; Apply commits it under the path the pipeline then names. */
const DRAFTED_CONSTITUTION_FILE_NAME = 'constitution.md';

const ROLES_OFFERED_THE_CONSTITUTION: readonly StepDialogRole[] = ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'];

/** A list's own brief where the role reads it alongside the reviewer's. */
const OWN_BRIEF_NOTES: Readonly<Partial<Record<StepDialogRole, string>>> = Object.freeze({
  reReviewer:         'only the re-reviewer',
  conflictReReviewer: 'only this re-review',
});

/** Where the constitution stands: its file name, whether it is still a draft or the installed default, and where its Edit link goes. */
export interface ConstitutionPlace {
  readonly fileName:        string;
  readonly isDrafted:       boolean;
  readonly readsTheDefault: boolean;
  readonly editHref:        string;
}

export interface InstructionRowView {
  readonly key:         string;
  readonly fileName:    string;
  readonly roleText:    string;
  readonly removeLabel: string;
  /** The constitution's row opens its editor. */
  readonly editHref:    string | null;
  /** The file's text on main for Open; null when the facts carry none. */
  readonly text:        string | null;
  readonly textIsCut:   boolean;
}

function sameEntry(first: BoardInstructionDocument, second: BoardInstructionDocument): boolean {
  if (first.kind === 'constitution' || second.kind === 'constitution') return first.kind === second.kind;
  if (first.kind === 'default-brief' || second.kind === 'default-brief') {
    return first.kind === 'default-brief' && second.kind === 'default-brief' && first.role === second.role;
  }
  return first.path === second.path;
}

const DEFAULT_CONSTITUTION_STATES: readonly ConstitutionState[] = ['default', 'not-started'];

/**
 * In single mode a pipeline that names no file has its constitution drafted; at an entity, the entity's own state says whether its
 * document is drafted, its file adopted, or the installed default read, and the Edit link opens that entity's document.
 */
function constitutionPlaceOf(draft: BoardPipelineDefinitionDocument | null, editHref: string, entityState: ConstitutionState | null = null): ConstitutionPlace {
  const path = draft?.constitutionPath ?? null;
  if (entityState !== null) {
    return {
      fileName:        path ?? DRAFTED_CONSTITUTION_FILE_NAME,
      isDrafted:       entityState === 'drafted',
      readsTheDefault: DEFAULT_CONSTITUTION_STATES.includes(entityState),
      editHref,
    };
  }
  return path === null
    ? {
      fileName: DRAFTED_CONSTITUTION_FILE_NAME, isDrafted: true, readsTheDefault: false, editHref
    }
    : {
      fileName: path, isDrafted: false, readsTheDefault: false, editHref
    };
}

function fileNameOf(entry: BoardInstructionDocument, constitution: ConstitutionPlace): string {
  switch (entry.kind) {
    case 'constitution':
      return constitution.fileName;
    case 'default-brief':
      return `${entry.role}.md`;
    case 'file':
      return entry.path;
  }
}

function roleTextOf(entry: BoardInstructionDocument, listRole: StepDialogRole, constitution: ConstitutionPlace): string {
  switch (entry.kind) {
    case 'constitution':
      if (constitution.isDrafted) return 'constitution · drafted';
      return constitution.readsTheDefault ? 'constitution · default' : 'constitution';
    case 'default-brief':
      return entry.role === listRole ? OWN_BRIEF_NOTES[listRole] ?? 'default' : 'default';
    case 'file':
      return 'added';
  }
}

function rowsOf(
  entries: readonly BoardInstructionDocument[],
  listRole: StepDialogRole,
  constitution: ConstitutionPlace,
  resolvedEntries: readonly BoardResolvedInstructionDocument[],
): InstructionRowView[] {
  return entries.map((entry, i) => {
    const resolved = resolvedEntries.find((candidate) => sameEntry(candidate.entry, entry)) ?? null;
    const fileName = entry.kind === 'constitution' ? constitution.fileName : resolved?.fileName ?? fileNameOf(entry, constitution);
    return {
      key:         `${i}:${fileNameOf(entry, constitution)}`,
      fileName,
      roleText:    roleTextOf(entry, listRole, constitution),
      removeLabel: `Remove ${fileName}`,
      editHref:    entry.kind === 'constitution' ? constitution.editHref : null,
      text:        entry.kind === 'constitution' ? null : resolved?.text ?? null,
      textIsCut:   resolved?.textIsCut ?? false,
    };
  });
}

function withoutEntryAt(entries: readonly BoardInstructionDocument[], index: number): BoardInstructionDocument[] {
  return entries.filter((_entry, i) => i !== index);
}

/** The constitution goes back at the top: it is read before every brief. */
function withConstitution(entries: readonly BoardInstructionDocument[]): BoardInstructionDocument[] {
  return [{ kind: 'constitution' }, ...entries.filter((entry) => entry.kind !== 'constitution')];
}

/** A path added at the end; a blank path or one the list already reads changes nothing. */
function withFile(entries: readonly BoardInstructionDocument[], typedPath: string): BoardInstructionDocument[] {
  const path = typedPath.trim();
  if (path === '' || entries.some((entry) => sameEntry(entry, { kind: 'file', path }))) return [...entries];
  return [...entries, { kind: 'file', path }];
}

function includesConstitution(entries: readonly BoardInstructionDocument[]): boolean {
  return entries.some((entry) => entry.kind === 'constitution');
}

function offersConstitution(role: StepDialogRole): boolean {
  return ROLES_OFFERED_THE_CONSTITUTION.includes(role);
}

export const InstructionsEditorModel = Object.freeze({
  constitutionPlaceOf,
  includesConstitution,
  offersConstitution,
  rowsOf,
  withConstitution,
  withFile,
  withoutEntryAt,
});
