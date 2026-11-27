/**
 * One table of reports, each with the verdict its schema gives; the validator and the draft-07 document are one source, so it holds both.
 * The cases that matter are the shapes the design removed or constrained, and the reports only a crossing ticket's stages may send.
 */
import { describe, expect, test } from 'bun:test';

import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  EFFECT_READING_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from './ReportSchemas.ts';
import { reportVerdictOf, type JsonSchema } from './ReportValidation.ts';

const HEAD = 'a'.repeat(40);

const BUILT = {
  role:              'builder',
  outcome:           'built',
  headCommit:        HEAD,
  acceptance:        [{ item: 'A1', state: 'met', evidence: 'cli/Main.spec.ts › relays' }],
  alsoFixed:         [],
  gates:             [{ name: 'tests', commit: HEAD }],
  handoff:           'Done.',
  blockedReason:     null,
  cannotBuildReason: null,
};

const FINDING = {
  class: 'correctness', severity: 'quality', file: 'cli/Main.ts', summary: 'Off by one.', evidence: 'probe'
} as const;

const REVIEWED = {
  role:       'reviewer',
  headCommit: HEAD,
  claims:     [{
    item: 'A1', result: 'holds', handoffContradicted: false, note: 'Watched it fail.'
  }],
  findings: [{ ...FINDING, outcome: 'fixed', commit: HEAD }, {
    ...FINDING, outcome: 'filed', filedTicketId: null, hatchRequestId: '5f0c'
  }],
  reviewText: 'Holds.',
};

const RESOLVED = {
  role: 'reviewer', outcome: 'resolved', headCommit: HEAD, resolvedFiles: ['cli/Main.ts'], notes: '', reportKind: null
};

const PACKAGE_RETURN = { ...BUILT, outcome: 'package-return', packageReturnReason: 'The package must export the price in cents.' };

const ITEM_NAMED_BY_ITS_TEXT = { ...BUILT, acceptance: [{ item: 'A1. The palette names a colour.', state: 'met', evidence: 'palette.txt line 1' }] };

const EFFECT_READ = {
  references: [{ reference: 1, lines: { from: 4, to: 4 }, quote: 'Change the basket total.' }],
  entries:    [{
    reference: 1, path: 'src/Basket.ts', change: 'changes', detail: 'The total sums the lines.', candidates: []
  }],
};

