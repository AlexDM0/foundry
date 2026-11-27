/**
 * The fold of a package: its targets, the folders and lists that follow it into the root or an app, and the edits it sends.
 */
import { describe, expect, test } from 'bun:test';

import { ENTITIES_STEP_ENTITIES } from '../../../testing/EntitiesStepFixture.ts';
import { FoldEntityDialogModel }  from './FoldEntityDialogModel.ts';

const entities = ENTITIES_STEP_ENTITIES;

describe('the fold', () => {
  test('the root comes first among the targets, then each app', () => {
    expect(FoldEntityDialogModel.targetsOf(entities)).toEqual(['root', 'web', 'admin']);
  });

  test('into the root kept for a person, the package only leaves: its folders fall to the root', () => {
    expect(FoldEntityDialogModel.foldEditsOf(entities, 'docs', 'root')).toEqual([{ target: 'entity', entityKey: 'docs', value: null }]);
    expect(FoldEntityDialogModel.foldersOf(entities, 'docs', 'root')).toEqual({ before: ['every path no other entity owns'], after: ['every path no other entity owns', 'docs'], });
    expect(FoldEntityDialogModel.wordsOf(entities, 'docs', 'root').targetHint).toBe('Kept for a person: no gates, no constitution');
  });

  test('into an app, its folders join the app\'s homes, the lists that named it follow, and what it depended on joins the app\'s', () => {
    expect(FoldEntityDialogModel.foldEditsOf(entities, 'ui', 'web')).toEqual([
      { target: 'entity', entityKey: 'ui', value: null },
      { target: 'entity', entityKey: 'web', value: { kind: 'app', home: ['/apps/web', '/packages/ui'], summary: 'Next.js storefront' } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
      { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['config'] } },
      { target: 'within-entity', entityKey: 'admin', edit: { target: 'depends-on', value: ['web'] } },
    ]);
  });

  test('the words name the target and the trade', () => {
    const words = FoldEntityDialogModel.wordsOf(entities, 'ui', 'web');
    expect(words.title).toBe('Fold ui into web?');
    expect(words.lead).toBe('ui stops being an entity. Its folders become further home folders of web.');
    expect(words.targetHint).toBe('An app with no build gate yet');
    expect(words.tradeDetail).toContain('Tickets of admin that change ui become a need for web, since a crossing goes into packages only.');
  });
});
