/**
 * The level breadcrumb in a happy-dom document. What matters: it reads `Pipeline › web` at an entity and `Pipeline › Forge` at the forge,
 * "Pipeline" links to the forge level of the screen, and the level's name is the current location.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { EntityLevelBreadcrumb }           from './EntityLevelBreadcrumb.tsx';
import { FORGE_LEVEL, PipelineLevelModel } from './PipelineLevelModel.ts';

afterEach(cleanup);

const FORGE_DESIGN_HREF = PipelineLevelModel.fragmentAtLevel(FORGE_LEVEL, 'setup/design');

describe('the level breadcrumb', () => {
  test('at an entity it reads Pipeline › web, and Pipeline links to the forge level', () => {
    render(<EntityLevelBreadcrumb level={PipelineLevelModel.entityLevelOf('web')} forgeLevelHref={FORGE_DESIGN_HREF} />);
    const breadcrumb = screen.getByRole('navigation', { name: 'Level' });
    expect(breadcrumb.textContent).toBe('Pipeline›web');
    expect(screen.getByRole('link', { name: 'Pipeline' }).getAttribute('href')).toBe('#pipeline/forge/setup/design');
    expect(breadcrumb.querySelector('[aria-current="location"]')?.textContent).toBe('web');
  });

  test('at the forge it reads Pipeline › Forge', () => {
    render(<EntityLevelBreadcrumb level={FORGE_LEVEL} forgeLevelHref={FORGE_DESIGN_HREF} />);
    expect(screen.getByRole('navigation', { name: 'Level' }).textContent).toBe('Pipeline›Forge');
  });
});
