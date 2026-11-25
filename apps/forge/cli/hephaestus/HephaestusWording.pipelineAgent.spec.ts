/**
 * The pipeline agent's first message. What matters: it carries the current step's block and the record's facts (findings, questions with
 * their answers, the constitution with its sources, the draft and the edits), so a fresh session in place of a replaced one starts from
 * the record alone and gets the same message after its note; the research block also while billing is open; the advise block with the
 * design rules and the gate history on a stored pipeline; the confinement claims as the platform holds them; and the grammar its lines run
 * in, filled from the shell line port's `lineGrammar`. The constitution block asks for one whole document whose sources travel only in
 * the `sources` list. An entity's session reads that it works on its entity only, and its entity's findings, questions and constitution
 * in place of the forge's; the forge's session reads no such line. The entities block turns the layout findings into `entity:<key>`
 * proposals, leaves the root, the whitelist and the reach to User, and asks and suggests a Continue at the `entities` step. The first line
 * runs the pipeline setup skill by its installed name, as the agent adapter writes the line, and the step rules live in that skill.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { ShellLineGrammar }                         from '../../src/lib/shell-line/ShellLine.ts';
import type { Job }                                      from '../../src/lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                 from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }                            from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { JobLaunchFacts }                           from '../../src/services/hephaestus/DrivePass.ts';
import type { PipelineAgentFacts }                       from '../../src/services/hephaestus/PipelineAgentSessions.ts';
import { filledTemplateOf, productNameTemplateValuesOf } from '../../src/shared/FilledTemplate.ts';
import { PRODUCT_NAMES }                                 from '../../src/shared/constants/ProductNames.ts';
import { fakeAgentAdapter }                              from '../../src/testing/FakeAgentAdapter.ts';
import { LINE_GRAMMAR_WORDING }                          from '../LineGrammarWording.ts';
import { HephaestusWording }                             from './HephaestusWording.ts';

const AGENT_ADAPTER = fakeAgentAdapter();

const PROMPT_FILLS = AGENT_ADAPTER.promptFills;

const SKILL_LINE = AGENT_ADAPTER.instructionBundleLineOf(PRODUCT_NAMES.PIPELINE_SETUP_SKILL, '');

/** The skill as `init` installs it: filled with the product's names, its own installed name and the line that runs it. */
const SKILL_SOURCE_TEXT = readFileSync(join(import.meta.dir, '..', '..', 'skills', 'agent-pipeline', 'SKILL.md'), 'utf8');
const SKILL_TEXT = filledTemplateOf(SKILL_SOURCE_TEXT, { ...productNameTemplateValuesOf(PRODUCT_NAMES), skillName: PRODUCT_NAMES.PIPELINE_SETUP_SKILL, skillLine: SKILL_LINE });

const PIPELINE_AGENT_JOB = {
  id: 'J9', kind: 'pipeline-agent', ticketIds: [], attempt: 1
} as unknown as Readonly<Job>;

const DRAFT: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [{ name: 'test', run: 'bun test' }],
  phases:  { build: ['test'], review: ['test'], merge: [] },
};

const CONSTITUTION_MARKDOWN = '# Constitution\n\n## Tests\n\n- Each module has a spec beside it.\n\n```ts\nconst example = 1;\n```\n';

