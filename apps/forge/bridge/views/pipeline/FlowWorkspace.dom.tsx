/**
 * The flow workspace's slots for monorepo mode, in a happy-dom document. What matters: single mode passes no rail and no breadcrumb, and
 * the layout holds the main column and the panel alone, as before; in monorepo mode the rail stands before the main column and the
 * breadcrumb over the page's title.
 */
import { cleanup, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { fakeControls }                    from '../../testing/FakeControls.ts';
import { pipelineBoardStateOf }            from '../../testing/PipelineFixture.ts';
import { FlowWorkspace }                   from './FlowWorkspace.tsx';
import { EntityLevelBreadcrumb }           from './entities/EntityLevelBreadcrumb.tsx';
import { FORGE_LEVEL, PipelineLevelModel } from './entities/PipelineLevelModel.ts';
import { PipelineLevelRail }               from './entities/PipelineLevelRail.tsx';
import type { FlowSelection }              from './flow/FlowSelection.ts';

afterEach(cleanup);

const SELECTION: FlowSelection = {
  openRequest:     null,
  openPhase:       'build',
  shownItem:       null,
  scrollRequest:   null,
  open:            () => undefined,
  close:           () => undefined,
  openPhaseOf:     () => undefined,
  showOnFlow:      () => undefined,
  applyIsAskedFor: () => false,
  askApply:        () => undefined,
  closeApply:      () => undefined,
};

function layoutBody(): Element {
  const body = document.querySelector('.bridge-pipeline-focus-body');
  if (body === null) throw new Error('no Focus layout');
  return body;
}

describe('the flow workspace\'s monorepo slots', () => {
  test('single mode has no rail and no breadcrumb: the main column and the panel alone', () => {
    fakeControls().render(
      <FlowWorkspace facts={pipelineBoardStateOf('A5')} selection={SELECTION} title="Your pipeline" lead="Example lead." aside={null} footer={null} />
    );
    expect([...layoutBody().children].map((child) => child.className)).toEqual(['bridge-pipeline-focus-main', 'bridge-pipeline-focus-aside']);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  test('monorepo mode places the rail before the main column and the breadcrumb over the title', () => {
    const facts = pipelineBoardStateOf('mono-live');
    const webLevel = PipelineLevelModel.entityLevelOf('web');
    fakeControls().render(
      <FlowWorkspace
        facts={facts}
        selection={SELECTION}
        title="Your pipeline"
        lead="Example lead."
        aside={null}
        footer={null}
        rail={<PipelineLevelRail facts={facts} level={webLevel} onSelect={() => undefined} />}
        breadcrumb={<EntityLevelBreadcrumb level={webLevel} forgeLevelHref={PipelineLevelModel.fragmentAtLevel(FORGE_LEVEL, null)} />}
      />
    );
    const [railColumn] = layoutBody().children;
    expect(railColumn?.className).toBe('bridge-pipeline-focus-rail');
    expect(railColumn?.querySelector('[aria-label="Pipeline levels"]')).not.toBeNull();
    const breadcrumb = screen.getByRole('navigation', { name: 'Level' });
    const title = screen.getByRole('heading', { name: 'Your pipeline' });
    expect(breadcrumb.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
