/**
 * The launcher's stop signals, against a fake signal source and a fake tool. What matters: SIGTERM goes on to the tool; SIGINT and SIGHUP,
 * which the terminal already sends the tool through its process group, are not sent again, yet each has a listener, so the launcher does
 * not exit on them before the tool; and the exit code is the tool's, or 128 plus the signal that ended it.
 */
import { constants }              from 'node:os';
import { describe, expect, test } from 'bun:test';

import { LauncherSignals, type SignalSource } from './LauncherSignals.ts';

const SIGNAL_EXIT_CODE_BASE = 128;

function fakeSignalSource(): SignalSource & { raise: (signal: string) => void; listenedSignals: () => string[] } {
  const listeners = new Map<string, Array<() => void>>();
  return {
    on: (signal, listener) => {
      listeners.set(signal, [...listeners.get(signal) ?? [], listener]);
    },
    raise:           (signal) => { for (const listener of listeners.get(signal) ?? []) listener(); },
    listenedSignals: () => [...listeners.keys()].sort(),
  };
}

describe('the launcher stop signals', () => {
  test('SIGTERM is sent on to the tool, and SIGINT and SIGHUP are not sent again', () => {
    const source = fakeSignalSource();
    const sentToTool: string[] = [];
    LauncherSignals.relayStopSignals(source, { kill: (signal) => sentToTool.push(signal) });
    for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM']) source.raise(signal);
    expect(sentToTool).toEqual(['SIGTERM']);
  });

  test('SIGINT, SIGHUP and SIGTERM each have a listener, so none ends the launcher before the tool exits', () => {
    const source = fakeSignalSource();
    LauncherSignals.relayStopSignals(source, { kill: () => undefined });
    expect(source.listenedSignals()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
  });

  test('the exit code is the tool\'s own, or 128 plus the number of the signal that ended it', () => {
    expect(LauncherSignals.exitCodeOf(0, null)).toBe(0);
    expect(LauncherSignals.exitCodeOf(1, null)).toBe(1);
    expect(LauncherSignals.exitCodeOf(0, 'SIGINT')).toBe(SIGNAL_EXIT_CODE_BASE + constants.signals.SIGINT);
    expect(LauncherSignals.exitCodeOf(0, 'SIGHUP')).toBe(SIGNAL_EXIT_CODE_BASE + constants.signals.SIGHUP);
  });
});
