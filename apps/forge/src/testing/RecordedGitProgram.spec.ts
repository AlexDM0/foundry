/**
 * A session, a gate and a prepare step find git through the launch's tool search, never through the search path Hephaestus inherited. So
 * the ports of a flow spec must answer the recorded git there too: with the resolver alone, a session's own git is the machine's.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { AgentTools }                                               from '../services/control/AgentTools.ts';
import { defaultSpecPlatformPorts }                                 from './DefaultSpecPlatformPorts.ts';
import { portsResolvingTheRecordedGit, type SharedRecordedGitFlow } from './RecordedGitProgram.ts';
import { createScratchDirectory, removeScratchDirectory }           from './ScratchWorkspace.ts';

const EXAMPLE_HOME = '/home/alex-example';
const EXECUTABLE_MODE = 0o755;

let programFolder = '';

function flowWithItsProgramIn(folder: string): SharedRecordedGitFlow {
  return {
    programFolder: folder, bunOptions: '', requireEveryCallAnswered: () => undefined, remove: () => undefined
  };
}

beforeEach(() => {
  programFolder = createScratchDirectory('recorded-git-program');
  writeFileSync(join(programFolder, 'git'), '#!/bin/sh\n');
  chmodSync(join(programFolder, 'git'), EXECUTABLE_MODE);
});

afterEach(() => {
  removeScratchDirectory(programFolder);
});

test('a launch\'s tool search finds the recorded git first, so its folder leads the search path of a session', () => {
  const ports = portsResolvingTheRecordedGit(defaultSpecPlatformPorts(), flowWithItsProgramIn(programFolder));
  const launch = AgentTools.launchToolsOf(null, AgentTools.toolPlacesOf(ports, EXAMPLE_HOME, []));

  expect(launch.tools).toEqual([{ name: 'git', path: join(programFolder, 'git') }]);
  expect(AgentTools.toolFoldersOf(launch.tools)).toEqual([programFolder]);
});

test('the resolver answers the recorded git by name, and any other program as the ports do', () => {
  const defaultPorts = defaultSpecPlatformPorts();
  const ports = portsResolvingTheRecordedGit(defaultPorts, flowWithItsProgramIn(programFolder));

  expect(ports.executableResolver.absolutePathOf('git', [])).toEqual({ verdict: 'found', path: join(programFolder, 'git') });
  expect(ports.executableResolver.absolutePathOf('example-missing-program', [])).toEqual(defaultPorts.executableResolver.absolutePathOf('example-missing-program', []));
});