const REPORT_TABLE: ReadonlyArray<[name: string, schema: JsonSchema, report: unknown, valid: boolean]> = [
  ['a built builder report', BUILDER_REPORT_SCHEMA, BUILT, true],
  ['a blocked builder report with its reason', BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'blocked', blockedReason: 'The worktree is gone.' }, true],
  ['a builder report declaring needs', BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'needs-declared' }, true],
  ['a builder report with an outcome outside the vocabulary', BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'needs' }, false],
  ['a blocked builder report without a reason', BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'blocked' }, false],
  ['a builder report carrying blockedOn', BUILDER_REPORT_SCHEMA, { ...BUILT, blockedOn: 'Which currency?' }, false],
  ['a builder report with a short head commit', BUILDER_REPORT_SCHEMA, { ...BUILT, headCommit: 'abc123' }, false],
  ['a builder report with a round', BUILDER_REPORT_SCHEMA, { ...BUILT, round: 2 }, false],
  ['a builder report without gate claims', BUILDER_REPORT_SCHEMA, Object.fromEntries(Object.entries(BUILT).filter(([field]) => field !== 'gates')), false],
  ['a builder report claiming a gate on a short commit', BUILDER_REPORT_SCHEMA, { ...BUILT, gates: [{ name: 'tests', commit: 'abc123' }] }, false],
  ['an acceptance evidence over 300 characters', BUILDER_REPORT_SCHEMA, { ...BUILT, acceptance: [{ item: 'A1', state: 'met', evidence: 'x'.repeat(301) }] }, false],
  ['an acceptance item named by its text rather than its label', BUILDER_REPORT_SCHEMA, ITEM_NAMED_BY_ITS_TEXT, false],
  ['a reviewer report with a fixed and a queued filed finding', REVIEWER_REPORT_SCHEMA, REVIEWED, true],
  ['a claim naming its item by its text rather than its label', REVIEWER_REPORT_SCHEMA, {
    ...REVIEWED,
    claims: [{
      item: 'A1. The palette names a colour.', result: 'holds', handoffContradicted: false, note: ''
    }]
  }, false],
  ['a filed finding naming its ticket', REVIEWER_REPORT_SCHEMA, {
    ...REVIEWED,
    findings: [{
      ...FINDING, outcome: 'filed', filedTicketId: '014', hatchRequestId: null
    }]
  }, true],
  ['a filed finding naming neither', REVIEWER_REPORT_SCHEMA, {
    ...REVIEWED,
    findings: [{
      ...FINDING, outcome: 'filed', filedTicketId: null, hatchRequestId: null
    }]
  }, false],
  ['a file-ticket finding', REVIEWER_REPORT_SCHEMA, { ...REVIEWED, findings: [{ ...FINDING, outcome: 'file-ticket' }] }, false],
  ['a reviewer report with a verdict', REVIEWER_REPORT_SCHEMA, { ...REVIEWED, verdict: 'released' }, false],
  ['a claim result outside the vocabulary', REVIEWER_REPORT_SCHEMA, {
    ...REVIEWED,
    claims: [{
      item: 'A1', result: 'maybe', handoffContradicted: false, note: ''
    }]
  }, false],
  ['a resolved Airlock agent report', AIRLOCK_AGENT_REPORT_SCHEMA, RESOLVED, true],
  ['a builder in the Airlock that cannot resolve a malformed ticket', AIRLOCK_AGENT_REPORT_SCHEMA, {
    ...RESOLVED, role: 'builder', outcome: 'cannot-resolve', reportKind: 'malformed-ticket'
  }, true],
  ['a reviewer in the Airlock that cannot resolve, with no kind', AIRLOCK_AGENT_REPORT_SCHEMA, { ...RESOLVED, outcome: 'cannot-resolve' }, true],
  ['a resolved report carrying a report kind', AIRLOCK_AGENT_REPORT_SCHEMA, { ...RESOLVED, reportKind: 'system-blocker' }, false],
  ['an Airlock agent report of the pipeline agent role', AIRLOCK_AGENT_REPORT_SCHEMA, { ...RESOLVED, role: 'pipeline-agent' }, false],
  ['a package builder report stating what the package exposes', PACKAGE_BUILDER_REPORT_SCHEMA, { ...BUILT, exposedSurfaceChanged: false }, true],
  ['a package builder report that states nothing of what the package exposes (E40)', PACKAGE_BUILDER_REPORT_SCHEMA, BUILT, false],
  ['a package builder report stating it as text', PACKAGE_BUILDER_REPORT_SCHEMA, { ...BUILT, exposedSurfaceChanged: 'no' }, false],
  ['a builder report of any other stage stating it', BUILDER_REPORT_SCHEMA, { ...BUILT, exposedSurfaceChanged: false }, false],
  ['a package builder report refusing the change with its reason (E22)', PACKAGE_BUILDER_REPORT_SCHEMA, {
    ...BUILT, outcome: 'refused', exposedSurfaceChanged: false, refusedReason: 'The constitution forbids a second export.'
  }, true],
  ['a package builder report refusing the change without a reason', PACKAGE_BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'refused', exposedSurfaceChanged: false }, false],
  ['a package builder report refusing the change with an empty reason', PACKAGE_BUILDER_REPORT_SCHEMA, {
    ...BUILT, outcome: 'refused', exposedSurfaceChanged: false, refusedReason: ''
  }, false],
  ['a blocked package builder report still needing its reason', PACKAGE_BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'blocked', exposedSurfaceChanged: false }, false],
  ['a builder report of any other stage refusing the change', BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'refused', refusedReason: 'Forbidden.' }, false],
  ['a package reviewer report confirming the statement', PACKAGE_REVIEWER_REPORT_SCHEMA, { ...REVIEWED, exposedSurfaceConfirmed: true }, true],
  ['a package reviewer report that neither confirms nor corrects it (E40)', PACKAGE_REVIEWER_REPORT_SCHEMA, REVIEWED, false],
  ['a reviewer report of any other stage confirming it', REVIEWER_REPORT_SCHEMA, { ...REVIEWED, exposedSurfaceConfirmed: true }, false],
  ['a built adapt builder report, as any builder report', ADAPT_BUILDER_REPORT_SCHEMA, BUILT, true],
  ['an adapt builder report sending the ticket back with its reason (E41)', ADAPT_BUILDER_REPORT_SCHEMA, PACKAGE_RETURN, true],
  ['an adapt builder report naming the package it sends the ticket back to (E41)', ADAPT_BUILDER_REPORT_SCHEMA, { ...PACKAGE_RETURN, packageReturnEntity: 'ui-kit' }, true],
  ['an adapt builder report sending the ticket back without a reason (E41)', ADAPT_BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'package-return' }, false],
  ['an adapt builder report sending the ticket back with an empty reason (E41)', ADAPT_BUILDER_REPORT_SCHEMA, { ...PACKAGE_RETURN, packageReturnReason: '' }, false],
  ['a blocked adapt builder report still needing its reason', ADAPT_BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'blocked' }, false],
  ['an adapt builder report refusing the change, which only a package build may', ADAPT_BUILDER_REPORT_SCHEMA, { ...BUILT, outcome: 'refused', refusedReason: 'No.' }, false],
  ['a builder report of any other stage sending the ticket back (E41)', BUILDER_REPORT_SCHEMA, PACKAGE_RETURN, false],
  ['a package builder report sending the ticket back (E41)', PACKAGE_BUILDER_REPORT_SCHEMA, { ...PACKAGE_RETURN, exposedSurfaceChanged: false }, false],
  ['an effect reading report naming a reference and its places', EFFECT_READING_REPORT_SCHEMA, EFFECT_READ, true],
  ['an effect reading report with a change no reading makes', EFFECT_READING_REPORT_SCHEMA, { ...EFFECT_READ, entries: [{ ...EFFECT_READ.entries[0], change: 'renames' }] }, false],
  ['an effect reading report with a field of its own', EFFECT_READING_REPORT_SCHEMA, { ...EFFECT_READ, summary: 'Two files.' }, false],
];

