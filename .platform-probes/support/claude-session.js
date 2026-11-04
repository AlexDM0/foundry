// One scripted `claude -p` stream-json session through `--claude-program`: lines in, lines out, no interactive session.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { claudeProgramOption, optionValue } from './probe.js';
import { errorFactsOf, recordedTextOf } from './programs.js';

const SESSION_TIMEOUT_MILLISECONDS = 240_000;
const EXIT_AFTER_CLOSED_INPUT_MILLISECONDS = 30_000;
const POLL_MILLISECONDS = 100;
const RECORDED_TEXT_CHARACTERS = 4000;
const PROBE_MODEL = 'haiku';

export const STREAM_ARGUMENTS = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', PROBE_MODEL];

/** A foreground wait for the Bash tool: Claude Code refuses a plain long `sleep` before running it. */
export const waitingCommandOf = (seconds) => `"${process.execPath}" -e "await Bun.sleep(${seconds * 1000})"`;

const userLineOf = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } });

function refusalLineOf(requestId) {
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response: { behavior: 'deny', message: 'The probe refuses every request it did not script.' } },
  });
}

export function resultCountOf(lines) {
  return lines.filter((line) => line.type === 'result').length;
}

function contentBlocksOf(line) {
  const content = line.message?.content;
  return Array.isArray(content) ? content : [];
}

export function toolCallsOf(lines) {
  return lines
    .filter((line) => line.type === 'assistant')
    .flatMap(contentBlocksOf)
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ name: block.name, input: recordedTextOf(JSON.stringify(block.input ?? null)) }));
}

/** `answerControlRequest` returns the line to write for a request; without it, or returning null, the request is refused. */
export function startSession({ cwd, extraArguments = [], environment, detached = false, answerControlRequest } = {}) {
  const lines = [];
  const wire = [];
  let stderrText = '';
  let streamEnded = false;
  const child = Bun.spawn([claudeProgramOption(), ...STREAM_ARGUMENTS, ...extraArguments], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    detached,
    ...(cwd === undefined ? {} : { cwd }),
    ...(environment === undefined ? {} : { env: environment }),
  });

  const writeLine = (line) => {
    wire.push({ from: 'stdin', line });
    child.stdin.write(`${line}\n`);
    child.stdin.flush();
  };

  function takeLine(text) {
    if (text.trim() === '') return;
    wire.push({ from: 'stdout', line: text });
    let line;
    try {
      line = JSON.parse(text);
    } catch {
      line = { type: 'unparsed-line', text: recordedTextOf(text) };
    }
    lines.push(line);
    if (line.type === 'control_request' && line.request?.subtype === 'can_use_tool') {
      writeLine(answerControlRequest?.(line) ?? refusalLineOf(line.request_id));
    }
  }

  async function readStandardOutput() {
    let pendingText = '';
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      pendingText += decoder.decode(chunk, { stream: true });
      const completeLines = pendingText.split('\n');
      pendingText = completeLines.pop();
      completeLines.forEach(takeLine);
    }
    takeLine(pendingText);
    streamEnded = true;
  }

  const stdoutRead = readStandardOutput();
  const stderrRead = new Response(child.stderr).text().then((text) => {
    stderrText = text;
  });

  async function waitUntil(condition, timeoutMilliseconds = SESSION_TIMEOUT_MILLISECONDS) {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (condition(lines)) return true;
      if (streamEnded) return condition(lines);
      await Bun.sleep(POLL_MILLISECONDS);
    }
    return false;
  }

  async function finish() {
    await Promise.race([child.exited, Bun.sleep(EXIT_AFTER_CLOSED_INPUT_MILLISECONDS)]);
    const killedByProbe = child.exitCode === null;
    if (killedByProbe) child.kill('SIGKILL');
    await Promise.all([child.exited, stdoutRead, stderrRead]);
    return { exitCode: child.exitCode, signalCode: child.signalCode ?? null, killedByProbe, stderr: recordedTextOf(stderrText) };
  }

  return {
    pid: child.pid,
    lines,
    wire,
    writeLine,
    writeUserLine: (text) => writeLine(userLineOf(text)),
    closeInput: () => child.stdin.end(),
    waitUntil,
    finish,
  };
}

