/**
 * The questions the Overseer itself opens, as User reads them in the question panel. What matters: `checks-not-set` says in its own words
 * that no pipeline is set and how one gets set, never the generic sentence that names only its kind; a kind with no wording of its own
 * still gets that generic sentence. Each entity decision but `dependent-broken` (left to the owner's answer on E26) has its own question
 * with the choices `docs/cli.md` gives it, naming what it is about: `work-in-other-entity` offers a move to each entity that owns the work
 * and abandoning (E15), `package-refused` its three answers (E22) and `whitelist-removed-mid-crossing` its two (E19), each option labelled
 * as the Overseer reads the answer back; the need decisions name the need, and `second-return` the package.
 */
import { expect, test } from 'bun:test';

import type { DecisionKind }       from '../../src/lib/tracker-model/@types/Decision.ts';
import { ENTITY_DECISION_ANSWERS } from '../../src/lib/tracker-model/constants/EntityDecisionAnswers.ts';
import { PRODUCT_NAMES }           from '../../src/shared/constants/ProductNames.ts';
import { OverseerWording }         from './OverseerWording.ts';

test('checks-not-set says that no pipeline is set and that the setup\'s Apply sets one and withdraws the question', () => {
  const wording = OverseerWording.decisionWordingOf({ kind: 'checks-not-set', ticketIds: [], jobId: null });

  expect(wording.questions).toEqual([{
    question:    'No pipeline is set, so no ticket builds. Set up the pipeline on the Pipeline page, then press Apply.',
    header:      'checks-not-set',
    multiSelect: false,
    options:     [],
  }]);
  expect(wording.context).toContain('Apply withdraws this question.');
  expect(wording.context).toContain(`\`${PRODUCT_NAMES.PROGRAM} gate none\``);
  expect(JSON.stringify(wording)).not.toContain('needs a decision');
});

test('a kind with no wording of its own is named in the generic sentence', () => {
  const wording = OverseerWording.decisionWordingOf({ kind: 'target-moved', ticketIds: ['004'], jobId: null });

  expect(wording.questions[0]?.question).toBe('The Overseer needs a decision (target-moved) about #004.');
});

function optionLabelsOf(kind: DecisionKind, subject: Parameters<typeof OverseerWording.decisionWordingOf>[0]['subject'] = {}): string[] {
  return OverseerWording.decisionWordingOf({
    kind, ticketIds: ['001'], jobId: null, subject
  }).questions.flatMap((question) => question.options.map((option) => option.label));
}

test('E15: work-in-other-entity offers a move to each entity that owns the work, then abandoning, and names the files', () => {
  const wording = OverseerWording.decisionWordingOf({
    kind: 'work-in-other-entity', ticketIds: ['001'], jobId: null, subject: { owningEntities: ['admin'], paths: ['apps/admin/src/Example.ts'] }
  });

  expect(optionLabelsOf('work-in-other-entity', { owningEntities: ['admin', 'ui-kit'] })).toEqual([
    `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}admin`, `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}ui-kit`, ENTITY_DECISION_ANSWERS.abandon,
  ]);
  expect(wording.questions[0]?.question).toContain('All the work of #001 belongs to another entity (`admin`)');
  expect(wording.context).toContain('`apps/admin/src/Example.ts`');
});

test('E22: package-refused names the package and offers dropping the change, a need and abandoning', () => {
  const wording = OverseerWording.decisionWordingOf({
    kind: 'package-refused', ticketIds: ['001'], jobId: null, subject: { packageEntity: 'ui-kit' }
  });

  expect(wording.questions[0]?.question).toContain('The builder of the package `ui-kit` refused the change of #001');
  expect(optionLabelsOf('package-refused')).toEqual([
    ENTITY_DECISION_ANSWERS.dropThePackageChange, ENTITY_DECISION_ANSWERS.turnItIntoANeed, ENTITY_DECISION_ANSWERS.abandon,
  ]);
});

test('E19: whitelist-removed-mid-crossing names the package and offers finishing under the old whitelist or a need', () => {
  const wording = OverseerWording.decisionWordingOf({
    kind: 'whitelist-removed-mid-crossing', ticketIds: ['001'], jobId: null, subject: { packageEntity: 'ui-kit' }
  });

  expect(wording.questions[0]?.question).toContain('The package `ui-kit` left the whitelist while #001 crossed into it');
  expect(optionLabelsOf('whitelist-removed-mid-crossing')).toEqual([
    ENTITY_DECISION_ANSWERS.finishUnderTheOldWhitelist, ENTITY_DECISION_ANSWERS.turnThePackageChangeIntoANeed,
  ]);
});

test('the need decisions name the need, second-return the package, and none falls to the generic sentence (E12, E13, E14, E45)', () => {
  for (const kind of ['need-for-root', 'need-closes-circle', 'need-abandoned', 'second-return'] as const) {
    const wording = OverseerWording.decisionWordingOf({
      kind, ticketIds: ['001'], jobId: null, subject: { need: 'admin: Example need', packageEntity: 'ui-kit' }
    });
    expect(JSON.stringify(wording), kind).not.toContain('needs a decision');
    expect(wording.questions[0]?.options.length, kind).toBeGreaterThan(0);
  }
  expect(OverseerWording.decisionWordingOf({
    kind: 'need-for-root', ticketIds: ['001'], jobId: null, subject: { need: 'root: Example need' }
  })
    .questions[0]?.question).toContain('the need "root: Example need"');
  expect(OverseerWording.decisionWordingOf({
    kind: 'second-return', ticketIds: ['001'], jobId: null, subject: { packageEntity: 'ui-kit' }
  })
    .questions[0]?.question).toContain('the package `ui-kit`');
});

test('dependent-broken keeps the generic sentence until the owner answers E26', () => {
  expect(OverseerWording.decisionWordingOf({ kind: 'dependent-broken', ticketIds: ['001'], jobId: null }).questions[0]?.question)
    .toBe('The Overseer needs a decision (dependent-broken) about #001.');
});

test('the need of a refused package change carries the reason and the proposal as a fenced diff, with a numbered Acceptance', () => {
  const need = OverseerWording.packageNeedWordingOf({
    cause:         'package-refused',
    ticketId:      '001',
    ticketBranch:  'forge/001',
    homeEntity:    'shop',
    packageEntity: 'ui-kit',
    refusedReason: 'The constitution forbids a second export.',
    proposal:      'diff --git a/packages/ui-kit/src/Example.ts b/packages/ui-kit/src/Example.ts\n+export const second = 2;\n',
  });

  expect(need.title).toBe('Change ui-kit for #001 of shop');
  expect(need.body).toStartWith('## Acceptance\n\nA1. `ui-kit` holds the change');
  expect(need.body).toContain('The constitution forbids a second export.');
  expect(need.body).toContain('~~~~diff\ndiff --git a/packages/ui-kit/src/Example.ts');
  expect(need.body).toContain('`forge/001`');
});
