/**
 * The agent tools' model, pure: each tool as a row, the list a person edits, and the command that keeps it. Git is always approved, and
 * a tool the machine lacks cannot be until it is installed. The list is not what keeps agents inside the repository; the sandbox is.
 */
import { PAGE_CONTRACT_VERSIONS }                                                           from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardAgentToolDocument, BoardAgentToolUseDocument, BoardToolRequestDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                                        from '../../../../@types/board/BoardCommandDocument.ts';
import { CountTextUtil }                                                                    from '../../../../shared/utils/CountTextUtil.ts';
import type { ForgeRefusalFacts }                                                           from '../../../api/RefusalOf.ts';

const COMMAND_VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

/** The draft a setup's tools are an edit of, or the forge's stored pipeline. */
export type ToolListTarget = { readonly kind: 'draft'; readonly setupId: string; readonly draftRevision: number } | { readonly kind: 'pipeline' };

export interface ToolRow {
  readonly name:      string;
  readonly foundAt:   string;
  readonly isMissing: boolean;
  readonly usedBy:    string;
  /** Git, which every job runs: always on the list. */
  readonly isLocked:  boolean;
}

/** What the person edits: the names ticked, and the tools added, which forge finds when the list is kept unless User chose a program. */
export interface ToolListEdit {
  readonly approvedNames: readonly string[];
  readonly addedTools:    readonly BoardToolRequestDocument[];
}

const TOOL_NOT_FOUND_CODE = 'tool-not-found';

/** Drops the forge's own list: the tools follow the pipeline's programs again. */
export const TOOLS_FOLLOW_THE_PIPELINE_COMMAND: BoardCommandDocument = { ...COMMAND_VERSION, kind: 'pipeline-tools-set', tools: null };

export const NOT_ON_THIS_MACHINE = 'not on this machine';

export const SANDBOX_NOTE = 'Agents get these programs\' folders on their search path and nothing else of yours. The sandbox, not this list, is '
  + 'what keeps agents inside the repository.';

function useTextOf(use: BoardAgentToolUseDocument): string {
  if (use.kind === 'every-job') return 'every job';
  const where = use.kind === 'gate' ? 'gate' : 'prepare step';
  return use.entity === null ? `${where} ${use.name ?? ''}` : `${where} ${use.name ?? ''} of ${use.entity}`;
}

function isLocked(tool: BoardAgentToolDocument): boolean {
  return tool.usedBy.some((use) => use.kind === 'every-job');
}

function rowsOf(tools: readonly BoardAgentToolDocument[]): readonly ToolRow[] {
  return tools.map((tool) => ({
    name:      tool.name,
    foundAt:   tool.path ?? NOT_ON_THIS_MACHINE,
    isMissing: tool.path === null,
    usedBy:    tool.usedBy.length === 0 ? 'added by hand' : tool.usedBy.map(useTextOf).join(', '),
    isLocked:  isLocked(tool),
  }));
}

function editOf(tools: readonly BoardAgentToolDocument[]): ToolListEdit {
  return { approvedNames: tools.filter((tool) => tool.approved).map((tool) => tool.name), addedTools: [] };
}

function withApproval(edit: ToolListEdit, name: string, approved: boolean): ToolListEdit {
  const others = edit.approvedNames.filter((approvedName) => approvedName !== name);
  return { ...edit, approvedNames: approved ? [...others, name] : others };
}

/** A name already listed or added, or no name at all, adds nothing. */
function withAdded(edit: ToolListEdit, tools: readonly BoardAgentToolDocument[], typedName: string): ToolListEdit {
  const name = typedName.trim();
  if (name === '' || tools.some((tool) => tool.name === name) || edit.addedTools.some((added) => added.name === name)) return edit;
  return { ...edit, addedTools: [...edit.addedTools, { name, path: null }] };
}

/** The added tool named, at the program User chose for it. */
function withChosenPath(edit: ToolListEdit, name: string, path: string): ToolListEdit {
  return { ...edit, addedTools: edit.addedTools.map((added) => (added.name === name ? { name, path } : added)) };
}

/** The added tool forge's refusal says it did not find, `null` for any other refusal. */
function unfoundAddedToolOf(edit: ToolListEdit, forgeRefusal: ForgeRefusalFacts | null): string | null {
  if (forgeRefusal?.code !== TOOL_NOT_FOUND_CODE) return null;
  const { name } = forgeRefusal.fields;
  return typeof name === 'string' && edit.addedTools.some((added) => added.name === name) ? name : null;
}

/** The tools as the command names them: each approved one at its found path, then each added one at its chosen program or for forge to find. */
function requestsOf(tools: readonly BoardAgentToolDocument[], edit: ToolListEdit): readonly BoardToolRequestDocument[] {
  const approved = tools.filter((tool) => isLocked(tool) || (tool.path !== null && edit.approvedNames.includes(tool.name)));
  return [...approved.map((tool) => ({ name: tool.name, path: tool.path })), ...edit.addedTools];
}

function editsAreEqual(first: ToolListEdit, second: ToolListEdit): boolean {
  return first.addedTools.length === second.addedTools.length && first.addedTools.every((added) => second.addedTools.includes(added))
    && first.approvedNames.length === second.approvedNames.length && first.approvedNames.every((name) => second.approvedNames.includes(name));
}

/** `null` while the edit is the list as served: there is nothing to keep. */
function keepCommandOf(target: ToolListTarget, tools: readonly BoardAgentToolDocument[], edit: ToolListEdit): BoardCommandDocument | null {
  if (editsAreEqual(edit, editOf(tools))) return null;
  const value = requestsOf(tools, edit);
  if (target.kind === 'pipeline') return { ...COMMAND_VERSION, kind: 'pipeline-tools-set', tools: value };
  return {
    ...COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: target.setupId, draftRevision: target.draftRevision, edits: [{ target: 'tools', value }], isACopy: false
  };
}

/** "4 tools · 1 missing", the footer's and the settings' summary. */
function summaryOf(tools: readonly BoardAgentToolDocument[]): string {
  const missingCount = tools.filter((tool) => tool.path === null).length;
  const count = CountTextUtil.countedPhrase(tools.length, 'tool', 'tools');
  return missingCount === 0 ? count : `${count} · ${missingCount} missing`;
}

/** "bun · git · gh", the approved tools' names. */
function approvedNamesTextOf(tools: readonly BoardAgentToolDocument[]): string {
  const names = tools.filter((tool) => tool.approved).map((tool) => tool.name);
  return names.length === 0 ? 'None listed' : names.join(' · ');
}

/** The missing tools' sentence under the list, `null` while the machine has every one. */
function missingNoteOf(tools: readonly BoardAgentToolDocument[]): string | null {
  const missing = tools.filter((tool) => tool.path === null);
  if (missing.length === 0) return null;
  const uses = missing.map((tool) => `${rowsOf([tool])[0]?.usedBy ?? ''} needs ${tool.name}`).join('; ');
  return `${uses}, which this machine lacks: install it, or drop what needs it from the design.`;
}

export const ToolListModel = Object.freeze({
  rowsOf,
  editOf,
  withApproval,
  withAdded,
  withChosenPath,
  unfoundAddedToolOf,
  requestsOf,
  keepCommandOf,
  summaryOf,
  approvedNamesTextOf,
  missingNoteOf,
});