/** The fields of a session the probe record reads, kept as the wire gave them. */
export function summaryOf(lines) {
  const initLine = lines.find((line) => line.type === 'system' && line.subtype === 'init');
  return {
    init: initLine === undefined ? null : {
      session_id: initLine.session_id,
      claude_code_version: initLine.claude_code_version,
      permissionMode: initLine.permissionMode,
      cwd: initLine.cwd,
      tools: initLine.tools,
      skills: initLine.skills,
      slash_commands: initLine.slash_commands,
      agents: initLine.agents,
      memory_paths: initLine.memory_paths,
    },
    toolCalls: toolCallsOf(lines),
    toolResults: lines
      .filter((line) => line.type === 'user')
      .flatMap(contentBlocksOf)
      .filter((block) => block.type === 'tool_result')
      .map((block) => ({ isError: block.is_error ?? false, content: JSON.stringify(block.content ?? null).slice(0, RECORDED_TEXT_CHARACTERS) })),
    assistantTexts: lines
      .filter((line) => line.type === 'assistant')
      .flatMap(contentBlocksOf)
      .filter((block) => block.type === 'text')
      .map((block) => block.text.slice(0, RECORDED_TEXT_CHARACTERS)),
    controlRequests: lines.filter((line) => line.type === 'control_request').map((line) => line.request),
    rateLimitEvents: lines.filter((line) => line.type === 'rate_limit_event').map((line) => line.rate_limit_info),
    results: lines.filter((line) => line.type === 'result').map((line) => ({
      subtype: line.subtype,
      is_error: line.is_error,
      api_error_status: line.api_error_status,
      terminal_reason: line.terminal_reason,
      session_id: line.session_id,
      result: String(line.result ?? '').slice(0, RECORDED_TEXT_CHARACTERS),
      structured_output: line.structured_output,
      permission_denials: line.permission_denials,
      modelUsage: line.modelUsage,
      usage: line.usage,
    })),
    unparsedLines: lines.filter((line) => line.type === 'unparsed-line').map((line) => line.text),
  };
}

/** One turn per prompt, then the closed stdin that ends a session; a spawn the program refused is recorded, not thrown. */
export async function runSession({ prompts, settleAfterLastResultMilliseconds = 0, ...sessionOptions }) {
  let session;
  try {
    session = startSession(sessionOptions);
  } catch (error) {
    return { spawnError: errorFactsOf(error) };
  }
  let turnsAnswered = 0;
  for (const prompt of prompts) {
    session.writeUserLine(prompt);
    const expectedResults = turnsAnswered + 1;
    await session.waitUntil((lines) => resultCountOf(lines) >= expectedResults);
    turnsAnswered = expectedResults;
  }
  if (settleAfterLastResultMilliseconds > 0) await Bun.sleep(settleAfterLastResultMilliseconds);
  session.closeInput();
  const ending = await session.finish();
  return { ...ending, ...summaryOf(session.lines), rawLines: session.lines, wire: session.wire };
}

/** `runSession` as a verdict holds it, without the raw lines and the wire, which only a recording keeps. */
export async function observedSession({ wireScenario, ...sessionOptions }) {
  const { rawLines, wire, ...session } = await runSession(sessionOptions);
  if (wireScenario !== undefined && wire !== undefined) recordWire(wireScenario, wire, session);
  return session;
}

/**
 * With `--record-wire <folder>`, saves a session's lines in both directions, in the order they passed, and how it ended, as
 * `<folder>/<scenario>.json`. `src/testing/fake-agent/` plays these lines as its fake `claude`. The home folder becomes `~`,
 * so a recording names no account.
 */
export function recordWire(scenario, wire, { exitCode, signalCode, stderr }) {
  const folder = optionValue('--record-wire');
  if (folder === null) return;
  const withoutHome = (text) => text.replaceAll(homedir(), '~');
  mkdirSync(folder, { recursive: true });
  writeJsonFile(join(folder, `${scenario}.json`), {
    scenario,
    wire: wire.map(({ from, line }) => ({ from, line: withoutHome(line) })),
    ending: { exitCode, signalCode, stderr: withoutHome(stderr) },
  });
}

export function writeJsonFile(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

/** `sandbox` keys beside the three every probe of the record set; the record's sandbox block is one place. */
export function sandboxSettingsOf({ filesystem, network } = {}) {
  return {
    enabled: true,
    allowUnsandboxedCommands: false,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    ...(filesystem === undefined ? {} : { filesystem }),
    network: { allowedDomains: [], ...network },
  };
}

/** The record's `//` anchor: a leading `//` means the filesystem root in a settings path. */
export const rootAnchored = (path) => `/${path}`;

const HOOK_RECORDER_SOURCE = `
import { appendFileSync } from 'node:fs';
const hookInput = await new Response(Bun.stdin.stream()).text();
appendFileSync(process.argv[2], JSON.stringify({ CLAUDE_PROJECT_DIR: process.env['CLAUDE_PROJECT_DIR'] ?? null, hookInput }) + '\\n');
`;

/** A hook that appends what it was given to a file; its `command` string goes into a settings file's `hooks`. */
export function hookRecorderIn(folder) {
  const scriptPath = join(folder, 'record-hook.mjs');
  const markersPath = join(folder, 'hook-markers.jsonl');
  writeFileSync(scriptPath, HOOK_RECORDER_SOURCE);
  chmodSync(scriptPath, 0o755);
  const command = `"${process.execPath}" "${scriptPath}" "${markersPath}"`;
  return {
    sessionStartHooks: { SessionStart: [{ hooks: [{ type: 'command', command }] }] },
    markers: () => (existsSync(markersPath) ? readFileSync(markersPath, 'utf8').split('\n').filter((line) => line !== '') : []),
  };
}

/** The main transcript of a session, from the slug the contract documents, as lines of JSON text. */
export function transcriptLinesOf(workingDirectory, sessionId) {
  const slug = workingDirectory.replace(/[^a-zA-Z0-9]/gu, '-');
  const transcriptPath = join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
  if (!existsSync(transcriptPath)) return [];
  return readFileSync(transcriptPath, 'utf8').split('\n').filter((line) => line !== '');
}
