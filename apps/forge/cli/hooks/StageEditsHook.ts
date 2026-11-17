/**
 * `hook stage-edits --allow <folder>…`, the `PreToolUse` guard an Overseer renders into the settings of a job of an entity (E18). The deny
 * rules name the worktree's paths outside the stage as they stood at launch, so a name made later in a folder on the way to a stage folder
 * (the worktree root, `/apps`) would reach Customs; this denies an Edit or Write of it at once. It exits 0 whatever happens and answers deny
 * on any failure, since a hook that errors would let the call through.
 */
import {
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path';

import { refusalIsOperationRefusal } from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }       from '../CommandContext.ts';
import type { ArgumentParser }       from '../arguments/ArgumentParser.ts';

const ALLOW_OPTION_NAME = 'allow';

const USAGE = `${PRODUCT_NAMES.PROGRAM} hook stage-edits --allow <folder> [--allow <folder>]…  (the PreToolUse hook JSON arrives on standard input)`;
/** The tools the guard checks; any other tool is denied, as it may change a file by a field the guard does not read. */
const FILE_CHANGING_TOOL_NAMES: readonly string[] = ['Edit', 'Write'];

type Verdict = { kind: 'pass' } | { kind: 'deny'; reason: string };

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function liesInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder);
}

/** The call's path made absolute against the session's `cwd`; `null` when it names no path, or a relative one with no absolute `cwd`. */
function targetPathOf(hookInput: Record<string, unknown>, toolInput: Record<string, unknown>): string | null {
  const filePath = toolInput['file_path'];
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (isAbsolute(filePath)) return resolve(filePath);
  const workingDirectory = hookInput['cwd'];
  return typeof workingDirectory === 'string' && isAbsolute(workingDirectory) ? resolve(workingDirectory, filePath) : null;
}

function verdictOf(hookInputText: string, stageFolders: readonly string[]): Verdict {
  if (stageFolders.length === 0) return { kind: 'deny', reason: 'the guard was given no stage folder' };
  if (!stageFolders.every((folder) => isAbsolute(folder))) return { kind: 'deny', reason: 'the guard was given a stage folder that is not an absolute path' };
  const hookInput = recordOf(JSON.parse(hookInputText));
  if (hookInput === null) return { kind: 'deny', reason: 'the hook input is not a JSON object' };
  const toolName = hookInput['tool_name'];
  if (typeof toolName !== 'string' || !FILE_CHANGING_TOOL_NAMES.includes(toolName)) {
    return { kind: 'deny', reason: `the guard does not know the tool ${typeof toolName === 'string' ? toolName : 'it names'}, which may change a file` };
  }
  const targetPath = targetPathOf(hookInput, recordOf(hookInput['tool_input']) ?? {});
  if (targetPath === null) return { kind: 'deny', reason: 'its file_path is not a path the guard can place' };
  if (stageFolders.some((folder) => liesInside(targetPath, resolve(folder)))) return { kind: 'pass' };
  return { kind: 'deny', reason: `it changes ${targetPath}, and this stage may change only ${stageFolders.join(', ')}` };
}

function denialDocumentOf(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName:            'PreToolUse',
      permissionDecision:       'deny',
      permissionDecisionReason: `Denied by the folders of this job's stage: ${reason}.`,
    },
  });
}

/** A pass prints nothing, so the call goes on to the session's own permission rules; it never grants anything. */
export async function guardTheStageEdits(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  try {
    commandArguments.rejectUnknownOptions([ALLOW_OPTION_NAME], USAGE);
  } catch (refusal) {
    if (!refusalIsOperationRefusal(refusal)) throw refusal;
    context.standardOutput(denialDocumentOf('the guard was given an option it does not know'));
    return;
  }
  let verdict: Verdict;
  try {
    verdict = verdictOf(await context.readStandardInput(), commandArguments.optionValues(ALLOW_OPTION_NAME));
  } catch (failure) {
    verdict = { kind: 'deny', reason: `the guard could not read its call (${failure instanceof Error ? failure.message : String(failure)})` };
  }
  if (verdict.kind === 'deny') context.standardOutput(denialDocumentOf(verdict.reason));
}
