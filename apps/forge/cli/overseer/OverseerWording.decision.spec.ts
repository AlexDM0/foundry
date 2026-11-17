/**
 * The questions the Overseer itself opens, as User reads them in the question panel. What matters: `checks-not-set` says in its own words
 * that no pipeline is set and how one gets set, never the generic sentence that names only its kind; a kind with no wording of its own
 * still gets that generic sentence. Each entity decision has its own question with the choices `docs/cli.md` gives it, naming what it is
 * about: `work-in-other-entity` offers a move to each entity that owns the work and abandoning (E15), `package-refused` its three answers
 * (E22), `whitelist-removed-mid-crossing` its two (E19) and `dependent-broken` a fix ticket for the dependent in the ticket's group and
 * abandoning (E26), each option labelled as the Overseer reads the answer back and naming no command; the need decisions name the need, and
 * `second-return` the package. The fix ticket of a dependent carries a numbered Acceptance and a Brief, so it can be readied.
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

test('E26: dependent-broken names the package and the dependent and offers a fix ticket in the group or abandoning, naming no command', () => {
  const wording = OverseerWording.decisionWordingOf({
    kind: 'dependent-broken', ticketIds: ['001'], jobId: null, subject: { packageEntity: 'ui-kit', dependentEntity: 'admin' }
  });

  expect(wording.questions[0]?.question).toBe('The change of the package `ui-kit` by #001 breaks `admin`: its gate is still red after the package '
    + 'builder tried to fix it. File a fix ticket for it in the group of the ticket, or abandon the ticket.');
  expect(wording.questions[0]?.options.map((option) => option.label)).toEqual([`${ENTITY_DECISION_ANSWERS.fileAFixTicketForPrefix}admin`, ENTITY_DECISION_ANSWERS.abandon]);
  expect(JSON.stringify(wording)).not.toContain(PRODUCT_NAMES.PROGRAM);
  expect(JSON.stringify(wording)).not.toContain('--');
});

test('E26: the fix ticket of a dependent names the change it fixes, with a numbered Acceptance and a Brief', () => {
  const fix = OverseerWording.dependentFixWordingOf({
    ticketId: '001', ticketBranch: 'forge/001', homeEntity: 'shop', packageEntity: 'ui-kit', dependentEntity: 'admin', group: 'ticket-001'
  });

  expect(fix.title).toBe('Fix admin for the change of ui-kit in #001');
  expect(fix.body).toStartWith('## Acceptance\n\nA1. The gates of `admin` pass with the change of `ui-kit` that ticket #001 makes.\n\n## Brief\n\n');
  expect(fix.body).toContain('the group `ticket-001`');
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