function setupAt(currentStep: PipelineSetup['currentStep']): PipelineSetup {
  return {
    formatVersion:   4,
    setupId:         'S1',
    mode:            'setup',
    baseContentHash: null,
    stepStates:      {
      agent: 'done', billing: 'done', research: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started'
    },
    currentStep,
    billing:         { mode: 'subscription' },
    agent:           { vendor: 'example-agent', program: { follows: 'machine' } },
    agentJobId:      'J9',
    snapshotCommit:  null,
    readyToContinue: [],
    findings:        [{
      findingId:   'F1',
      topic:       'scripts',
      label:       'Unit tests',
      value:       null,
      sourcePaths: ['package.json'],
      script:      {
        name: 'test', run: 'bun test', meaning: 'Runs the unit tests', gateCandidate: 'gate', needs: []
      },
      needsRecheck: true,
    }],
    questions: [{
      questionId:  'Q1',
      step:        'research',
      subject:     { kind: 'finding', reference: 'F1' },
      question:    'May the tests reach the network?',
      context:     '',
      options:     [{ letter: 'a', text: 'No' }, { letter: 'b', text: 'Yes, the registry only' }],
      recommended: ['a'],
      multiple:    false,
      answer:      { letters: ['b'], answeredAt: '2026-11-12T10:00:00+01:00' },
    }],
    constitution: {
      markdown:    CONSTITUTION_MARKDOWN,
      annotations: [{
        lineText: '- Each module has a spec beside it.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
      }],
      draftedFrom: { contributing: true, research: false, installedDefault: true },
      baseBlob:    null,
      revision:    2,
    },
    draft:         DRAFT,
    draftRevision: 3,
    edits:         [{
      editId: 'E1', by: 'agent', field: 'gate:test', summary: 'Run the unit tests in the build and review phases.', undone: false
    }],
    replacesUnreadablePipeline: false,
    applyRequest:               null,
    nextNumbers:                { finding: 2, question: 2, edit: 2 },
    extra:                      [],
  };
}

function factsWith(pipelineAgent: Partial<PipelineAgentFacts>, confinement: JobLaunchFacts['confinement'] = 'confined'): JobLaunchFacts {
  return {
    confinement,
    tickets:                [],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    pipelineAgent:          {
      mode:                  'setup',
      firstLine:             SKILL_LINE,
      setup:                 null,
      entity:                null,
      storedPipeline:        null,
      installedConstitution: null,
      gateHistory:           [],
      lineGrammar:           'posix-shell',
      ...pipelineAgent,
    },
    instructions: '',
  };
}

function firstMessageOf(facts: JobLaunchFacts): string {
  return HephaestusWording.launchTextOf(PIPELINE_AGENT_JOB, facts, PROMPT_FILLS).firstMessage;
}

function pipelineAgentMessageOf(lineGrammar: ShellLineGrammar, confinement: JobLaunchFacts['confinement'] = 'confined'): string {
  return firstMessageOf(factsWith({ lineGrammar }, confinement));
}

test('claims the pipeline agent has no network and writes only its Hatch folder where its sandbox enforces it', () => {
  expect(pipelineAgentMessageOf('posix-shell', 'confined')).toContain('You may write only your Hatch folder, and you have no network.');
});

test('gives the Hatch-only and no-network limits as rules, never as limits a sandbox enforces, in a session unconfined by design', () => {
  const message = pipelineAgentMessageOf('windows-cmd', 'unconfined-by-design');
  expect(message).toContain('Write only to your Hatch folder, and do not use the network. No sandbox runs on this machine');
  expect(message).not.toContain('you have no network');
});

test.each(['posix-shell', 'windows-cmd'] as const)('names the %s grammar as the one each line is written in', (lineGrammar) => {
  expect(pipelineAgentMessageOf(lineGrammar)).toContain(`Write each prepare and gate line in the grammar it runs in on this machine: ${LINE_GRAMMAR_WORDING[lineGrammar]}.`);
  expect(pipelineAgentMessageOf(lineGrammar)).not.toContain('{{');
});

test('the first message runs the pipeline setup skill by its installed name, on its first line', () => {
  const message = pipelineAgentMessageOf('posix-shell');

  expect(message.startsWith(`${SKILL_LINE}\n\n`)).toBe(true);
  expect(SKILL_LINE).toContain(PRODUCT_NAMES.PIPELINE_SETUP_SKILL);
  expect(message).toContain(`runs the \`${PRODUCT_NAMES.PIPELINE_SETUP_SKILL}\` skill on the setup`);
  expect(message).not.toContain('board page');
});

