/**
 * The agent facts a view reads. What matters: the program a launch would start follows the machine's config for a choice that follows it;
 * a choice naming no program, or another vendor, reads as not running without a run; and a named program reads as Hephaestus last ran
 * it, with the places the vendor's installers use; the vendors are the adapter's, which can be chosen, then each vendor coming later by
 * name, which cannot.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { MachineConfigFile }                              from '../../adapters/machine-config/MachineConfigFile.ts';
import type { Pipeline }                                  from '../../domain/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                                   from '../../domain/tracker-model/utils/PipelineUtil.ts';
import type { ExecutableResolver }                        from '../../lib/executable-resolver/ExecutableResolver.ts';
import { ProgramSearchUtil }                              from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import { boardFixture }                                   from '../../testing/BoardFixtures.ts';
import { defaultSpecPlatformPorts }                       from '../../testing/DefaultSpecPlatformPorts.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AgentFactsReading, type AgentFactsSource }       from './AgentFactsReading.ts';

const ADAPTER = fakeAgentAdapter();
const PROGRAM = '/opt/example/bin/agent';

const FOLLOWING_THE_MACHINE: Pipeline = { ...PipelineUtil.minimalPipelineOf(), agent: { vendor: ADAPTER.vendor, program: { follows: 'machine' } } };

const RESOLVER: ExecutableResolver = {
  absolutePathOf: () => ({ verdict: 'refused', cause: 'not-on-search-path', reason: 'example' }),
  programAt:      (path) => (path === PROGRAM ? { verdict: 'found', path } : { verdict: 'refused', cause: 'not-there', reason: 'example' }),
};

function sourceOf(pipeline: Pipeline, monitorFolder: string, adapter = ADAPTER): AgentFactsSource {
  return {
    board:         boardFixture({ pipeline }).board,
    adapter,
    platformPorts: { ...defaultSpecPlatformPorts(), executableResolver: RESOLVER },
    homeDirectory: monitorFolder,
    monitorFolder,
    rootDirectory: join(monitorFolder, 'example-repository'),
    checkOf:       (programPath) => ({ verdict: 'runs', programPath, version: '1.2.3' }),
  };
}

function withMonitorFolder(check: (monitorFolder: string) => void): () => void {
  return () => {
    const monitorFolder = createScratchDirectory('agent-facts');
    try {
      check(monitorFolder);
    } finally {
      removeScratchDirectory(monitorFolder);
    }
  };
}

describe('agentFactsOf', () => {
  test('a choice that follows the machine names the machine\'s program, which reads as Hephaestus ran it, and only its vendor bills', withMonitorFolder((monitorFolder) => {
    MachineConfigFile.writeAgentProgram(monitorFolder, ADAPTER.vendor, PROGRAM);
    const facts = AgentFactsReading.agentFactsOf(sourceOf(FOLLOWING_THE_MACHINE, monitorFolder));
    expect([facts.machineProgramPath, facts.programPath, facts.check]).toEqual([PROGRAM, PROGRAM, { verdict: 'runs', programPath: PROGRAM, version: '1.2.3' }]);
    expect(facts.vendors).toEqual([
      {
        vendor: ADAPTER.vendor, displayName: ADAPTER.displayName, supported: true, billingOptions: ADAPTER.billingOptions
      },
      {
        vendor: 'codex', displayName: 'Codex', supported: false, billingOptions: []
      },
      {
        vendor: 'github-copilot', displayName: 'GitHub Copilot', supported: false, billingOptions: []
      },
    ]);
    const placesOfThisPlatform = ProgramSearchUtil.programPlacesOf(defaultSpecPlatformPorts().programFolders, monitorFolder, ADAPTER);
    expect(facts.places).toEqual(placesOfThisPlatform.map((path) => ({ path, found: path === PROGRAM })));
  }));

  test('a machine naming none and another vendor read as not running, and no choice reads as no run', withMonitorFolder((monitorFolder) => {
    const following = AgentFactsReading.agentFactsOf(sourceOf(FOLLOWING_THE_MACHINE, monitorFolder));
    expect(following.check).toEqual({ verdict: 'does-not-run', programPath: null, cause: 'no-machine-program' });
    const other = AgentFactsReading.agentFactsOf(sourceOf({ ...PipelineUtil.minimalPipelineOf(), agent: { vendor: 'other-agent', program: { pinned: PROGRAM } } }, monitorFolder));
    expect([other.check, other.places]).toEqual([{ verdict: 'does-not-run', programPath: PROGRAM, cause: 'other-vendor' }, []]);
    expect(AgentFactsReading.agentFactsOf(sourceOf(PipelineUtil.minimalPipelineOf(), monitorFolder)).check).toBeNull();
  }));
});
