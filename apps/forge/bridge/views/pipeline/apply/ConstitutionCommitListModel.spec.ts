/**
 * What the first Apply over entities does with each constitution. What matters: a drafted text is in the one commit, a draft without text
 * is not; an entity that names its own file keeps it; the root kept for a person has none; any other entity reads the default; the
 * headline counts the commit, and the notes name the others.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineEntity }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { pipelineBoardStateOf }        from '../../../testing/PipelineFixture.ts';
import { ConstitutionCommitListModel } from './ConstitutionCommitListModel.ts';

function monorepoRecord(): PipelineSetup {
  const setup = pipelineBoardStateOf('mono-design').pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture mono-design has no setup');
  return setup.record;
}

const CONFIG_ENTITY: PipelineEntity = {
  kind: 'package', home: ['/packages/config'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

describe('the constitution commit', () => {
  test('sorts each entity by what Apply does with its constitution', () => {
    expect(ConstitutionCommitListModel.commitOf(monorepoRecord())).toEqual({
      committedKeys: ['web'], adoptedKeys: ['design-system'], defaultKeys: [], keptForAPersonKeys: ['root'],
    });
  });

  test('a draft without text commits nothing, and that entity reads the default', () => {
    const record = monorepoRecord();
    const webPart = record.entities?.['web'];
    if (webPart?.constitution === undefined || webPart.constitution === null) throw new Error('the fixture drafts web');
    const emptied = { ...record, entities: { ...record.entities, web: { ...webPart, constitution: { ...webPart.constitution, markdown: '' } } } };
    expect(ConstitutionCommitListModel.commitOf(emptied).committedKeys).toEqual([]);
    expect(ConstitutionCommitListModel.commitOf(emptied).defaultKeys).toEqual(['web']);
    expect(ConstitutionCommitListModel.viewOf(emptied).headline).toBe('No constitution goes to main: Apply makes no constitution commit.');
  });

  test('the headline counts the commit and the notes name the others', () => {
    const record = monorepoRecord();
    const draft = record.draft === null ? null : { ...record.draft, entities: { ...record.draft.entities, config: CONFIG_ENTITY } };
    expect(ConstitutionCommitListModel.viewOf({ ...record, draft })).toEqual({
      headline:      '1 constitution goes to main in one commit',
      committedKeys: ['web'],
      notes:         [
        'design-system keeps its own file from the repository, byte for byte.',
        'config reads the installed default constitution.',
        'root is kept for a person: no constitution.',
        'The commit changes only these files, so it runs no gates.',
      ],
    });
  });
});
