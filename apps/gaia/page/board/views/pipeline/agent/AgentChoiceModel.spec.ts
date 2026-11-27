/**
 * The agent choice's model: every vendor card and line comes from what the forge sends, never from Gaia; which program is kept, pinned or
 * asked about first; Continue waits until the record's program runs; and what the landing's start sends.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardAgentProgramChoiceDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }            from '../../../../@types/board/BoardCommandDocument.ts';
import {
  EXAMPLE_AGENT_PROGRAM_PATH,
  EXAMPLE_AGENT_VENDOR,
  EXAMPLE_PIPELINE_AGENT,
  exampleBoardAgent,
  LATER_EXAMPLE_VENDORS,
  nothingFoundBoardAgent
} from '../../../testing/AgentFixture.ts';
import { AgentChoiceModel } from './AgentChoiceModel.ts';

const VERSION = { boardCommandVersion: 3 } as const;
const SETUP = { kind: 'setup', setupId: 'S1' } as const;

describe('the vendor cards', () => {
  test('a vendor forge runs is a card, found where forge knows its program, and the vendors it cannot run yet get no card', () => {
    expect(AgentChoiceModel.vendorCardsOf(exampleBoardAgent())).toEqual([
      {
        vendor: EXAMPLE_AGENT_VENDOR, label: 'Example Agent', description: 'Runs every job of this forge.', programIsFound: true
      },
    ]);
  });

  test('a program found nowhere marks the vendor not found', () => {
    expect(AgentChoiceModel.vendorCardsOf(nothingFoundBoardAgent())[0]?.programIsFound).toBe(false);
  });
});

describe('the vendors forge cannot run yet', () => {
  test('share one line, each by the name the forge sends', () => {
    const [second, third] = LATER_EXAMPLE_VENDORS;
    expect(AgentChoiceModel.laterVendorsTextOf(exampleBoardAgent()))
      .toBe(`${second?.displayName} and ${third?.displayName} come in a later version of forge.`);
  });

  test('one alone comes later in the singular, three are listed with commas', () => {
    const supported = exampleBoardAgent().vendors.filter((vendor) => vendor.supported);
    const laterVendorOf = (displayName: string) => ({
      vendor: displayName.toLowerCase(), displayName, supported: false, billingOptions: []
    });
    expect(AgentChoiceModel.laterVendorsTextOf(exampleBoardAgent({ vendors: [...supported, laterVendorOf('Example Later')] })))
      .toBe('Example Later comes in a later version of forge.');
    const threeLater = [...supported, laterVendorOf('Example One'), laterVendorOf('Example Two'), laterVendorOf('Example Three')];
    expect(AgentChoiceModel.laterVendorsTextOf(exampleBoardAgent({ vendors: threeLater })))
      .toBe('Example One, Example Two and Example Three come in a later version of forge.');
  });

  test('a forge that names only the vendor it runs has no such line, and no card of Gaia\'s own stands for others', () => {
    const agent = exampleBoardAgent({ vendors: exampleBoardAgent().vendors.filter((vendor) => vendor.supported) });
    expect(AgentChoiceModel.laterVendorsTextOf(agent)).toBeNull();
    expect(AgentChoiceModel.vendorCardsOf(agent).map((card) => card.label)).toEqual(['Example Agent']);
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

describe('the landing\'s start', () => {
  const chosenPath = '/Users/example/tools/example-agent';
  const startOf = (program: BoardAgentProgramChoiceDocument, replacesUnreadablePipeline = false): BoardCommandDocument => ({
    ...VERSION, kind: 'pipeline-setup-start', agent: { vendor: EXAMPLE_AGENT_VENDOR, program }, replacesUnreadablePipeline
  });

  test('follows the program the machine keeps, and keeps one forge only found as the machine\'s first', () => {
    expect(AgentChoiceModel.startCommandsOf(exampleBoardAgent(), { chosenPath: null, forEveryForge: false }, true))
      .toEqual([startOf({ follows: 'machine' }, true)]);
    expect(AgentChoiceModel.startCommandsOf(exampleBoardAgent({ machineProgramPath: null }), { chosenPath: null, forEveryForge: false }, false)).toEqual([
      {
        ...VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: EXAMPLE_AGENT_PROGRAM_PATH
      },
      startOf({ follows: 'machine' }),
    ]);
  });

  test('a program chosen in the dialog is kept for every forge and followed, or pinned to this forge', () => {
    expect(AgentChoiceModel.startCommandsOf(nothingFoundBoardAgent(), { chosenPath, forEveryForge: true }, false)).toEqual([
      {
        ...VERSION, kind: 'machine-agent-program-set', vendor: EXAMPLE_AGENT_VENDOR, programPath: chosenPath
      },
      startOf({ follows: 'machine' }),
    ]);
    expect(AgentChoiceModel.startCommandsOf(nothingFoundBoardAgent(), { chosenPath, forEveryForge: false }, false)).toEqual([startOf({ pinned: chosenPath })]);
  });

  test('starts nothing while no program is there, or the forge runs no vendor', () => {
    expect(AgentChoiceModel.startCommandsOf(nothingFoundBoardAgent(), { chosenPath: null, forEveryForge: true }, false)).toBeNull();
    const noVendorRuns = exampleBoardAgent({ vendors: LATER_EXAMPLE_VENDORS });
    expect(AgentChoiceModel.startCommandsOf(noVendorRuns, { chosenPath, forEveryForge: false }, false)).toBeNull();
  });
});

describe('the waits while forge runs the program', () => {
  test('a program check names the agent and says what forge does once the program ran', () => {
    expect(AgentChoiceModel.programCheckWaitOf('Example Agent', 'opens the setup at billing')).toEqual({
      title:       'Checking Example Agent',
      explanation: 'Forge starts the Example Agent program once to check that it runs on this machine, then opens the setup at billing.',
    });
  });

  test('Look again names no agent, since the notice that offers it may not know which, and promises the launches only once it runs', () => {
    expect(AgentChoiceModel.lookAgainWait.title).toBe('Looking again');
    expect(AgentChoiceModel.lookAgainWait.explanation).toContain('Once it runs, forge launches every job that stood not launched.');
  });
});
