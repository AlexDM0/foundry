/**
 * Everything a command may know about its process, so every command spec runs in the test process
 * against a scratch directory and a frozen clock. It carries no environment access on purpose:
 * `src/shared/Environment.ts` is the one module that reads the environment.
 */
import { homedir }         from 'node:os';
import { resolve }         from 'node:path';
import { createInterface } from 'node:readline';

import type { AgentAdapter }                    from '../src/lib/agent-launch/AgentAdapter.ts';
import { claudeCodeAdapterFor }                 from '../src/lib/claude-code/ClaudeCodeAdapter.ts';
import { platformPortsFor, type PlatformPorts } from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { createRenderState, type RenderState }  from '../src/services/render/RenderState.ts';
import {
  claudeConfigFolderVariable,
  executableSearchPath,
  fakeAgentEndsOnNetworkOutage,
  fakeAgentIsOn,
  fakeAgentKeepsWorking,
  fakeAgentReports,
  hatchDirectory,
  launchingProgram,
  overseerJobId
} from '../src/shared/Environment.ts';
import { PLATFORM_HOST_FACTS }                                  from '../src/shared/PlatformHostFacts.ts';
import { ToolRuntimeUtil }                                      from '../src/shared/ToolRuntimeUtil.ts';
import { HATCH_REPLY_INTERVAL_MILLISECONDS, HATCH_REPLY_TRIES } from '../src/shared/constants/OverseerLimits.ts';
import {
  DEFAULT_FAKE_AGENT_STEPS,
  fakeAgentAdapter,
  type FakeAgentStep,
  NETWORK_OUTAGE_FAKE_AGENT_STEPS,
  WORKING_FAKE_AGENT_STEPS
} from '../src/testing/FakeAgentAdapter.ts';
import { fakeReportingSessions } from '../src/testing/FakeReportingSessions.ts';

export interface CommandContext {
  currentDirectory:        string;
  now:                     () => Date;
  standardOutput:          (text: string) => void;
  standardError:           (text: string) => void;
  standardInputIsTerminal: boolean;
  /** Everything piped in, read once and to the end; a command a person typed gets the empty string rather than a wait nobody can see. */
  readStandardInput:       () => Promise<string>;
  /** The same, as the bytes piped in, for supplied text whose encoding is decided by `cli/SuppliedText.ts`. */
  readStandardInputBytes:  () => Promise<Uint8Array>;
  confirm:                 (question: string) => Promise<boolean>;
  /** `process.platform`, carried here so a spec can choose the operating system a command believes it runs on. */
  platform:                string;
  /** Every OS-dependent capability, chosen once from the platform; a spec passes any record. */
  platformPorts:           PlatformPorts;
  /** `node:os`'s `homedir()`, carried here so a spec can point the agent's transcripts at a scratch tree. */
  homeDirectory:           string;
  /** The folders of this process's `PATH`, which a gate's `--writes` folder never makes writable. */
  executableSearchPath:    readonly string[];
  /** `DataFolders.temporaryRoots()`: a tracker under any of them is a scratch one the monitor registry leaves out. */
  temporaryDirectories:    readonly string[];
  /** The verb `cli/Main.ts` dispatched, such as `ticket hold`, which the monitor registry records; empty before the dispatch. */
  commandVerb:             string;
  /** Created once per invocation; holds the render service's memos, the page bundle and the configured Marked. */
  renderState:             RenderState;
  /** Present only when the Overseer launched this process for a job: then a mutating verb relays rather than opening the tracker. */
  job?:                    JobContext;
  /** The runtime and the entry point this process was started with, which `oversee --detach` starts again with the Overseer's arguments. */
  programCommand:          readonly string[];
  /** The absolute path of the program User runs: the compiled launcher that started this process, else its entry point. */
  programPath:             string;
  /** Calls `listener` on each of the platform's stop signals, which a foreground Overseer takes as a stop; returns the unsubscribe. */
  onStopSignal:            (listener: () => void) => () => void;
  /** What the Overseer launches its sessions through: Claude Code, or the scripted fake agent under the fake-agent switch. */
  agentAdapter:            AgentAdapter;
}

/** The one place outside `src/lib/claude-code/` the vendor's adapter is chosen; a spec-spawned binary always gets the fake. */
export function agentAdapterOfThisProcess(): AgentAdapter {
  if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, claudeConfigFolderVariable());
  const steps = fakeAgentStepsOfThisProcess();
  return fakeAgentReports() ? fakeAgentAdapter(steps, fakeReportingSessions().stepsOf) : fakeAgentAdapter(steps);
}

