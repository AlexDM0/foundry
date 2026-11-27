/**
 * The form of "Add a repository" (`docs/design/screens.md`, "Add a repository"). What matters: the project name follows the folder's name
 * until User types one, and follows it again once cleared; "Add and start" can be sent only with a folder, a name and a forge program, and
 * not twice at once; the command carries the trimmed folder and name; the forge program is missing only when neither the settings nor Gaia know one.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_EMPTY }       from '../../testing/fixtures/fleet-empty.ts';
import { AddRepositoryForm } from './AddRepositoryForm.ts';

const READY = { forgeProgramIsMissing: false, addIsOnItsWay: false };

describe('the add-a-repository form', () => {
  test('names the project after the folder until User types a name, and again after User clears it', () => {
    const chosen = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '/Users/alexexample/development/example-storefront/');
    expect(chosen.project).toBe('example-storefront');
    const typed = AddRepositoryForm.formAfterProject(chosen, 'Example Storefront');
    expect(AddRepositoryForm.formAfterFolder(typed, '/Users/alexexample/development/invoice-service').project).toBe('Example Storefront');
    const cleared = AddRepositoryForm.formAfterProject(typed, '');
    expect(cleared.project).toBe('');
    expect(AddRepositoryForm.formAfterFolder(cleared, '/Users/alexexample/development/invoice-service').project).toBe('invoice-service');
  });

  test('can send "Add and start" only with a folder, a name and a forge program, and not while an add is on its way', () => {
    const filled = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');
    expect(AddRepositoryForm.addAndStartCanBeSent(filled, READY)).toBe(true);
    expect(AddRepositoryForm.addAndStartCanBeSent(AddRepositoryForm.EMPTY_FORM, READY)).toBe(false);
    expect(AddRepositoryForm.addAndStartCanBeSent(AddRepositoryForm.formAfterProject(filled, '  '), READY)).toBe(false);
    expect(AddRepositoryForm.addAndStartCanBeSent(filled, { ...READY, forgeProgramIsMissing: true })).toBe(false);
    expect(AddRepositoryForm.addAndStartCanBeSent(filled, { ...READY, addIsOnItsWay: true })).toBe(false);
  });

  test('sends forge-add with the folder as the root and the name, both trimmed', () => {
    const form = AddRepositoryForm.formAfterProject(AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, ' ~/development/wiki '), ' Research Wiki ');
    expect(AddRepositoryForm.addCommandOf(form)).toEqual({ kind: 'forge-add', root: '~/development/wiki', project: 'Research Wiki' });
  });

  test('finds the forge program missing only when neither the settings nor Gaia know one', () => {
    expect(AddRepositoryForm.forgeProgramIsMissingIn(FLEET_EMPTY)).toBe(true);
    const chosen = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, forgeProgramPath: '/Users/alexexample/.bun/bin/forge' } };
    expect(AddRepositoryForm.forgeProgramIsMissingIn(chosen)).toBe(false);
    const found = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: '/Users/alexexample/.bun/bin/forge' } };
    expect(AddRepositoryForm.forgeProgramIsMissingIn(found)).toBe(false);
  });
});
