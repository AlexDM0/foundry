/**
 * A forge's agent as the board serves it, for the board's specs and screens: a vendor the forge runs, with the two ways it bills, and two
 * it will run later, which bill no way yet; its program found and running, the places its installers use, and the tools of a designed
 * pipeline, one of them missing. Test-only; every vendor and key variable is an example, never a real one.
 */
import type {
  BoardAgentBillingOptionDocument,
  BoardAgentDocument,
  BoardAgentToolDocument,
  BoardAgentVendorDocument,
  BoardJobNotLaunchedDocument,
  BoardPipelineAgentDocument
} from '../../@types/board/BoardAgentDocuments.ts';

export const EXAMPLE_AGENT_VENDOR = 'example-agent';

export const EXAMPLE_AGENT_PROGRAM_PATH = '/Users/example/.local/bin/example-agent';

export const EXAMPLE_PIPELINE_AGENT: BoardPipelineAgentDocument = { vendor: EXAMPLE_AGENT_VENDOR, program: { follows: 'machine' } };

export const EXAMPLE_AGENT_TOOLS: readonly BoardAgentToolDocument[] = [
  {
    name: 'git', path: '/usr/bin/git', approved: true, usedBy: [{ kind: 'every-job', name: null, entity: null }]
  },
  {
    name:     'bun',
    path:     '/Users/example/.bun/bin/bun',
    approved: true,
    usedBy:   [{ kind: 'gate', name: 'typecheck', entity: null }, { kind: 'gate', name: 'lint', entity: null }, { kind: 'prepare', name: 'install', entity: null }],
  },
  {
    name: 'gh', path: '/opt/homebrew/bin/gh', approved: true, usedBy: [{ kind: 'gate', name: 'release', entity: null }]
  },
  {
    name: 'docker', path: null, approved: false, usedBy: [{ kind: 'gate', name: 'integration', entity: null }]
  },
];

export const EXAMPLE_NOT_LAUNCHED: BoardJobNotLaunchedDocument = {
  cause:       'not-there',
  programPath: EXAMPLE_AGENT_PROGRAM_PATH,
  text:        `the Example Agent at ${EXAMPLE_AGENT_PROGRAM_PATH} is not there`,
};

export const EXAMPLE_AGENT_KEY_VARIABLE_NAME = 'EXAMPLE_AGENT_API_KEY';

/** The ways the example agent bills, its login first as its default, and a key whose launches each take a cap. */
export const EXAMPLE_BILLING_OPTIONS: readonly BoardAgentBillingOptionDocument[] = [
  { mode: 'subscription', keyVariableName: null, capsEachLaunch: false },
  { mode: 'api', keyVariableName: EXAMPLE_AGENT_KEY_VARIABLE_NAME, capsEachLaunch: true },
];

/** The vendors forge names and cannot run yet, each by its own display name, with no way to bill. */
export const LATER_EXAMPLE_VENDORS: readonly BoardAgentVendorDocument[] = [
  {
    vendor: 'second-example-agent', displayName: 'Second Example Agent', supported: false, billingOptions: []
  },
  {
    vendor: 'third-example-agent', displayName: 'Third Example Agent', supported: false, billingOptions: []
  },
];

/** A forge whose agent follows this machine's program, which runs; the changes say otherwise. */
export function exampleBoardAgent(changes: Partial<BoardAgentDocument> = {}): BoardAgentDocument {
  return {
    vendors: [
      {
        vendor: EXAMPLE_AGENT_VENDOR, displayName: 'Example Agent', supported: true, billingOptions: EXAMPLE_BILLING_OPTIONS
      },
      ...LATER_EXAMPLE_VENDORS,
    ],
    choice:             EXAMPLE_PIPELINE_AGENT,
    machineProgramPath: EXAMPLE_AGENT_PROGRAM_PATH,
    programPath:        EXAMPLE_AGENT_PROGRAM_PATH,
    check:              { verdict: 'runs', version: '2.1.327' },
    places:             [
      { path: EXAMPLE_AGENT_PROGRAM_PATH, found: true },
      { path: '/opt/homebrew/bin/example-agent', found: false },
      { path: '/usr/local/bin/example-agent', found: false },
    ],
    toolsListed:                 false,
    tools:                       EXAMPLE_AGENT_TOOLS,
    otherForgesFollowingMachine: 3,
    ...changes,
  };
}

/** A forge on a machine where nothing was found: no choice, no program, every place empty. */
export function nothingFoundBoardAgent(): BoardAgentDocument {
  return exampleBoardAgent({
    choice:                      null,
    machineProgramPath:          null,
    programPath:                 null,
    check:                       null,
    places:                      exampleBoardAgent().places.map((place) => ({ ...place, found: false })),
    otherForgesFollowingMachine: 0,
  });
}
