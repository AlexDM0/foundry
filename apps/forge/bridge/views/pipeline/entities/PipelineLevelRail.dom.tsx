/**
 * The level rail in a happy-dom document. What matters: the forge row leads and the entities follow in their labelled groups, each a
 * real button named by its key, kind, mark and counts; the selected row is the current one with the selection look and the one tab stop;
 * a press moves to that row's level; the arrow keys, Home and End move the focus between rows, wrapping, without moving the level; the
 * filter field narrows the entities and says when none matches; the attention line and the note show only while an entity needs a look,
 * the note saying that an entity without gates lands its tickets unchecked (E27); a live screen's work follows an entity's kind, and stands
 * alone under the forge.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { pipelineBoardStateOf }                                from '../../../testing/PipelineFixture.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';
import { PipelineLevelRail }                                   from './PipelineLevelRail.tsx';
import type { PipelineLevelRailFacts }                         from './PipelineLevelRailModel.ts';

afterEach(cleanup);

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

function renderRail(facts: PipelineLevelRailFacts, level: PipelineLevel = WEB_LEVEL) {
  const selected: PipelineLevel[] = [];
  render(<PipelineLevelRail facts={facts} level={level} onSelect={(next) => selected.push(next)} />);
  return { selected };
}

function rowButtons(): HTMLElement[] {
  return within(screen.getByRole('navigation', { name: 'Pipeline levels' })).getAllByRole('button');
}

describe('the pipeline level rail', () => {
  test('the forge row leads, and each entity is a button in its group, named by its key, kind and mark', () => {
    renderRail(pipelineBoardStateOf('mono-design'));
    expect(rowButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Forge, Shared by every entity',
      'web, app, Default constitution, 1 open question',
      'design-system, package, 1 gate',
      'root, every other path, For a person',
    ]);
    expect(within(screen.getByRole('group', { name: 'Apps' })).getByRole('button').textContent).toContain('web');
    expect(within(screen.getByRole('group', { name: 'Packages' })).getByRole('button').textContent).toContain('design-system');
    expect(within(screen.getByRole('group', { name: 'Root' })).getByRole('button').textContent).toContain('For a person');
  });

  test('the selected row is the current one, with the selection look and the one tab stop', () => {
    renderRail(pipelineBoardStateOf('mono-design'));
    const [forge, web, designSystem] = rowButtons();
    expect(web?.getAttribute('aria-current')).toBe('page');
    expect(web?.hasAttribute('data-selected')).toBe(true);
    expect(web?.tabIndex).toBe(0);
    expect(forge?.tabIndex).toBe(-1);
    expect(designSystem?.hasAttribute('aria-current')).toBe(false);
  });

  test('a press moves to that row\'s level', () => {
    const { selected } = renderRail(pipelineBoardStateOf('mono-design'));
    const [forge, , designSystem] = rowButtons();
    designSystem?.click();
    forge?.click();
    expect(selected).toEqual([PipelineLevelModel.entityLevelOf('design-system'), FORGE_LEVEL]);
  });

  test('the arrow keys, Home and End move the focus between rows and wrap, and choose no level', () => {
    const { selected } = renderRail(pipelineBoardStateOf('mono-design'));
    const buttons = rowButtons();
    buttons[1]?.focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[2] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'End' });
    expect(document.activeElement).toBe(buttons[3] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[0] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(buttons[3] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Home' });
    expect(document.activeElement).toBe(buttons[0] ?? null);
    expect(selected).toEqual([]);
  });

  test('the filter narrows the entities, keeps the forge, and says when none matches', () => {
    renderRail(pipelineBoardStateOf('mono-design'));
    const filter = screen.getByRole('textbox', { name: 'Filter entities' });
    fireEvent.change(filter, { target: { value: 'design' } });
    expect(rowButtons().map((button) => button.getAttribute('aria-label'))).toEqual(['Forge, Shared by every entity', 'design-system, package, 1 gate']);
    fireEvent.change(filter, { target: { value: 'example-nothing' } });
    expect(rowButtons()).toHaveLength(1);
    expect(screen.getByText('No entity matches the filter.')).toBeDefined();
  });

  test('E27: the attention line shows what needs a look, and the note only while an entity has no gates, which lands unchecked', () => {
    renderRail(pipelineBoardStateOf('mono-design'));
    expect(screen.getByText('1 entity has the default constitution')).toBeDefined();
    expect(screen.queryByText('An entity without gates lands its tickets unchecked. It never blocks Apply.')).toBeNull();
    cleanup();
    const state = pipelineBoardStateOf('mono-live');
    const entities = state.pipeline?.readingVerdict === 'readable' ? state.pipeline.pipeline.entities ?? {} : {};
    const { web } = entities;
    if (web === undefined) throw new Error('the fixture mono-live has no web entity');
    const gateless = { ...web, gates: [], phases: { build: [], review: [], merge: [] } };
    renderRail({ pipelineSetup: { record: { draft: { entities: { ...entities, web: gateless } }, questions: [] } } }, FORGE_LEVEL);
    expect(screen.getByText('1 entity has no gates · 1 entity has the default constitution')).toBeDefined();
    expect(screen.getByText('An entity without gates lands its tickets unchecked. It never blocks Apply.')).toBeDefined();
  });

  test('a gate profile under way marks its entity', () => {
    renderRail(pipelineBoardStateOf('mono-live'), FORGE_LEVEL);
    expect(rowButtons()[1]?.getAttribute('aria-label')).toBe('web, app, Gate running');
  });

  test('a live screen\'s work follows an entity\'s kind, and stands alone under the forge', () => {
    const activityTextOf = (level: PipelineLevel): string => (PipelineLevelModel.isForgeLevel(level) ? '2 of 2 jobs' : '1 ticket');
    render(<PipelineLevelRail facts={pipelineBoardStateOf('mono-design')} level={FORGE_LEVEL} onSelect={() => undefined} activityTextOf={activityTextOf} />);
    const [forge, web] = rowButtons();
    expect(forge?.textContent).toContain('2 of 2 jobs');
    expect(forge?.textContent).not.toContain('Shared by every entity');
    expect(web?.textContent).toContain('app · 1 ticket');
  });
});
