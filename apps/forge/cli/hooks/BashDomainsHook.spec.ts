/**
 * `hook bash-domains`, the network guard, over neutral calls a planted adapter reads from the hook input. What matters: a shell command
 * asking for a domain outside `--allow`, a web fetch of a host outside it, or a tool the adapter does not know, is denied through the
 * adapter's denial line; a call inside the list, a shell command naming no domain, a file change and a call that reaches nothing pass
 * silently, granting nothing; and every failure (an input the adapter cannot read, an adapter that throws, no `--allow`, a url with no
 * host, unreadable domains) answers deny, always at exit 0. The vendor's own hook input is `ClaudeHookInput.spec.ts`'s.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { AgentToolCall }                             from '../../src/lib/agent-launch/AgentToolCall.ts';
import { fakeAgentAdapter }                               from '../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGitOutsideAnyRepository }             from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';

useRecordedGitOutsideAnyRepository();

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('bash-domains-hook');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

const ALLOW = ['--allow', 'registry.example.com,*.example.org'];
const PLANTED_HOOK_INPUT = 'planted hook input';
const DENIAL_PREFIX = 'denied: ';

interface GuardAnswer {
  readonly exitCode:   number;
  readonly output:     string;
  readonly inputsRead: readonly string[];
}

/** `plantedCall` is what the planted adapter reads from any input; a function stands for an adapter that throws. */
async function answerOf(plantedCall: AgentToolCall | null | (() => never), allowArguments: readonly string[] = ALLOW): Promise<GuardAnswer> {
  const inputsRead: string[] = [];
  const agentAdapter = {
    ...fakeAgentAdapter(),
    toolCallOf: (hookInput: string): AgentToolCall | null => {
      inputsRead.push(hookInput);
      return typeof plantedCall === 'function' ? plantedCall() : plantedCall;
    },
    toolCallDenialLineOf: (reason: string): string => `${DENIAL_PREFIX}${reason}`,
  };
  const context = createCapturedCommandContext({ currentDirectory: scratchDirectory, standardInputText: PLANTED_HOOK_INPUT, agentAdapter });
  const exitCode = await runCommandLine(['hook', 'bash-domains', ...allowArguments], context);
  return { exitCode, output: context.outputText(), inputsRead };
}

function expectDenied({ exitCode, output }: GuardAnswer): void {
  expect(exitCode).toBe(0);
  expect(output.startsWith(`${DENIAL_PREFIX}Denied by the ticket's network line: `)).toBe(true);
}

function shellCall(requestedDomains: readonly string[] | null): AgentToolCall {
  return { kind: 'shell', requestedDomains };
}

function webFetch(url: string | null): AgentToolCall {
  return { kind: 'web-fetch', url };
}

describe('denies what leaves the list', () => {
  test.each<[string, AgentToolCall]>([
    ['a shell command asking for an unlisted domain', shellCall(['registry.example.com', 'example.net'])],
    ['a shell command asking for a wildcard the list does not hold', shellCall(['*.example.com'])],
    ['a shell command asking for the bare domain of a wildcard entry', shellCall(['example.org'])],
    ['a web fetch of an unlisted host', webFetch('https://example.net/page')],
    ['a web fetch of loopback', webFetch('http://127.0.0.1:8080/')],
    ['a web fetch of a host that merely ends in a listed domain\'s text', webFetch('https://evilregistry.example.com/')],
    ['a shell command asking for a domain that merely ends in a wildcard\'s text', shellCall(['evilexample.org'])],
    ['a tool the adapter does not know', { kind: 'unknown', toolName: 'Zsh' }],
  ])('%s is denied through the adapter\'s denial line at exit 0', async (_case, plantedCall) => {
    expectDenied(await answerOf(plantedCall));
  });

  test('the reason names the domain asked for and the list', async () => {
    const { output } = await answerOf(shellCall(['example.net']));
    expect(output).toBe(`${DENIAL_PREFIX}Denied by the ticket's network line: it asks for example.net, and this ticket's network allows `
      + 'registry.example.com, *.example.org.');
  });
});

describe('passes what stays inside it, granting nothing', () => {
  test.each<[string, AgentToolCall]>([
    ['a shell command asking for listed domains, in any case and with a closing dot', shellCall(['Registry.Example.com', 'cdn.example.org.'])],
    ['a shell command naming no domain, as on a host with no sandbox', shellCall([])],
    ['a web fetch of a listed host', webFetch('https://registry.example.com/package')],
    ['a web fetch of a subdomain under a wildcard entry', webFetch('https://docs.example.org/')],
    ['a file change', { kind: 'file-change', path: '/example/notes.md', workingDirectory: null }],
    ['a call that reaches no network and runs no command', { kind: 'no-reach' }],
  ])('%s prints nothing at exit 0', async (_case, plantedCall) => {
    const { exitCode, output } = await answerOf(plantedCall);
    expect({ exitCode, output }).toEqual({ exitCode: 0, output: '' });
  });

  test('the adapter reads exactly what arrived on standard input', async () => {
    expect((await answerOf({ kind: 'no-reach' })).inputsRead).toEqual([PLANTED_HOOK_INPUT]);
  });
});

describe('answers deny on any failure', () => {
  test.each<[string, AgentToolCall | null | (() => never)]>([
    ['an input the adapter cannot read', null],
    ['an adapter that throws', () => { throw new Error('planted failure'); }],
    ['a web fetch whose url names no host', webFetch('not a url')],
    ['a web fetch with no url', webFetch(null)],
    ['a shell command whose domains the adapter cannot read', shellCall(null)],
  ])('%s', async (_case, plantedCall) => {
    expectDenied(await answerOf(plantedCall));
  });

  test('with no --allow every requested domain is outside the list', async () => {
    expectDenied(await answerOf(shellCall(['registry.example.com']), []));
  });

  test('an unknown option is denied before any input is read', async () => {
    const answer = await answerOf({ kind: 'no-reach' }, [...ALLOW, '--deny', 'example.net']);
    expectDenied(answer);
    expect(answer.inputsRead).toEqual([]);
  });
});
