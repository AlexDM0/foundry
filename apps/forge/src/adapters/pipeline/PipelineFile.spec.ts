/**
 * `pipeline.json` in its one format, both ways. What matters: a written pipeline reads back whole and writes back byte for byte, `version`
 * first and an optional key only once set, the Assistant's switch and a gate the forge alone runs included; the minimal pipeline is
 * readable; an empty gate list stays written, since it is "no gates on purpose", not "none set"; a file with no `version` or an earlier one,
 * version 2, 3 and 4 included, is `older`, never mapped; a file nobody could trust whole is `malformed` with a reason naming the offending
 * part, one distinct reason per rule, never a throw; and no file is `absent`. A file with entities is `PipelineFile.entities.spec.ts`'s.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { PipelineFile }                                   from './PipelineFile.ts';

const NO_PHASES = { build: [], review: [], merge: [] };

const MINIMAL_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

const EXAMPLE_PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile', in: '/' }, { name: 'generate', run: 'bun run generate', in: 'packages/example' }],
  gates:   [
    {
      name: 'types', run: 'bun run typecheck', definedBy: ['tsconfig.json'], in: '/apps/example'
    },
    {
      name: 'lint', run: 'bun run lint', fix: 'bun run lint --fix', in: 'packages/example', network: ['registry.example.com'], writes: ['~/.cache/example'], forgeOnly: true
    },
  ],
  phases:       { build: ['types', 'lint'], review: ['types'], merge: ['lint', 'types'] },
  review:       { name: 'review', reReview: { thresholdLines: 750 } },
  airlock:      { reReview: { thresholdLines: 300 } },
  constitution: { path: 'CONSTITUTION.md' },
  agents:       {
    productOwner: { model: 'sonnet', effort: 'low' },
    builder:      { instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }, { kind: 'file', path: 'docs/example-builder.md' }] },
    reviewer:     { model: 'fable', effort: 'xhigh', instructions: [] },
    reReviewer:   { instructions: [{ kind: 'file', path: '.forge/briefs/example-re-review.md' }] },
  },
  approvals: { tickets: false },
  billing:   { mode: 'api', maxBudgetUsd: 2.5 },
  reach:     ['/packages/shared', '/bun.lock'],
  assistant: true,
};

let scratchDirectory = '';

const pipelineFilePath = (): string => join(scratchDirectory, 'pipeline.json');

function readingOfText(text: string): ReturnType<typeof PipelineFile.read> {
  writeFileSync(pipelineFilePath(), text);
  return PipelineFile.read(pipelineFilePath());
}

function readingOf(document: unknown): ReturnType<typeof PipelineFile.read> {
  return readingOfText(JSON.stringify(document));
}

function reasonOf(document: unknown): string {
  const reading = readingOf(document);
  return reading.verdict === 'malformed' ? reading.reason : `read as ${reading.verdict}`;
}

/** The minimal pipeline with `fields` over it, so a case names only the part it breaks. */
function minimalWith(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 5, prepare: [], gates: [], phases: NO_PHASES, ...fields
  };
}

const TEST_GATE = { name: 'test', run: 'bun test' };

/** The gate key's name before `forgeOnly`, joined from its parts so no tracked line holds the retired name. */
const RETIRED_FORGE_ONLY_KEY = ['overseer', 'Only'].join('');

