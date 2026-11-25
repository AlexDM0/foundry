/**
 * `config.json` holds each vendor's program for every forge on the machine. What matters: a missing file names no program, a newer or
 * malformed one is never written over, and a write sets one vendor and keeps every other key, an unknown vendor and an unknown top key too.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { MachineConfigFile }                              from './MachineConfigFile.ts';

const scratchFolders: string[] = [];

afterEach(() => {
  for (const folder of scratchFolders.splice(0)) removeScratchDirectory(folder);
});

function monitorFolder(): string {
  const folder = createScratchDirectory('machine-config');
  scratchFolders.push(folder);
  return folder;
}

describe('read', () => {
  test('a missing file is absent and names no program', () => {
    const reading = MachineConfigFile.read(monitorFolder());
    expect(reading).toEqual({ verdict: 'absent' });
    expect(MachineConfigFile.programPathOf(reading, 'example-agent')).toBeNull();
  });

  test('a stored program is read by its vendor, and another vendor names none', () => {
    const folder = monitorFolder();
    writeFileSync(MachineConfigFile.pathIn(folder), JSON.stringify({ version: 1, agents: { 'example-agent': { programPath: '/opt/example/bin/agent' } } }));
    const reading = MachineConfigFile.read(folder);
    expect(MachineConfigFile.programPathOf(reading, 'example-agent')).toBe('/opt/example/bin/agent');
    expect(MachineConfigFile.programPathOf(reading, 'other-agent')).toBeNull();
  });

  test('a newer version and a malformed file are their verdicts, never a throw', () => {
    const folder = monitorFolder();
    writeFileSync(MachineConfigFile.pathIn(folder), JSON.stringify({ version: 2 }));
    expect(MachineConfigFile.read(folder)).toEqual({ verdict: 'newer-version', version: 2 });
    writeFileSync(MachineConfigFile.pathIn(folder), '{"version": 1, "agents": {"example-agent": {}}}');
    expect(MachineConfigFile.read(folder)).toMatchObject({ verdict: 'malformed' });
  });
});

describe('writeAgentProgram', () => {
  test('creates the file at version 1 with the one vendor', () => {
    const folder = monitorFolder();
    expect(MachineConfigFile.writeAgentProgram(folder, 'example-agent', '/opt/example/bin/agent')).toBe('written');
    expect(JSON.parse(readFileSync(MachineConfigFile.pathIn(folder), 'utf8'))).toEqual({ version: 1, agents: { 'example-agent': { programPath: '/opt/example/bin/agent' } } });
  });

  test('keeps an unknown top key, another vendor and an unknown key of the vendor it sets', () => {
    const folder = monitorFolder();
    const storedAgents = { 'other-agent': { programPath: '/opt/other' }, 'example-agent': { programPath: '/old', note: 'kept' } };
    writeFileSync(MachineConfigFile.pathIn(folder), JSON.stringify({ version: 1, theme: 'dark', agents: storedAgents }));
    MachineConfigFile.writeAgentProgram(folder, 'example-agent', '/opt/example/bin/agent');
    const writtenAgents = { 'other-agent': { programPath: '/opt/other' }, 'example-agent': { programPath: '/opt/example/bin/agent', note: 'kept' } };
    expect(JSON.parse(readFileSync(MachineConfigFile.pathIn(folder), 'utf8'))).toEqual({ version: 1, theme: 'dark', agents: writtenAgents });
  });

  test('writes over neither a newer nor a malformed file', () => {
    const folder = monitorFolder();
    writeFileSync(MachineConfigFile.pathIn(folder), JSON.stringify({ version: 2 }));
    expect(MachineConfigFile.writeAgentProgram(folder, 'example-agent', '/opt/example')).toEqual({ verdict: 'newer-version', version: 2 });
    writeFileSync(MachineConfigFile.pathIn(folder), 'not json');
    expect(MachineConfigFile.writeAgentProgram(folder, 'example-agent', '/opt/example')).toMatchObject({ verdict: 'malformed' });
    expect(readFileSync(MachineConfigFile.pathIn(folder), 'utf8')).toBe('not json');
  });
});
