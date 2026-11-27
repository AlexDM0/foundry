/**
 * Claude Code's `PreToolUse` hook input read into the neutral call forge's guards judge, and the denial they print: `Bash` and `PowerShell`
 * are shell calls with `allowed_domains`, `WebFetch` carries its url, `Edit` and `Write` their `file_path` and `cwd`, any other named tool is
 * unknown and never passed, and input that is no JSON object or names no tool cannot be read.
 */
import { describe, expect, test } from 'bun:test';

import type { AgentToolCall } from '../agent-launch/AgentToolCall.ts';
import { ClaudeHookInput }    from './ClaudeHookInput.ts';

function toolCallOf(hookInput: unknown): AgentToolCall | null {
  return ClaudeHookInput.toolCallOf(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
}

function preToolUse(toolName: string, toolInput: Record<string, unknown>, workingDirectory?: unknown): unknown {
  return {
    hook_event_name: 'PreToolUse', ...workingDirectory === undefined ? {} : { cwd: workingDirectory }, tool_name: toolName, tool_input: toolInput
  };
}

describe('shell calls carry the domains they ask for', () => {
  test.each([
    ['a Bash list',
      preToolUse('Bash', { command: 'curl https://example.net', allowed_domains: ['registry.example.com', 'Example.net'] }),
      ['registry.example.com', 'Example.net']],
    ['a Bash text split on commas and spaces',
      preToolUse('Bash', { command: 'curl', allowed_domains: '*.example.com, example.net  cdn.example.org' }),
      ['*.example.com', 'example.net', 'cdn.example.org']],
    ['a Bash call naming no domain', preToolUse('Bash', { command: 'ls' }), []],
    ['a Bash call whose domains are null', preToolUse('Bash', { command: 'ls', allowed_domains: null }), []],
    ['a PowerShell call naming no domain, as on Windows with no sandbox', preToolUse('PowerShell', { command: 'Get-ChildItem' }), []],
    ['a PowerShell list', preToolUse('PowerShell', { command: 'Invoke-WebRequest', allowed_domains: ['example.net'] }), ['example.net']],
  ])('%s', (_case, hookInput, requestedDomains) => {
    expect(toolCallOf(hookInput)).toEqual({ kind: 'shell', requestedDomains });
  });

  test.each([
    ['a list of numbers', [1, 2]],
    ['an object', { domain: 'example.net' }],
    ['a number', 7],
  ])('malformed domains, %s, are unreadable as null', (_case, allowedDomains) => {
    expect(toolCallOf(preToolUse('Bash', { command: 'curl', allowed_domains: allowedDomains }))).toEqual({ kind: 'shell', requestedDomains: null });
  });
});

describe('web fetches carry their url', () => {
  test('a WebFetch names its url', () => {
    expect(toolCallOf(preToolUse('WebFetch', { url: 'https://example.net/page', prompt: 'Summarise' }))).toEqual({ kind: 'web-fetch', url: 'https://example.net/page' });
  });

  test('a WebFetch with no text url carries null', () => {
    expect(toolCallOf(preToolUse('WebFetch', { url: 7 }))).toEqual({ kind: 'web-fetch', url: null });
    expect(toolCallOf(preToolUse('WebFetch', {}))).toEqual({ kind: 'web-fetch', url: null });
  });
});

describe('file changes carry the path and the session\'s folder', () => {
  test.each([
    ['an Edit', 'Edit'],
    ['a Write', 'Write'],
  ])('%s names its file_path and cwd', (_case, toolName) => {
    const hookInput = preToolUse(toolName, { file_path: 'apps/gaia/index.ts', content: 'example' }, '/example/worktree');
    expect(toolCallOf(hookInput)).toEqual({ kind: 'file-change', path: 'apps/gaia/index.ts', workingDirectory: '/example/worktree' });
  });

  test.each([
    ['a missing path', {}],
    ['an empty path', { file_path: '' }],
    ['a path that is not text', { file_path: ['apps/gaia/index.ts'] }],
  ])('%s carries null', (_case, toolInput) => {
    expect(toolCallOf(preToolUse('Write', toolInput, '/example/worktree'))).toEqual({ kind: 'file-change', path: null, workingDirectory: '/example/worktree' });
  });

  test('a call with no cwd carries no folder', () => {
    expect(toolCallOf(preToolUse('Edit', { file_path: '/example/notes.md' }))).toEqual({ kind: 'file-change', path: '/example/notes.md', workingDirectory: null });
    expect(toolCallOf(preToolUse('Edit', { file_path: '/example/notes.md' }, null))).toEqual({ kind: 'file-change', path: '/example/notes.md', workingDirectory: null });
  });
});

describe('the other tools', () => {
  test.each(['Read', 'Glob', 'Grep', 'NotebookEdit', 'TodoWrite', 'AskUserQuestion'])('%s reaches nothing', (toolName) => {
    expect(toolCallOf(preToolUse(toolName, {}))).toEqual({ kind: 'no-reach' });
  });

  test('a tool the adapter does not know is unknown, by its name', () => {
    expect(toolCallOf(preToolUse('Zsh', { command: 'curl https://example.net' }))).toEqual({ kind: 'unknown', toolName: 'Zsh' });
  });

  test('a call with no tool input still reads by its tool', () => {
    expect(toolCallOf({ tool_name: 'Bash' })).toEqual({ kind: 'shell', requestedDomains: [] });
  });
});

describe('input it cannot read is null', () => {
  test.each([
    ['no input', ''],
    ['input that is not JSON', '{'],
    ['input that is a list', '[]'],
    ['input that is null', 'null'],
    ['a call naming no tool', { tool_input: { command: 'curl https://example.net' } }],
    ['a call whose tool name is not text', { tool_name: 7, tool_input: {} }],
  ])('%s', (_case, hookInput) => {
    expect(toolCallOf(hookInput)).toBeNull();
  });
});

test('the denial line denies the call with the reason as given', () => {
  expect(JSON.parse(ClaudeHookInput.toolCallDenialLineOf('Denied by the ticket\'s network line: it fetches example.net.'))).toEqual({
    hookSpecificOutput: {
      hookEventName:            'PreToolUse',
      permissionDecision:       'deny',
      permissionDecisionReason: 'Denied by the ticket\'s network line: it fetches example.net.',
    },
  });
});