function withTestGateAnd(fields: Record<string, unknown>): Record<string, unknown> {
  return minimalWith({ gates: [TEST_GATE], phases: { build: ['test'], review: ['test'], merge: ['test'] }, ...fields });
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-file');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

describe('a readable pipeline', () => {
  test('no file reads as absent', () => {
    expect(PipelineFile.read(pipelineFilePath())).toEqual({ verdict: 'absent' });
  });

  test('a written pipeline reads back whole, every optional key kept, and writes back byte for byte', () => {
    const contents = PipelineFile.contentsOf(EXAMPLE_PIPELINE);
    const reading  = readingOfText(contents);

    expect(JSON.parse(contents)).toMatchObject({ version: 5, assistant: true, gates: [{}, { forgeOnly: true }] });
    expect(reading).toEqual({ verdict: 'readable', pipeline: EXAMPLE_PIPELINE });
    expect(reading.verdict === 'readable' ? PipelineFile.contentsOf(reading.pipeline) : '').toBe(contents);
    expect(readFileSync(pipelineFilePath(), 'utf8')).toBe(contents);
  });

  test('the minimal pipeline is readable, written with version first and only the required keys', () => {
    const contents = PipelineFile.contentsOf(MINIMAL_PIPELINE);

    expect(Object.keys(JSON.parse(contents) as object)).toEqual(['version', 'prepare', 'gates', 'phases']);
    expect(JSON.parse(contents)).toMatchObject({ version: 5 });
    expect(readingOfText(contents)).toEqual({ verdict: 'readable', pipeline: MINIMAL_PIPELINE });
  });

  test('keys written in another order are read and written back in the format\'s order', () => {
    const reordered = {
      assistant: true, phases: NO_PHASES, approvals: { merge: true }, gates: [], prepare: [], version: 5
    };

    expect(Object.keys(JSON.parse(PipelineFile.contentsOf(reordered as Pipeline)) as object)).toEqual(['version', 'prepare', 'gates', 'phases', 'approvals', 'assistant']);
  });

  test('an empty instruction list is kept, since it replaces the role\'s default list', () => {
    expect(readingOf(minimalWith({ agents: { builder: { instructions: [] } } }))).toMatchObject({ verdict: 'readable', pipeline: { agents: { builder: { instructions: [] } } } });
  });
});

describe('a file an earlier release wrote', () => {
  test('with no version is older, whatever else it holds', () => {
    expect(readingOf({
      prepare: [], gates: [], constitution: ['CLAUDE.md'], review: { name: 'review', model: 'opus' }
    })).toEqual({ verdict: 'older' });
    expect(readingOf({})).toEqual({ verdict: 'older' });
  });

  test.each([0, 1, 2, 3, 4])('with version %d is older, a version an earlier release read included', (version) => {
    expect(readingOf(minimalWith({ version }))).toEqual({ verdict: 'older' });
    expect(readingOf(withTestGateAnd({ version, reach: ['/bun.lock'] }))).toEqual({ verdict: 'older' });
  });

  test('with a version above the one format\'s is malformed as a newer format', () => {
    expect(reasonOf(minimalWith({ version: 6 }))).toBe('version is 6, a newer format than version 5, which this build reads (newer-format)');
  });

  test('with a version that is not a whole number is malformed', () => {
    expect(reasonOf(minimalWith({ version: '5' }))).toBe('version is not a whole number');
    expect(reasonOf(minimalWith({ version: 5.5 }))).toBe('version is not a whole number');
  });
});

describe('a malformed file', () => {
  test('that is not JSON, or not a JSON object, is malformed, never a throw', () => {
    expect(readingOfText('{ "gates": [').verdict).toBe('malformed');
    expect(reasonOf([])).toBe('the document is not a JSON object');
  });

  test('missing a required key names it', () => {
    expect(reasonOf({ version: 5, gates: [], phases: NO_PHASES })).toBe('prepare is missing');
    expect(reasonOf({ version: 5, prepare: [], phases: NO_PHASES })).toBe('gates is missing');
    expect(reasonOf({ version: 5, prepare: [], gates: [] })).toBe('phases is missing');
  });

  test('an unknown key at every level is refused with a reason naming it', () => {
    expect(reasonOf(minimalWith({ checks: 'bun test' })))
      .toBe('"checks" is not a pipeline key; the keys are version, prepare, gates, phases, review, airlock, constitution, agents, approvals, billing, reach, entities, assistant');
    expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, cache: true }] }))).toContain('gates[0]."cache" is not a pipeline key');
    expect(reasonOf(minimalWith({ prepare: [{ name: 'install', run: 'bun install', network: [] }] }))).toContain('prepare[0]."network" is not a pipeline key');
    expect(reasonOf(minimalWith({ phases: { ...NO_PHASES, deploy: [] } }))).toContain('phases."deploy" is not a pipeline key');
    expect(reasonOf(minimalWith({ review: { name: 'review', model: 'opus' } }))).toContain('review."model" is not a pipeline key');
    expect(reasonOf(minimalWith({ review: { name: 'review', reReview: { thresholdLines: 750, model: 'opus' } } }))).toContain('review.reReview."model" is not a pipeline key');
    expect(reasonOf(minimalWith({ airlock: { train: true } }))).toContain('airlock."train" is not a pipeline key');
    expect(reasonOf(minimalWith({ constitution: { path: 'CONSTITUTION.md', sections: [] } }))).toContain('constitution."sections" is not a pipeline key');
    expect(reasonOf(minimalWith({ agents: { tester: {} } }))).toContain('agents."tester" is not a pipeline key');
    expect(reasonOf(minimalWith({ agents: { builder: { temperature: 1 } } }))).toContain('agents.builder."temperature" is not a pipeline key');
    expect(reasonOf(minimalWith({ agents: { builder: { instructions: [{ kind: 'constitution', path: 'x.md' }] } } })))
      .toContain('agents.builder.instructions[0]."path" is not a pipeline key');
    expect(reasonOf(minimalWith({ approvals: { merges: true } }))).toContain('approvals."merges" is not a pipeline key');
    expect(reasonOf(minimalWith({ billing: { mode: 'api', apiKey: 'sk-ant-example-planted' } }))).toContain('billing."apiKey" is not a pipeline key');
  });

  test('the retired role key onboarder is refused, and its current name pipelineAgent reads back', () => {
    expect(reasonOf(minimalWith({ agents: { onboarder: {} } }))).toContain('agents."onboarder" is not a pipeline key');
    const agents = { pipelineAgent: { instructions: [{ kind: 'file', path: 'docs/pipeline-notes.md' }] } };
    expect(readingOf(minimalWith({ agents }))).toMatchObject({ verdict: 'readable', pipeline: { agents } });
  });

  test('a list that is not a list, a gate or step missing its name or run line, or a field of the wrong shape names the part', () => {
    expect(reasonOf(minimalWith({ gates: {} }))).toBe('gates is not a list');
    expect(reasonOf(minimalWith({ gates: [{ run: 'bun test' }] }))).toBe('gates[0] has no name');
    expect(reasonOf(minimalWith({ gates: [{ name: 'test' }] }))).toBe('gates[0] has no run line');
    expect(reasonOf(minimalWith({ prepare: [{ name: 'install', run: '  ' }] }))).toBe('prepare[0] has no run line');
    expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, definedBy: 'package.json' }] }))).toBe('gates[0].definedBy is not a list of non-blank texts');
    expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, forgeOnly: false }] }))).toBe('gates[0].forgeOnly is present and is not true');
    expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, [RETIRED_FORGE_ONLY_KEY]: true }] }))).toContain(`gates[0]."${RETIRED_FORGE_ONLY_KEY}" is not a pipeline key`);
    expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, writes: ['~/.cache/example', 'cache'] }] }))).toBe('gates[0].writes holds a folder that is not absolute or ~/');
  });

  test('a prepare name or a gate name given twice, or one name for a prepare step and a gate, is refused', () => {
    expect(reasonOf(withTestGateAnd({ gates: [TEST_GATE, { name: 'test', run: 'bun test --bail' }] }))).toBe('gates names "test" twice');
    expect(reasonOf(minimalWith({ prepare: [{ name: 'install', run: 'bun install' }, { name: 'install', run: 'npm ci' }] }))).toBe('prepare names "install" twice');
    expect(reasonOf(withTestGateAnd({ prepare: [{ name: 'test', run: 'bun install' }] }))).toBe('"test" names both a prepare step and a gate');
  });

  test('a phase missing, not a list, naming an unknown gate or one gate twice is refused', () => {
    expect(reasonOf(minimalWith({ phases: { build: [], review: [] } }))).toBe('phases.merge is missing');
    expect(reasonOf(minimalWith({ phases: { ...NO_PHASES, build: 'test' } }))).toBe('phases.build is not a list of gate names');
    expect(reasonOf(minimalWith({ phases: { ...NO_PHASES, review: ['lint'] } }))).toBe('phases.review names "lint", which is not a gate');
    expect(reasonOf(withTestGateAnd({ phases: { build: ['test', 'test'], review: [], merge: [] } }))).toBe('phases.build names "test" twice');
    expect(reasonOf(minimalWith({ phases: [] }))).toBe('phases is not an object');
  });

  test('a gate in no phase is refused', () => {
    expect(reasonOf(withTestGateAnd({ phases: NO_PHASES }))).toBe('the gate "test" runs in no phase');
  });

  test('a model or an effort outside the vocabularies is refused', () => {
    expect(reasonOf(minimalWith({ agents: { reviewer: { model: 'gpt' } } }))).toBe('agents.reviewer.model is not a known model');
    expect(reasonOf(minimalWith({ agents: { reviewer: { effort: 'extreme' } } }))).toBe('agents.reviewer.effort is not a known effort');
    expect(reasonOf(minimalWith({ agents: { builder: [] } }))).toBe('agents.builder is not an object');
  });

  test('an instruction entry of an unknown kind or role, or a file path outside the repository, is refused', () => {
    const builderListing = (instructions: unknown): Record<string, unknown> => minimalWith({ agents: { builder: { instructions } } });

    expect(reasonOf(builderListing({}))).toBe('agents.builder.instructions is not a list');
    expect(reasonOf(builderListing(['CLAUDE.md']))).toBe('agents.builder.instructions[0] is not an object');
    expect(reasonOf(builderListing([{ kind: 'skill' }]))).toBe('agents.builder.instructions[0].kind is not one of constitution, default-brief, file');
    expect(reasonOf(builderListing([{ kind: 'default-brief', role: 'tester' }])))
      .toBe('agents.builder.instructions[0].role is not one of productOwner, builder, reviewer, reReviewer, conflictReReviewer, pipelineAgent, assistant');
    for (const path of ['/etc/example.md', '~/example.md', '../example.md', 'docs\\example.md', 'C:example.md']) {
      expect(reasonOf(builderListing([{ kind: 'file', path }])), path).toBe('agents.builder.instructions[0].path is not a path inside the repository');
    }
    expect(reasonOf(builderListing([{ kind: 'file', path: ' ' }]))).toBe('agents.builder.instructions[0].path is not a non-blank text');
  });

  test('an instruction list naming the constitution, a default brief or a file twice is refused', () => {
    const builderListing = (instructions: unknown): Record<string, unknown> => minimalWith({ agents: { builder: { instructions } } });

    expect(reasonOf(builderListing([{ kind: 'constitution' }, { kind: 'constitution' }]))).toBe('agents.builder.instructions lists {"kind":"constitution"} twice');
    expect(reasonOf(builderListing([{ kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reviewer' }])))
      .toBe('agents.builder.instructions lists {"kind":"default-brief","role":"reviewer"} twice');
    expect(reasonOf(builderListing([{ kind: 'file', path: 'docs/a.md' }, { kind: 'file', path: 'docs/a.md' }])))
      .toBe('agents.builder.instructions lists {"kind":"file","path":"docs/a.md"} twice');
  });

  test('a constitution path outside the repository is refused', () => {
    expect(reasonOf(minimalWith({ constitution: { path: '../CONSTITUTION.md' } }))).toBe('constitution.path is not a path inside the repository');
    expect(reasonOf(minimalWith({ constitution: ['CLAUDE.md'] }))).toBe('constitution is not an object');
  });

  test('a re-review threshold below the step of 50 lines, or not a whole number, is refused', () => {
    expect(reasonOf(minimalWith({ review: { name: 'review', reReview: { thresholdLines: 49 } } }))).toBe('review.reReview.thresholdLines is not a whole number of at least 50');
    expect(reasonOf(minimalWith({ airlock: { reReview: { thresholdLines: 50.5 } } }))).toBe('airlock.reReview.thresholdLines is not a whole number of at least 50');
    const lowestAirlock = { reReview: { thresholdLines: 50 } };
    expect(readingOf(minimalWith({ airlock: lowestAirlock }))).toMatchObject({ verdict: 'readable', pipeline: { airlock: lowestAirlock } });
  });

  test('an approval switch that is not a boolean is refused', () => {
    expect(reasonOf(minimalWith({ approvals: { tickets: 'off' } }))).toBe('approvals.tickets is not true or false');
    expect(reasonOf(minimalWith({ approvals: true }))).toBe('approvals is not an object');
  });

  test('billing holding another mode, a budget that is not positive or a budget with subscription is refused', () => {
    expect(reasonOf(minimalWith({ billing: { mode: 'bedrock' } }))).toBe('billing.mode is neither subscription nor api');
    expect(reasonOf(minimalWith({ billing: {} }))).toBe('billing.mode is neither subscription nor api');
    expect(reasonOf(minimalWith({ billing: { mode: 'api', maxBudgetUsd: 0 } }))).toBe('billing.maxBudgetUsd is not a positive number');
    expect(reasonOf(minimalWith({ billing: { mode: 'api', maxBudgetUsd: '5' } }))).toBe('billing.maxBudgetUsd is not a positive number');
    expect(reasonOf(minimalWith({ billing: { mode: 'subscription', maxBudgetUsd: 5 } }))).toBe('billing.maxBudgetUsd is present with mode subscription');
    expect(reasonOf(minimalWith({ billing: 'api' }))).toBe('billing is not an object');
    expect(readingOf(minimalWith({ billing: { mode: 'subscription' } }))).toMatchObject({ verdict: 'readable', pipeline: { billing: { mode: 'subscription' } } });
  });
});

describe('the Assistant\'s switch', () => {
  test('is on while the key holds true and off without it, with and without entities, and writes back byte for byte', () => {
    const packageEntity = {
      kind: 'package', home: ['/packages/shared'], prepare: [], gates: [TEST_GATE], phases: { build: ['test'], review: ['test'], merge: ['test'] }
    };
    for (const document of [withTestGateAnd({ assistant: true }), minimalWith({ assistant: true, entities: { shared: packageEntity } })]) {
      const reading  = readingOf(document);
      const contents = reading.verdict === 'readable' ? PipelineFile.contentsOf(reading.pipeline) : '';

      expect(reading).toMatchObject({ verdict: 'readable', pipeline: { assistant: true } });
      expect(JSON.parse(contents)).toEqual(document);
      const readAgain = readingOfText(contents);
      expect(readAgain.verdict === 'readable' ? PipelineFile.contentsOf(readAgain.pipeline) : '').toBe(contents);
    }
    expect(readingOf(withTestGateAnd({}))).not.toMatchObject({ pipeline: { assistant: true } });
  });

  test('held as anything but true is a problem, false included', () => {
    for (const assistant of [false, 'on', 1, null]) expect(reasonOf(minimalWith({ assistant })), String(assistant)).toBe('assistant is present and is not true');
  });
});

describe('folders and reach', () => {
  test('a prepare step and a gate run in a project folder, or in a repository folder that starts with /, which alone is the root', () => {
    for (const folder of ['packages/example', '/', '/apps/example', 'docs']) {
      expect(readingOf(minimalWith({ prepare: [{ name: 'install', run: 'bun install', in: folder }] })))
        .toMatchObject({ verdict: 'readable', pipeline: { prepare: [{ in: folder }] } });
      expect(readingOf(withTestGateAnd({ gates: [{ ...TEST_GATE, in: folder }] }))).toMatchObject({ verdict: 'readable', pipeline: { gates: [{ in: folder }] } });
    }
  });

  test('a folder that leaves the repository, names a drive, holds a backslash or is blank is refused, naming the step or gate', () => {
    for (const folder of ['../sibling', '/../sibling', '//server/share', 'C:/example', 'packages\\example', 'packages/../../sibling']) {
      expect(reasonOf(minimalWith({ prepare: [{ name: 'install', run: 'bun install', in: folder }] }))).toBe('prepare[0].in is not a folder inside the repository');
      expect(reasonOf(withTestGateAnd({ gates: [{ ...TEST_GATE, in: folder }] }))).toBe('gates[0].in is not a folder inside the repository');
    }
    expect(reasonOf(minimalWith({ prepare: [{ name: 'install', run: 'bun install', in: ' ' }] }))).toBe('prepare[0].in is present and is not a non-blank text');
  });

  test('reach names repository paths that start with /, each once, and never the root alone or a path leaving it', () => {
    expect(readingOf(minimalWith({ reach: ['/packages/shared', '/bun.lock'] }))).toMatchObject({ verdict: 'readable', pipeline: { reach: ['/packages/shared', '/bun.lock'] } });
    expect(reasonOf(minimalWith({ reach: ['packages/shared'] }))).toBe('reach names "packages/shared", which is not a repository path leading with /');
    expect(reasonOf(minimalWith({ reach: ['/'] }))).toBe('reach names "/", which is not a repository path leading with /');
    expect(reasonOf(minimalWith({ reach: ['/../sibling'] }))).toBe('reach names "/../sibling", which is not a repository path leading with /');
    expect(reasonOf(minimalWith({ reach: ['/bun.lock', '/bun.lock'] }))).toBe('reach names "/bun.lock" twice');
    expect(reasonOf(minimalWith({ reach: '/bun.lock' }))).toBe('reach is not a list of non-blank texts');
  });
});
