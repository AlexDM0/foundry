/** What an agent reads of a report its schema refuses never changes: each frozen case checks back as today's one problem (package 3). */
import { expect, test } from 'bun:test';

import FROZEN_PROBLEMS                      from './FrozenReportProblems.json';
import { ReportProblemWording }             from './ReportProblemWording.ts';
import { type JsonSchema, reportVerdictOf } from './ReportValidation.ts';

/** One property for each keyword of the subset, so each frozen report breaks exactly one of them. */
const EVERY_KEYWORD_SCHEMA: JsonSchema = {
  type:                 'object',
  required:             ['name'],
  additionalProperties: false,
  properties:           {
    name: {
      type: 'string', minLength: 2, maxLength: 5, pattern: '^[a-z]+$'
    },
    kind:     { enum: ['fix', 'file'] },
    marker:   { const: 'report' },
    items:    { type: 'array', minItems: 1, items: { type: 'string' } },
    either:   { anyOf: [{ type: 'string' }, { type: 'integer' }] },
    exactly:  { oneOf: [{ type: 'integer' }, { type: 'number' }] },
    nullable: { type: ['string', 'null'] },
    filed:    { type: 'object', if: { properties: { outcome: { const: 'filed' } }, required: ['outcome'] }, then: { required: ['ticket'] } },
  },
};

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const verdict = reportVerdictOf(EVERY_KEYWORD_SCHEMA, JSON.parse(stored));
    expect(verdict.verdict === 'invalid' ? verdict.problems.map(ReportProblemWording.sentenceOf) : []).toEqual([sentence]);
  });
}