test('the skill names the five relayed commands and the question rule, and the message leaves them to it', () => {
  for (const verb of ['finding', 'ask', 'draft-constitution', 'propose', 'ready <step>']) expect(SKILL_TEXT).toContain(`pipeline ${verb}\``);
  expect(SKILL_TEXT).toContain('Give two to four options.');
  expect(SKILL_TEXT).toContain('Do not give an "Other" option.');
  expect(pipelineAgentMessageOf('posix-shell')).not.toContain('Give two to four options.');
});

describe('the current step\'s block', () => {
  test.each([
    ['billing', '### Research'],
    ['research', '### Research'],
    ['entities', '### Entities'],
    ['constitution', '### Constitution'],
    ['design', '### Pipeline design'],
    ['apply', '### Pipeline design'],
  ] as const)('at the %s step it is %s', (currentStep, heading) => {
    const message = firstMessageOf(factsWith({ setup: setupAt(currentStep) }));

    expect(message).toContain(`## Your step\n\n${heading}\n`);
    expect(message).not.toContain('{{');
  });

  test('the research block names the instruction file by the adapter\'s fill, which with Claude Code\'s reads as before', () => {
    expect(firstMessageOf(factsWith({}))).toContain('The instruction file of your agent is\n`CLAUDE.md`.');
    expect(HephaestusWording.launchTextOf(PIPELINE_AGENT_JOB, factsWith({}), { ...PROMPT_FILLS, instructionFile: 'EXAMPLE.md' }).firstMessage)
      .toContain('The instruction file of your agent is\n`EXAMPLE.md`.');
  });

  test('an agent no record names reads the research block with no pipeline stored', () => {
    expect(firstMessageOf(factsWith({}))).toContain('## Your step\n\n### Research\n');
  });

  test('an advise session reads the advise block, the design rules and the gate history, on the stored pipeline', () => {
    const message = firstMessageOf(factsWith({
      mode: 'advise', storedPipeline: DRAFT, gateHistory: ['2026-11-12T10:00:00+01:00 green tree 4b825dc'], installedConstitution: '# Installed\n'
    }));

    expect(message).toContain('### Advice on the stored pipeline');
    expect(message).toContain('### Pipeline design');
    expect(message).toContain('Do not file a ticket.');
    expect(message).toContain('2026-11-12T10:00:00+01:00 green tree 4b825dc');
    expect(message).toContain('"run": "bun test"');
    expect(message).not.toContain('# Installed');
  });

  test('each step block names its step of the skill only', () => {
    const stepNames = [['research', 'research'], ['entities', 'entities'], ['constitution', 'constitution'], ['design', 'pipeline design']] as const;
    for (const [currentStep, stepName] of stepNames) {
      expect(firstMessageOf(factsWith({ setup: setupAt(currentStep) }))).toContain(`Do the ${stepName} step of the \`${PRODUCT_NAMES.PIPELINE_SETUP_SKILL}\` skill.`);
    }
  });

  test('the skill\'s entities step proposes an entity per layout finding, leaves the root, whitelist and reach to User, and asks at its step', () => {
    expect(SKILL_TEXT).toContain('Use the `layout` findings of the setup record.');
    expect(SKILL_TEXT).toContain('Give each entity one edit of the field `entity:<key>`. The value is `{kind, home, summary?}`.');
    expect(SKILL_TEXT).toContain('also give the\n  edit `entity:<key>/depends-on`.');
    expect(SKILL_TEXT).toContain('Do not propose an entity for the root of the repository.');
    expect(SKILL_TEXT).toContain('Do not propose a whitelist or a reach. The user sets them in this step.');
    expect(SKILL_TEXT).toContain('ask with the step `entities`');
    expect(SKILL_TEXT).toContain('pipeline ready entities`');
    expect(SKILL_TEXT).toContain('the step is `research`, `entities`, `constitution` or `design`');
    expect(SKILL_TEXT).toContain('Continue and Apply are refused while a refusal stands.');
  });

  test('the skill\'s constitution step asks for one whole document, its sources only in the sources list', () => {
    expect(SKILL_TEXT).toContain('Write one whole document.');
    expect(SKILL_TEXT).toContain('Send the whole document each time');
    expect(SKILL_TEXT).toContain('Do not write a source into the text');
    expect(SKILL_TEXT).toContain('Name the source of a line only in the `sources` list');
  });

  test('the skill names the setup record under a job and outside one, and no board page', () => {
    expect(SKILL_TEXT).toContain('Under a pipeline agent job, the verbs name no setup record');
    expect(SKILL_TEXT).toContain('Outside a job, the first word after the verb names the record');
    expect(SKILL_TEXT).toContain(`\`${PRODUCT_NAMES.PROGRAM} pipeline setup --agent machine\``);
    expect(SKILL_TEXT).toContain(`\`${PRODUCT_NAMES.PROGRAM} pipeline update\``);
    expect(SKILL_TEXT).not.toContain('board page');
    expect(SKILL_TEXT).not.toContain('{{');
  });
});

