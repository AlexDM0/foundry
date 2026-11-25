/**
 * The agent choice's model. What matters: every vendor card comes from what the forge sends, one it cannot run is drawn by its own name
 * as coming later and never selectable, and no card of Gaia's own stands for agents the forge does not name; this machine's program is the
 * one kept, else the first place found; a program chosen for every forge is kept as this machine's before it is followed, and pinned
 * otherwise; changing a program other forges follow asks first and names how many; and Continue waits until the record's program runs.
 */
import { describe, expect, test } from 'bun:test';

import {
  EXAMPLE_AGENT_PROGRAM_PATH,
  EXAMPLE_AGENT_VENDOR,
  EXAMPLE_PIPELINE_AGENT,
  exampleBoardAgent,
  LATER_EXAMPLE_VENDORS,
  nothingFoundBoardAgent
} from '../../../testing/AgentFixture.ts';
import { AgentChoiceModel } from './AgentChoiceModel.ts';

const VERSION = { boardCommandVersion: 2 } as const;
const SETUP = { kind: 'setup', setupId: 'S1' } as const;

describe('the vendor cards', () => {
  test('a supported vendor is selectable and found, and each vendor forge cannot run yet is its own card by its name, coming later', () => {
    expect(AgentChoiceModel.vendorCardsOf(exampleBoardAgent())).toEqual([
      {
        vendor: EXAMPLE_AGENT_VENDOR, label: 'Example Agent', description: 'Runs every job of this forge.', selectable: true, tag: { text: 'Found', tone: 'neutral' }
      },
      ...LATER_EXAMPLE_VENDORS.map((vendor) => ({
        vendor:      vendor.vendor,
        label:       vendor.displayName,
        description: 'Forge runs it in a later version.',
        selectable:  false,
        tag:         { text: 'Coming later', tone: 'neutral' as const },
      })),
    ]);
  });

  test('a forge that names only the vendor it runs gets that one card, and no card of Gaia\'s own stands for others', () => {
    const agent = exampleBoardAgent({ vendors: exampleBoardAgent().vendors.filter((vendor) => vendor.supported) });
    expect(AgentChoiceModel.vendorCardsOf(agent).map((card) => card.label)).toEqual(['Example Agent']);
  });

  test('a program found nowhere marks the vendor not found', () => {
    expect(AgentChoiceModel.vendorCardsOf(nothingFoundBoardAgent())[0]?.tag).toEqual({ text: 'Not found', tone: 'warn' });
  });
});

describe('this machine\'s program', () => {
  test('is the one the machine keeps, else the first place forge found, else none', () => {
    expect(AgentChoiceModel.machineProgramOf(exampleBoardAgent())).toEqual({ path: EXAMPLE_AGENT_PROGRAM_PATH, isKept: true });
    expect(AgentChoiceModel.machineProgramOf(exampleBoardAgent({ machineProgramPath: null }))).toEqual({ path: EXAMPLE_AGENT_PROGRAM_PATH, isKept: false });
    expect(AgentChoiceModel.machineProgramOf(nothingFoundBoardAgent())).toBeNull();
  });

  test('following one only found keeps it as this machine\'s first', () => {
    expect(AgentChoiceModel.machineChoiceCommandsOf(SETUP, EXAMPLE_AGENT_VENDOR, { path: '/example/agent', isKept: false })).toEqual([
      {
        ...VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: '/example/agent'
      },
      {
        ...VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } }
      },
    ]);
    expect(AgentChoiceModel.machineChoiceCommandsOf({ kind: 'forge' }, EXAMPLE_AGENT_VENDOR, { path: '/example/agent', isKept: true })).toEqual([
      { ...VERSION, kind: 'pipeline-agent-set', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } } },
    ]);
  });
});

describe('a chosen program', () => {
  test('is kept for every forge, or pinned to this forge', () => {
    expect(AgentChoiceModel.chosenProgramCommandsOf(SETUP, EXAMPLE_AGENT_VENDOR, '/example/agent', false)).toEqual([
      {
        ...VERSION, kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: EXAMPLE_AGENT_VENDOR, program: { pinned: '/example/agent' } }
      },
    ]);
    expect(AgentChoiceModel.chosenProgramCommandsOf(SETUP, EXAMPLE_AGENT_VENDOR, '/example/agent', true).map((command) => command.kind))
      .toEqual(['machine-agent-program-set', 'pipeline-setup-agent']);
  });

  test('is for every forge by default only while the machine names none', () => {
    expect(AgentChoiceModel.forEveryForgeByDefault(nothingFoundBoardAgent())).toBe(true);
    expect(AgentChoiceModel.forEveryForgeByDefault(exampleBoardAgent())).toBe(false);
  });

  test('changing the program other forges follow asks first and names how many', () => {
    expect(AgentChoiceModel.machineChangeAsksFirst(exampleBoardAgent(), true)).toBe(true);
    expect(AgentChoiceModel.machineChangeAsksFirst(exampleBoardAgent(), false)).toBe(false);
    expect(AgentChoiceModel.machineChangeAsksFirst(exampleBoardAgent({ otherForgesFollowingMachine: 0 }), true)).toBe(false);
    expect(AgentChoiceModel.machineChangeAsksFirst(nothingFoundBoardAgent(), true)).toBe(false);
    expect(AgentChoiceModel.machineChangeQuestionOf(exampleBoardAgent({ otherForgesFollowingMachine: 1 }), 'Example Agent'))
      .toBe('1 other forge follows this machine\'s Example Agent. Change it for every one of them?');
  });

  test('changing the machine\'s program asks first while Gaia has not read every other forge, saying it does not know how many follow', () => {
    const uncounted = exampleBoardAgent({ otherForgesFollowingMachine: null });
    expect(AgentChoiceModel.machineChangeAsksFirst(uncounted, true)).toBe(true);
    expect(AgentChoiceModel.machineChangeQuestionOf(uncounted, 'Example Agent'))
      .toBe('Other forges may follow this machine\'s Example Agent: Gaia could not read every forge now. Change it for every one that follows it?');
  });
});

describe('the program\'s run and Continue', () => {
  test('a program that runs names its version, and one that does not forge\'s own words', () => {
    expect(AgentChoiceModel.programStatusOf(exampleBoardAgent(), EXAMPLE_PIPELINE_AGENT)).toEqual({ runs: true, text: 'runs · 2.1.327' });
    const refused = exampleBoardAgent({ check: { verdict: 'does-not-run', cause: 'not-there', text: 'the Example Agent at /example is not there' } });
    expect(AgentChoiceModel.programStatusOf(refused, EXAMPLE_PIPELINE_AGENT)).toEqual({ runs: false, text: 'the Example Agent at /example is not there' });
    expect(AgentChoiceModel.programStatusOf(exampleBoardAgent(), null)).toBeNull();
  });

  test('Continue waits until the record holds an agent whose program runs', () => {
    expect(AgentChoiceModel.continueCommandOf('S1', null, exampleBoardAgent())).toBeNull();
    expect(AgentChoiceModel.continueCommandOf('S1', EXAMPLE_PIPELINE_AGENT, exampleBoardAgent({ check: null }))).toBeNull();
    expect(AgentChoiceModel.continueCommandOf('S1', EXAMPLE_PIPELINE_AGENT, exampleBoardAgent())).toEqual({
      ...VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'agent', move: 'continue'
    });
  });
});
