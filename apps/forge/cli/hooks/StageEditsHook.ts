/**
 * `hook stage-edits --allow <folder>…`, the edit guard of an entity's job. The launch's deny rules name only paths that stood at launch, so a
 * name made later on the way to a stage folder would reach Customs; this denies it at once. Any failure answers deny at exit 0, since a guard
 * that errors would let the call through.
 */
import {
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path';

import type { AgentToolCall }        from '../../src/lib/agent-launch/AgentToolCall.ts';
import { refusalIsOperationRefusal } from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }       from '../CommandContext.ts';
import type { ArgumentParser }       from '../arguments/ArgumentParser.ts';

const ALLOW_OPTION_NAME = 'allow';

const USAGE = `${PRODUCT_NAMES.PROGRAM} hook stage-edits --allow <folder> [--allow <folder>]…  (the hook input arrives on standard input)`;

type Verdict = { kind: 'pass' } | { kind: 'deny'; reason: string };

function liesInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder);
}

/** The call's path made absolute against its working directory; `null` when it names no path, or a relative one with no absolute folder. */
function targetPathOf(path: string | null, workingDirectory: string | null): string | null {
  if (path === null) return null;
  if (isAbsolute(path)) return resolve(path);
  return workingDirectory !== null && isAbsolute(workingDirectory) ? resolve(workingDirectory, path) : null;
}

/** Only a file change is checked; any other call is denied, as it may change a file by a means the guard does not read. */
function verdictOf(toolCall: AgentToolCall | null, stageFolders: readonly string[]): Verdict {
  if (stageFolders.length === 0) return { kind: 'deny', reason: 'the guard was given no stage folder' };
  if (!stageFolders.every((folder) => isAbsolute(folder))) return { kind: 'deny', reason: 'the guard was given a stage folder that is not an absolute path' };
  if (toolCall === null) return { kind: 'deny', reason: 'the guard cannot read the call' };
  if (toolCall.kind !== 'file-change') {
    const named = toolCall.kind === 'unknown' ? `the tool ${toolCall.toolName}` : 'a call that is not a file change';
    return { kind: 'deny', reason: `the guard checks only file changes and was given ${named}, which may change a file` };
  }
  const targetPath = targetPathOf(toolCall.path, toolCall.workingDirectory);
  if (targetPath === null) return { kind: 'deny', reason: 'its path is not a path the guard can place' };
  if (stageFolders.some((folder) => liesInside(targetPath, resolve(folder)))) return { kind: 'pass' };
  return { kind: 'deny', reason: `it changes ${targetPath}, and this stage may change only ${stageFolders.join(', ')}` };
}

function denialLineOf(context: CommandContext, reason: string): string {
  return context.agentAdapter.toolCallDenialLineOf(`Denied by the folders of this job's stage: ${reason}.`);
}

/** A pass prints nothing, so the call goes on to the session's own permission rules; it never grants anything. */
export async function guardTheStageEdits(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  try {
    commandArguments.rejectUnknownOptions([ALLOW_OPTION_NAME], USAGE);
  } catch (refusal) {
    if (!refusalIsOperationRefusal(refusal)) throw refusal;
    context.standardOutput(denialLineOf(context, 'the guard was given an option it does not know'));
    return;
  }
  let verdict: Verdict;
  try {
    const stageFolders = commandArguments.optionValues(ALLOW_OPTION_NAME);
    verdict = verdictOf(context.agentAdapter.toolCallOf(await context.readStandardInput()), stageFolders);
  } catch (failure) {
    verdict = { kind: 'deny', reason: `the guard could not read its call (${failure instanceof Error ? failure.message : String(failure)})` };
  }
  if (verdict.kind === 'deny') context.standardOutput(denialLineOf(context, verdict.reason));
}
