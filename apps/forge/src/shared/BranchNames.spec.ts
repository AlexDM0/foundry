/**
 * The names a board gives its branches, and when it may take a namespace. What matters: a board without a namespace names its branches
 * exactly as before namespaces, and claims no other board's; two namespaced boards never name the same branch, ticket 1 of each above
 * all; and a namespace is refused where git has no room for it, where another board's branches already sit, and while the board's own
 * branches are left under its current names.
 */
import { describe, expect, test } from 'bun:test';

import { BranchNamespaceUtil, branchNamesOf } from './BranchNames.ts';
import { PRODUCT_NAMES }                      from './constants/ProductNames.ts';

const { PROGRAM } = PRODUCT_NAMES;

describe('the names', () => {
  test('without a namespace are the bare names a board has always given, and no branch is another namespace\'s', () => {
    const bare = branchNamesOf(null);

    expect(bare.ticketBranchOf('007')).toBe('ticket-007');
    expect([bare.namespacePrefix, bare.ticketBranchPrefix, bare.groupTargetPrefix]).toEqual(['', 'ticket-', 'group-']);
    expect([`${PROGRAM}/web/ticket-001`, 'ticket-001', 'main'].map(bare.branchIsInAnotherNamespace)).toEqual([false, false, false]);
  });

  test('with a namespace sit under the program\'s name and the namespace', () => {
    const web = branchNamesOf('web');

    expect(web.ticketBranchOf('007')).toBe(`${PROGRAM}/web/ticket-007`);
    expect(web.groupTargetPrefix).toBe(`${PROGRAM}/web/group-`);
  });

  test('of two boards in one repository never meet, ticket 1 of each included', () => {
    const web = branchNamesOf('web');
    const api = branchNamesOf('api');

    expect(web.ticketBranchOf('001')).not.toBe(api.ticketBranchOf('001'));
    expect(web.branchIsInAnotherNamespace(api.ticketBranchOf('001'))).toBe(true);
    expect(web.branchIsInAnotherNamespace(`${api.groupTargetPrefix}checkout`)).toBe(true);
    expect(web.branchIsInAnotherNamespace(web.ticketBranchOf('001'))).toBe(false);
    expect(web.branchIsInAnotherNamespace('ticket-001')).toBe(false);
  });
});

describe('a namespace', () => {
  test('is lower-case letters and digits with inner dashes, at most 40 characters', () => {
    expect(['web', 'web-2', 'a', 'a'.repeat(40)].map(BranchNamespaceUtil.namespaceIsWellFormed)).toEqual([true, true, true, true]);
    expect(['', 'Web', '-web', 'web-', 'web/api', 'web.api', 'web_api', 'a'.repeat(41)].map(BranchNamespaceUtil.namespaceIsWellFormed))
      .toEqual([false, false, false, false, false, false, false, false]);
  });

  test('is taken by an idle board among unrelated branches, and the board\'s own namespace again is no change', () => {
    expect(BranchNamespaceUtil.refusalOf(['main', 'claude/example', 'release-1'], branchNamesOf(null), 'web')).toBeNull();
    expect(BranchNamespaceUtil.refusalOf([`${PROGRAM}/web/ticket-001`], branchNamesOf('web'), 'web')).toBeNull();
  });

  test('is refused where a branch named as the program or as the program and the namespace leaves git no room', () => {
    expect(BranchNamespaceUtil.refusalOf(['main', PROGRAM], branchNamesOf(null), 'web')).toEqual({ reason: 'branch-blocks-namespace', branch: PROGRAM });
    expect(BranchNamespaceUtil.refusalOf([`${PROGRAM}/web`], branchNamesOf(null), 'web')).toEqual({ reason: 'branch-blocks-namespace', branch: `${PROGRAM}/web` });
  });

  test('is refused where another board\'s branches already sit in it', () => {
    expect(BranchNamespaceUtil.refusalOf([`${PROGRAM}/web/ticket-004`, `${PROGRAM}/api/ticket-001`], branchNamesOf(null), 'web'))
      .toEqual({ reason: 'namespace-has-branches', branches: [`${PROGRAM}/web/ticket-004`] });
  });

  test('is refused while the board\'s branches are left under its current names, bare or namespaced', () => {
    expect(BranchNamespaceUtil.refusalOf(['main', 'ticket-003', 'group-checkout'], branchNamesOf(null), 'web'))
      .toEqual({ reason: 'board-has-branches', branches: ['ticket-003', 'group-checkout'] });
    expect(BranchNamespaceUtil.refusalOf([`${PROGRAM}/old/ticket-003`, `${PROGRAM}/api/ticket-001`], branchNamesOf('old'), 'web'))
      .toEqual({ reason: 'board-has-branches', branches: [`${PROGRAM}/old/ticket-003`] });
  });
});