function fakeAgentStepsOfThisProcess(): readonly FakeAgentStep[] {
  if (fakeAgentEndsOnNetworkOutage()) return NETWORK_OUTAGE_FAKE_AGENT_STEPS;
  return fakeAgentKeepsWorking() ? WORKING_FAKE_AGENT_STEPS : DEFAULT_FAKE_AGENT_STEPS;
}

function onStopSignalOfThisProcess(stopSignals: readonly NodeJS.Signals[], listener: () => void): () => void {
  for (const signal of stopSignals) process.on(signal, listener);
  return () => {
    for (const signal of stopSignals) process.off(signal, listener);
  };
}

/** The script is `process.argv[1]`: Bun puts the runtime first and the entry point second. The child never loads its cwd's bunfig or `.env`. */
function programCommandOfThisProcess(): string[] {
  const entryPoint = process.argv[1];
  const runtime = [process.execPath, ...ToolRuntimeUtil.isolatingArgumentsOfThisCheckout()];
  return entryPoint === undefined ? runtime : [...runtime, entryPoint];
}

function programPathOfThisProcess(): string {
  const entryPoint = process.argv[1];
  return launchingProgram() ?? (entryPoint === undefined ? process.execPath : resolve(entryPoint));
}

export interface JobContext {
  jobId:                     string;
  hatchDirectory:            string;
  replyTries:                number;
  replyIntervalMilliseconds: number;
}

/** Both getters set, or no job: one alone is a session the Overseer did not launch whole, which runs as any other process does. */
function jobContextOfThisProcess(): JobContext | undefined {
  const jobId          = overseerJobId();
  const hatchFolder    = hatchDirectory();
  if (jobId === undefined || hatchFolder === undefined) return undefined;
  return {
    jobId, hatchDirectory: hatchFolder, replyTries: HATCH_REPLY_TRIES, replyIntervalMilliseconds: HATCH_REPLY_INTERVAL_MILLISECONDS
  };
}

/** A function, never a module constant: a constant would read `process.cwd()` at import time and hand every spec the test runner's directory. */
export function createProcessContext(): CommandContext {
  const job = jobContextOfThisProcess();
  const platformPorts = platformPortsFor(process.platform, PLATFORM_HOST_FACTS);
  return {
    ...(job === undefined ? {} : { job }),
    currentDirectory:        process.cwd(),
    now:                     () => new Date(),
    standardOutput:          (text: string) => console.log(text),
    standardError:           (text: string) => console.error(text),
    standardInputIsTerminal: process.stdin.isTTY === true,
    readStandardInput:       readEverythingOnStandardInput,
    readStandardInputBytes:  readEveryByteOnStandardInput,
    confirm:                 confirmOnStandardInput,
    platform:                process.platform,
    platformPorts,
    homeDirectory:           homedir(),
    executableSearchPath:    executableSearchPath(),
    temporaryDirectories:    platformPorts.dataFolders.temporaryRoots(),
    commandVerb:             '',
    renderState:             createRenderState(),
    programCommand:          programCommandOfThisProcess(),
    programPath:             programPathOfThisProcess(),
    onStopSignal:            (listener) => onStopSignalOfThisProcess(platformPorts.processSupervision.stopSignals, listener),
    agentAdapter:            agentAdapterOfThisProcess(),
  };
}

/**
 * A terminal is answered with the empty string rather than read: a `hook` verb typed by hand would
 * otherwise hang until whoever typed it found `Ctrl-D`.
 */
function readEverythingOnStandardInput(): Promise<string> {
  if (process.stdin.isTTY === true) return Promise.resolve('');
  return Bun.stdin.text();
}

function readEveryByteOnStandardInput(): Promise<Uint8Array> {
  if (process.stdin.isTTY === true) return Promise.resolve(new Uint8Array());
  return Bun.stdin.bytes();
}

/** Fail closed: anything but `y` or `yes` is a no, including an empty line and end of input. */
async function confirmOnStandardInput(question: string): Promise<boolean> {
  process.stdout.write(`${question} `);
  const readerInterface = createInterface({ input: process.stdin });
  try {
    const firstLine = await readerInterface[Symbol.asyncIterator]().next();
    const answer = firstLine.done === true ? '' : firstLine.value.trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    readerInterface.close();
    // Without this the still-flowing stream keeps the event loop alive and the command hangs.
    process.stdin.pause();
  }
}
