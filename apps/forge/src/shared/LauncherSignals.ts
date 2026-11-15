/**
 * What the installed launcher does with a stop signal. A terminal sends Ctrl-C and a hangup to its whole foreground process group, the
 * tool included, so the launcher only holds those back from ending itself early; SIGTERM, sent to the launcher alone, goes on to the tool.
 */
import { constants } from 'node:os';

/** Sent to the tool by the launcher: no terminal sends it to the group. */
const FORWARDED_SIGNALS = ['SIGTERM'] as const;
/** The tool gets these from the terminal itself; a listener that does nothing keeps the launcher alive until the tool exits. */
const GROUP_SIGNALS = ['SIGINT', 'SIGHUP'] as const;
const SIGNAL_EXIT_CODE_BASE = 128;

type LauncherSignal = (typeof FORWARDED_SIGNALS)[number] | (typeof GROUP_SIGNALS)[number];

export interface SignalSource {
  on: (signal: LauncherSignal, listener: () => void) => unknown;
}

export interface SignalledTool {
  kill: (signal: LauncherSignal) => unknown;
}

function relayStopSignals(source: SignalSource, tool: SignalledTool): void {
  for (const signal of FORWARDED_SIGNALS) source.on(signal, () => tool.kill(signal));
  for (const signal of GROUP_SIGNALS) source.on(signal, () => undefined);
}

/** The tool's own exit code, or 128 plus the number of the signal that ended it. */
function exitCodeOf(exitCode: number, signalCode: NodeJS.Signals | null): number {
  return signalCode === null ? exitCode : SIGNAL_EXIT_CODE_BASE + constants.signals[signalCode];
}

export const LauncherSignals = Object.freeze({ relayStopSignals, exitCodeOf });