test('carries the record\'s facts: findings, questions with answers, the constitution with its sources, the draft and the edits', () => {
  const message = firstMessageOf(factsWith({ setup: setupAt('constitution'), installedConstitution: '# Installed default\n' }));

  expect(message).toContain('Setup S1, mode setup. The current step is constitution.');
  expect(message).toContain('- F1 scripts, Unit tests; script `test` runs `bun test`: Runs the unit tests (gate) [package.json] Needs a recheck.');
  expect(message).toContain('- Q1 (research, finding F1): May the tests reach the network?\n  a) No (recommended)\n  b) Yes, the registry only\n  Answer: b');
  expect(message).toContain('The SOURCES ticks select: CONTRIBUTING.md, the installed default constitution.');
  expect(message).toContain(`\`\`\`\`markdown\n${CONSTITUTION_MARKDOWN}\`\`\`\``);
  expect(message).toContain('- Line "- Each module has a spec beside it." (occurrence 1): contributing, CONTRIBUTING.md');
  expect(message).toContain('Revision 3.');
  expect(message).toContain('"name": "install"');
  expect(message).toContain('- E1 by agent, gate:test: Run the unit tests in the build and review phases.');
  expect(message).toContain('# Installed default');
});

test('an entity\'s session reads its entity\'s part of the record and that it works on that entity only', () => {
  const setup = setupAt('constitution');
  const withWeb: PipelineSetup = {
    ...setup,
    entities: {
      web: {
        agentJobId: 'J9', findings: [], questions: [], constitution: { ...setup.constitution, markdown: '# Web rules\n', revision: 1 } as PipelineSetup['constitution']
      }
    },
  };

  const message = firstMessageOf(factsWith({ setup: withWeb, entity: 'web' }));

  expect(message).toContain('This session works on the entity web only.');
  expect(message).toContain('Propose edits only of the fields entity:web/<field>.');
  expect(message).toContain('# Web rules');
  expect(message).not.toContain('- F1 scripts, Unit tests');
  expect(message).toContain('### Findings\n\nNone yet.');
  expect(firstMessageOf(factsWith({ setup: withWeb }))).not.toContain('This session works on the entity');
});

test('a record with no constitution yet names the SOURCES ticks a first draft is held to', () => {
  const message = firstMessageOf(factsWith({ setup: { ...setupAt('constitution'), constitution: null } }));

  expect(message).toContain('No constitution is drafted yet. The SOURCES ticks select: CONTRIBUTING.md, the research findings.');
});

test('a fresh session in place of a replaced one gets the same first message, after its note', () => {
  const facts = factsWith({ setup: setupAt('design') });
  const replaced = firstMessageOf({ ...facts, earlierSessionReplaced: true });

  expect(replaced.endsWith(`\n\n${firstMessageOf(facts)}`)).toBe(true);
});
