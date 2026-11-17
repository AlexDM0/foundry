/**
 * The fold of a package. What matters: the root comes first among the targets, then each app; folding into the root kept for a person only
 * removes the package, whose folders then fall to the root, while folding into an app adds its folders to the app's homes; every list that
 * named the package follows, a whitelist dropping it and a depends-on naming the target, and what the package depended on joins the app's;
 * and the folded draft passes the shared validator.
 */
import { describe, expect, test } from 'bun:test';

import { ENTITIES_STEP_ENTITIES, entitiesStepDraftOf } from '../../../testing/EntitiesStepFixture.ts';
import { EntitiesStepModel }                           from './EntitiesStepModel.ts';
import { EntityRefusalsModel }                         from './EntityRefusalsModel.ts';
import { FoldEntityDialogModel }                       from './FoldEntityDialogModel.ts';

const entities = ENTITIES_STEP_ENTITIES;
const draft = entitiesStepDraftOf();

describe('the fold', () => {
  test('the root comes first among the targets, then each app', () => {
    expect(FoldEntityDialogModel.targetsOf(entities)).toEqual(['root', 'web', 'admin']);
  });

  test('into the root kept for a person, the package only leaves: its folders fall to the root', () => {
    const after = EntitiesStepModel.entitiesAfterEdits(draft, FoldEntityDialogModel.foldEditsOf(entities, 'docs', 'root'));
    expect(Object.keys(after)).toEqual(['web', 'admin', 'ui', 'config']);
    expect(FoldEntityDialogModel.foldersOf(entities, 'docs', 'root')).toEqual({ before: ['every path no other entity owns'], after: ['every path no other entity owns', 'docs'], });
    expect(FoldEntityDialogModel.wordsOf(entities, 'docs', 'root').targetHint).toBe('Kept for a person: no gates, no constitution');
  });

  test('into an app, its folders join the app\'s homes, the lists that named it follow, and what it depended on joins the app\'s', () => {
    const after = EntitiesStepModel.entitiesAfterEdits(draft, FoldEntityDialogModel.foldEditsOf(entities, 'ui', 'web'));
    expect(after['web']?.home).toEqual(['/apps/web', '/packages/ui']);
    expect(after['web']?.whitelist).toBeUndefined();
    expect(after['web']?.dependsOn).toEqual(['config']);
    expect(after['admin']?.dependsOn).toEqual(['web']);
    expect(EntityRefusalsModel.refusalsOf(after)).toEqual([]);
  });

  test('the words name the target and the trade', () => {
    const words = FoldEntityDialogModel.wordsOf(entities, 'ui', 'web');
    expect(words.title).toBe('Fold ui into web?');
    expect(words.lead).toBe('ui stops being an entity. Its folders become further home folders of web.');
    expect(words.targetHint).toBe('An app with no build gate yet');
    expect(words.tradeDetail).toContain('Tickets of admin that change ui become a need for web, since a crossing goes into packages only.');
  });
});
