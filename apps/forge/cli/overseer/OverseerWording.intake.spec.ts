/**
 * What the Overseer tells a product owner. What matters: the session's first line is the agent's own line that runs the product-owner
 * bundle on User's request, a fresh session taking over a replaced one reads its drafts and the answers in that same first message, and the
 * session runs with skills on, the web open and Bash on no domain.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { WorkerProfile }               from '../../src/lib/agent-launch/WorkerProfile.ts';
import type { Job }                         from '../../src/lib/tracker-model/@types/Job.ts';
import type { JobLaunchFacts }              from '../../src/services/overseer/DrivePass.ts';
import { type IntakeFacts, IntakeSessions } from '../../src/services/overseer/IntakeSessions.ts';
import { resourceFilePathOf }               from '../../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                    from '../../src/shared/constants/ProductNames.ts';
import { OverseerWording }                  from './OverseerWording.ts';

const PRODUCT_OWNER_INSTRUCTIONS = readFileSync(resourceFilePathOf('prompts', 'ProductOwnerPrompt.md'), 'utf8');

const SESSION_FOLDER = '/Users/example/development/example-repository/.example-worktrees/sessions/J3';

const PRODUCT_OWNER_JOB = {
  id: 'J3', kind: 'product-owner', role: 'product-owner', ticketIds: [], parentJobId: null, attempt: 1, target: null,
} as unknown as Readonly<Job>;

/** An agent's own line for an instruction bundle, planted so the wording is seen to take it as it is. */
function plantedInstructionBundleLineOf(bundleName: string, argumentsText: string): string {
  return `run-bundle ${bundleName} with ${argumentsText}`;
}

function intakeOf(text: string, drafts: IntakeFacts['drafts'] = [], carriedAnswers: IntakeFacts['carriedAnswers'] = []): IntakeFacts {
  return {
    text, firstLine: plantedInstructionBundleLineOf(PRODUCT_NAMES.PRODUCT_OWNER_SKILL, text), drafts, carriedAnswers
  };
}

function launchFactsWith(intake: JobLaunchFacts['intake']): JobLaunchFacts {
  return {
    tickets:                [],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake,
    airlock:                null,
    assistant:              null,
    instructions:           PRODUCT_OWNER_INSTRUCTIONS,
    confinement:            'confined',
  };
}

const SESSION_PROFILE: WorkerProfile = {
  writableRoots:          [SESSION_FOLDER],
  deniedWritableRoots:    [],
  deniedReadableRoots:    [],
  bashNetworkDomains:     ['registry.example.com'],
  webNetworkDomains:      'none',
  extraWritableDirectory: '/Users/example/development/example-repository/.example-worktrees/hatch/J3',
  allowedCommandPrefixes: [],
  deniedCommandPrefixes:  [],
  askUser:                false,
  skills:                 false,
  subagents:              [],
  attribution:            'none',
  instructionsRoot:       '/Users/example/development/example-repository',
  gitHooksDirectory:      '/Users/example/development/example-repository/.githooks',
  commitSigning:          { kind: 'unsigned' },
  networkDomainGuard:     { allowedDomains: ['registry.example.com'], programPath: '/example/bin/example-program', arguments: ['guard'] },
};

describe('the product owner launch', () => {
  test('the first line is the agent\'s line that runs the product-owner bundle on the request, and nothing else is in a first intake\'s message', () => {
    const text = OverseerWording.launchTextOf(PRODUCT_OWNER_JOB, launchFactsWith(intakeOf('Alex Example asks for a basket')));

    expect(text.firstMessage).toBe(`run-bundle ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} with Alex Example asks for a basket`);
    expect(text.roleBrief).toContain('job J3');
  });

  test('a fresh session taking over reads the drafts filed so far and the answers given, below the same first line', () => {
    const drafts = [{ id: '004', title: 'Example basket' }];
    const carriedAnswers = [{ 'Which currency?': 'Euro' }];
    const text = OverseerWording.launchTextOf(PRODUCT_OWNER_JOB, launchFactsWith(intakeOf('A basket', drafts, carriedAnswers)));
    const lines = text.firstMessage.split('\n');

    expect(lines[0]).toBe(`run-bundle ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} with A basket`);
    expect(lines).toContain('- #004 Example basket');
    expect(text.firstMessage).toContain('- Which currency?\n  Answer: Euro');
  });

  // `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` holds this profile's rendering: no disallowed tool, slash commands on.
  test('the session runs with skills on, WebFetch and WebSearch allowed and Bash allowed no domain', () => {
    const profile = IntakeSessions.productOwnerProfileOf(SESSION_PROFILE);

    expect(profile).toMatchObject({
      skills: true, askUser: true, webNetworkDomains: 'any', bashNetworkDomains: [], writableRoots: [SESSION_FOLDER], networkDomainGuard: null
    });
  });
});