describe('the report table', () => {
  test.each(REPORT_TABLE)('%s', (_name, schema, report, valid) => {
    expect(reportVerdictOf(schema, report).verdict).toBe(valid ? 'valid' : 'invalid');
  });

  test('each schema is a draft-07 document that survives JSON unchanged, as the command line receives it', () => {
    for (const schema of [
      BUILDER_REPORT_SCHEMA,
      REVIEWER_REPORT_SCHEMA,
      AIRLOCK_AGENT_REPORT_SCHEMA,
      PACKAGE_BUILDER_REPORT_SCHEMA,
      PACKAGE_REVIEWER_REPORT_SCHEMA,
      ADAPT_BUILDER_REPORT_SCHEMA,
      EFFECT_READING_REPORT_SCHEMA,
    ]) {
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    }
  });

  test('a commit id is a full SHA-1 or SHA-256 one, never a shortened or a mixed-length one', () => {
    for (const commit of ['b'.repeat(64), 'c'.repeat(40)]) {
      expect(reportVerdictOf(BUILDER_REPORT_SCHEMA, { ...BUILT, headCommit: commit, gates: [{ name: 'tests', commit }] }).verdict).toBe('valid');
    }
    for (const commit of ['d'.repeat(39), 'e'.repeat(52), 'f'.repeat(65)]) {
      expect(reportVerdictOf(BUILDER_REPORT_SCHEMA, { ...BUILT, headCommit: commit }).verdict, commit).toBe('invalid');
    }
  });

  test('an invalid report names each problem by its path', () => {
    const problems = ['$.headCommit does not match ^(?:[0-9a-f]{40}|[0-9a-f]{64})$', '$.blockedOn is not allowed'];
    expect(reportVerdictOf(BUILDER_REPORT_SCHEMA, { ...BUILT, blockedOn: 'x', headCommit: 'abc' })).toEqual({ verdict: 'invalid', problems });
  });
});
