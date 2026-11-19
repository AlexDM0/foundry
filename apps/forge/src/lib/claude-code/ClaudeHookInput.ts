/**
 * Claude Code's `PreToolUse` hook protocol, as forge's tool-call guards meet it: the hook input read into a neutral call, and the denial a
 * guard prints. On a host with no sandbox a shell call carries no `allowed_domains`, so it names no domain.
 */
import type { AgentToolCall } from '../agent-launch/AgentToolCall.ts';

const SHELL_TOOL_NAMES: readonly string[] = ['Bash', 'PowerShell'];
const WEB_FETCH_TOOL_NAME = 'WebFetch';
const FILE_CHANGING_TOOL_NAMES: readonly string[] = ['Edit', 'Write'];
/** The tools that reach no network and run no command; a tool in no list reads as `unknown`, as it may be a new shell. */
const NO_REACH_TOOL_NAMES: readonly string[] = ['Read', 'Glob', 'Grep', 'NotebookEdit', 'TodoWrite', 'AskUserQuestion'];
const DOMAIN_LIST_SEPARATOR = /[\s,]+/;

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parsedJsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Absent names no domain; a text is a list split on commas and spaces; any shape but a list of texts is unreadable, `null`. */
function requestedDomainsOf(toolInput: Record<string, unknown>): readonly string[] | null {
  const requested = toolInput['allowed_domains'];
  if (requested === undefined || requested === null) return [];
  if (typeof requested === 'string') return requested.split(DOMAIN_LIST_SEPARATOR).filter((domain) => domain.length > 0);
  if (Array.isArray(requested) && requested.every((domain) => typeof domain === 'string')) return requested;
  return null;
}

function nonEmptyTextOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toolCallOf(hookInputText: string): AgentToolCall | null {
  const hookInput = recordOf(parsedJsonOf(hookInputText));
  if (hookInput === null) return null;
  const toolName = hookInput['tool_name'];
  if (typeof toolName !== 'string') return null;
  const toolInput = recordOf(hookInput['tool_input']) ?? {};
  if (SHELL_TOOL_NAMES.includes(toolName)) return { kind: 'shell', requestedDomains: requestedDomainsOf(toolInput) };
  if (toolName === WEB_FETCH_TOOL_NAME) return { kind: 'web-fetch', url: typeof toolInput['url'] === 'string' ? toolInput['url'] : null };
  if (FILE_CHANGING_TOOL_NAMES.includes(toolName)) {
    return { kind: 'file-change', path: nonEmptyTextOf(toolInput['file_path']), workingDirectory: nonEmptyTextOf(hookInput['cwd']) };
  }
  if (NO_REACH_TOOL_NAMES.includes(toolName)) return { kind: 'no-reach' };
  return { kind: 'unknown', toolName };
}

function toolCallDenialLineOf(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName:            'PreToolUse',
      permissionDecision:       'deny',
      permissionDecisionReason: reason,
    },
  });
}

export const ClaudeHookInput = Object.freeze({ toolCallOf, toolCallDenialLineOf });
