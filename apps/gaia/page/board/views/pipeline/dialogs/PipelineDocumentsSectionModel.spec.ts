/**
 * The Pipeline documents section's model. What matters: the builder reads both documents always and the reviewer the spec always and the
 * plan only if User approved it, unless the pipeline stores other rules; the reviewer's spec stays at Always, its other choices disabled,
 * while every choice of the builder is open; a Save stores only the rules that differ from the default, and none when all are the
 * default; and the reviewer's line on the builder words each rule the builder reads by.
 */
import { describe, expect, test } from 'bun:test';

import { PipelineDocumentsSectionModel } from './PipelineDocumentsSectionModel.ts';

describe('the rules', () => {
  test('a role reads by its defaults where the pipeline stores no rule, and by the stored rule where it does', () => {
    expect(PipelineDocumentsSectionModel.rulesOf('builder', undefined)).toEqual({ spec: 'always', plan: 'always' });
    expect(PipelineDocumentsSectionModel.rulesOf('reviewer', undefined)).toEqual({ spec: 'always', plan: 'if-person-approved' });
    expect(PipelineDocumentsSectionModel.rulesOf('builder', { plan: 'never' })).toEqual({ spec: 'always', plan: 'never' });
  });

  test('the reviewer reads the spec always, whatever the pipeline stores', () => {
    expect(PipelineDocumentsSectionModel.rulesOf('reviewer', { spec: 'never', plan: 'never' })).toEqual({ spec: 'always', plan: 'never' });
  });

  test('a Save stores only the rules that differ from the role\'s default, and none when every rule is the default', () => {
    expect(PipelineDocumentsSectionModel.storedRulesOf('reviewer', { spec: 'always', plan: 'if-person-approved' })).toBeNull();
    expect(PipelineDocumentsSectionModel.storedRulesOf('reviewer', { spec: 'always', plan: 'always' })).toEqual({ plan: 'always' });
    expect(PipelineDocumentsSectionModel.storedRulesOf('builder', { spec: 'if-person-approved', plan: 'never' })).toEqual({ spec: 'if-person-approved', plan: 'never' });
  });

  test('only the builder and the reviewer read pipeline documents', () => {
    expect(['builder', 'reviewer', 'reReviewer', 'specAgent'].map(PipelineDocumentsSectionModel.isDocumentReadingRole)).toEqual([true, true, false, false]);
  });
});

describe('the rows', () => {
  test('the reviewer\'s spec offers only Always, and its plan every choice with the hint against an agent-only plan', () => {
    const [spec, plan] = PipelineDocumentsSectionModel.rowsOf('reviewer', PipelineDocumentsSectionModel.defaultRulesOf('reviewer'));
    expect(spec?.choices.map((choice) => [choice.label, choice.disabled])).toEqual([['Always', false], ['If you approved it', true], ['Never', true]]);
    expect([spec?.title, spec?.groupName, spec?.selected, spec?.hint]).toEqual(['Spec', 'When the reviewer reads the spec', 'always', null]);
    expect(plan?.choices.every((choice) => !choice.disabled)).toBe(true);
    expect([plan?.selected, plan?.hint]).toEqual(['if-person-approved', 'An agent-only plan is another agent\'s opinion; leave it out.']);
  });

  test('the builder\'s rows keep every choice open and carry no hint', () => {
    const rows = PipelineDocumentsSectionModel.rowsOf('builder', PipelineDocumentsSectionModel.defaultRulesOf('builder'));
    expect(rows.flatMap((row) => row.choices).every((choice) => !choice.disabled)).toBe(true);
    expect(rows.map((row) => [row.groupName, row.hint])).toEqual([['When the builder reads the spec', null], ['When the builder reads the plan', null]]);
    expect(PipelineDocumentsSectionModel.withRule(PipelineDocumentsSectionModel.defaultRulesOf('builder'), 'plan', 'never')).toEqual({ spec: 'always', plan: 'never' });
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
