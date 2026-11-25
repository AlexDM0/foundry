/**
 * The Pipeline documents section's model. What matters: a role reads by the defaults the forge serves (today the builder both documents
 * always, the reviewer the spec always and the plan only if User approved it) unless the pipeline stores other rules; a document the forge
 * fixes for the role (the reviewer's spec) stays at its rule, its other choices disabled, while every other choice is open; a Save stores
 * only the rules that differ from the served default, and none when all are the default; Gaia keeps no default of its own, so other served
 * defaults move every one of these; and the reviewer's line on the builder words each rule the builder reads by.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_BOARD_LIMITS }                                        from '../../../testing/PageLimitsFixture.ts';
import { PipelineDocumentsSectionModel, type DocumentReadingDefaults } from './PipelineDocumentsSectionModel.ts';

const SERVED = EXAMPLE_BOARD_LIMITS;

/** Defaults another forge might serve: the builder never reads the plan, and its spec is fixed while the reviewer's is not. */
const OTHER_SERVED: DocumentReadingDefaults = {
  defaultDocumentsOfRole: { builder: { spec: 'if-person-approved', plan: 'never' }, reviewer: { spec: 'always', plan: 'always' } },
  fixedDocumentsOfRole:   { builder: ['spec'], reviewer: [] },
};

describe('the rules', () => {
  test('a role reads by its defaults where the pipeline stores no rule, and by the stored rule where it does', () => {
    expect(PipelineDocumentsSectionModel.rulesOf('builder', undefined, SERVED)).toEqual({ spec: 'always', plan: 'always' });
    expect(PipelineDocumentsSectionModel.rulesOf('reviewer', undefined, SERVED)).toEqual({ spec: 'always', plan: 'if-person-approved' });
    expect(PipelineDocumentsSectionModel.rulesOf('builder', { plan: 'never' }, SERVED)).toEqual({ spec: 'always', plan: 'never' });
  });

  test('the reviewer reads the spec always, whatever the pipeline stores', () => {
    expect(PipelineDocumentsSectionModel.rulesOf('reviewer', { spec: 'never', plan: 'never' }, SERVED)).toEqual({ spec: 'always', plan: 'never' });
  });

  test('a Save stores only the rules that differ from the role\'s default, and none when every rule is the default', () => {
    expect(PipelineDocumentsSectionModel.storedRulesOf('reviewer', { spec: 'always', plan: 'if-person-approved' }, SERVED)).toBeNull();
    expect(PipelineDocumentsSectionModel.storedRulesOf('reviewer', { spec: 'always', plan: 'always' }, SERVED)).toEqual({ plan: 'always' });
    expect(PipelineDocumentsSectionModel.storedRulesOf('builder', { spec: 'if-person-approved', plan: 'never' }, SERVED)).toEqual({ spec: 'if-person-approved', plan: 'never' });
  });

  test('the defaults, the fixed documents and what a Save stores all follow what the forge serves', () => {
    expect(PipelineDocumentsSectionModel.rulesOf('builder', undefined, OTHER_SERVED)).toEqual({ spec: 'if-person-approved', plan: 'never' });
    expect(PipelineDocumentsSectionModel.rulesOf('builder', { spec: 'always' }, OTHER_SERVED)).toEqual({ spec: 'if-person-approved', plan: 'never' });
    expect(PipelineDocumentsSectionModel.rulesOf('reviewer', { spec: 'never' }, OTHER_SERVED)).toEqual({ spec: 'never', plan: 'always' });
    expect(PipelineDocumentsSectionModel.storedRulesOf('reviewer', { spec: 'always', plan: 'always' }, OTHER_SERVED)).toBeNull();
    const [builderSpec] = PipelineDocumentsSectionModel.rowsOf('builder', PipelineDocumentsSectionModel.defaultRulesOf('builder', OTHER_SERVED), OTHER_SERVED);
    expect(builderSpec?.choices.map((choice) => choice.disabled)).toEqual([true, false, true]);
  });

  test('only the builder and the reviewer read pipeline documents', () => {
    expect(['builder', 'reviewer', 'reReviewer', 'specAgent'].map(PipelineDocumentsSectionModel.isDocumentReadingRole)).toEqual([true, true, false, false]);
  });
});

describe('the rows', () => {
  test('the reviewer\'s spec offers only Always, and its plan every choice with the hint against an agent-only plan', () => {
    const [spec, plan] = PipelineDocumentsSectionModel.rowsOf('reviewer', PipelineDocumentsSectionModel.defaultRulesOf('reviewer', SERVED), SERVED);
    expect(spec?.choices.map((choice) => [choice.label, choice.disabled])).toEqual([['Always', false], ['If you approved it', true], ['Never', true]]);
    expect([spec?.title, spec?.groupName, spec?.selected, spec?.hint]).toEqual(['Spec', 'When the reviewer reads the spec', 'always', null]);
    expect(plan?.choices.every((choice) => !choice.disabled)).toBe(true);
    expect([plan?.selected, plan?.hint]).toEqual(['if-person-approved', 'An agent-only plan is another agent\'s opinion; leave it out.']);
  });

  test('the builder\'s rows keep every choice open and carry no hint', () => {
    const rows = PipelineDocumentsSectionModel.rowsOf('builder', PipelineDocumentsSectionModel.defaultRulesOf('builder', SERVED), SERVED);
    expect(rows.flatMap((row) => row.choices).every((choice) => !choice.disabled)).toBe(true);
    expect(rows.map((row) => [row.groupName, row.hint])).toEqual([['When the builder reads the spec', null], ['When the builder reads the plan', null]]);
    expect(PipelineDocumentsSectionModel.withRule(PipelineDocumentsSectionModel.defaultRulesOf('builder', SERVED), 'plan', 'never')).toEqual({ spec: 'always', plan: 'never' });
  });
});

describe('the reviewer\'s line on the builder', () => {
  test('words each rule the builder reads by, and where to change it', () => {
    expect(PipelineDocumentsSectionModel.builderReadingTextOf({ spec: 'always', plan: 'always' }))
      .toBe('Reads the spec and the plan, always. Change it in the Builder\'s editor.');
    expect(PipelineDocumentsSectionModel.builderReadingTextOf({ spec: 'always', plan: 'if-person-approved' }))
      .toBe('Reads the spec, always, and the plan if you approved it. Change it in the Builder\'s editor.');
    expect(PipelineDocumentsSectionModel.builderReadingTextOf({ spec: 'always', plan: 'never' }))
      .toBe('Reads the spec, always. Never the plan. Change it in the Builder\'s editor.');
    expect(PipelineDocumentsSectionModel.builderReadingTextOf({ spec: 'never', plan: 'never' }))
      .toBe('Reads no pipeline document. Change it in the Builder\'s editor.');
  });
});
