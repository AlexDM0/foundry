/**
 * The forge level's table of entities. What matters: one row per entity in the draft's order; a constitution drafted in this setup reads as
 * drafted before the path the entity names, an entity without one has the default, and a root without gates is kept for a person; an app
 * or a package without gates says so, plainly, and no row claims an entity is ready; the root's home reads as every other path.
 */
import { describe, expect, test }           from 'bun:test';
import type { BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { exampleEntity, exampleGate }       from '../../../testing/PipelineFixture.ts';
import { EntityOverviewTableModel }         from './EntityOverviewTableModel.ts';

const NO_PHASES = { build: [], review: [], merge: [] };

const ENTITIES: Record<string, BoardPipelineEntityDocument> = {
  web:    exampleEntity('app', ['/apps/web', '/apps/web-shared'], { gates: [exampleGate('lint', 'lint'), exampleGate('test', 'test')], phases: NO_PHASES }),
  ui:     exampleEntity('package', ['/packages/ui'], { constitutionPath: '/packages/ui/CONSTITUTION.md', phases: NO_PHASES }),
  config: exampleEntity('package', ['/packages/config'], { gates: [exampleGate('lint', 'lint')], phases: NO_PHASES }),
  root:   exampleEntity('root', ['/'], { phases: NO_PHASES }),
};

const CONSTITUTION_DRAFT = {
  markdown: '# Web', annotations: [], draftedFrom: { contributing: true, research: true, installedDefault: false }, baseBlob: null, revision: 1,
};

describe('a row of the entities table', () => {
  test('names each entity\'s kind, homes, gates, constitution and questions, in the draft\'s order', () => {
    const rows = EntityOverviewTableModel.rowsOf({
      entities:          ENTITIES,
      setupParts:        { web: { constitution: CONSTITUTION_DRAFT }, ui: { constitution: null } },
      openQuestionCount: (entityKey) => (entityKey === 'web' ? 2 : 0),
    });
    expect(rows.map((row) => [row.entityKey, row.kindText, row.homeText, row.gatesText, row.constitutionText, row.openQuestionCount])).toEqual([
      ['web', 'app', 'apps/web, apps/web-shared', '2 gates', 'Drafted', 2],
      ['ui', 'package', 'packages/ui', 'No gates', 'In its folder', 0],
      ['config', 'package', 'packages/config', '1 gate', 'Default', 0],
      ['root', 'root', 'every other path', 'None', 'For a person', 0],
    ]);
  });
});
