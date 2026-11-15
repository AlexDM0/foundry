/**
 * The smallest pipeline's panel in a happy-dom document. What matters: it is the "About this pipeline" panel with its one About tab and
 * its title; the warning shows while no phase has a gate; the "Where steps go" list has one line per add slot in the facts.
 */
import { cleanup, screen, within } from '@testing-library/react';
import { render }                  from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { MinimalPipelineNote }  from './MinimalPipelineNote.tsx';

afterEach(cleanup);

describe('the smallest pipeline note', () => {
  test('names the pipeline, warns while no phase has a gate, and lists a line per + slot', () => {
    const flow = pipelineBoardStateOf('A7').pipelineFlow;
    if (flow === null || flow === undefined) throw new Error('no flow');
    render(<MinimalPipelineNote flow={flow} />);
    const aside = screen.getByRole('complementary', { name: 'About this pipeline' });
    expect(within(aside).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['About']);
    expect(within(aside).getByText('The smallest pipeline')).toBeDefined();
    expect(within(aside).getByRole('note').textContent).toContain('Nothing checks a commit before main');
    expect(within(within(aside).getByRole('region', { name: 'Where steps go' })).getAllByRole('listitem')).toHaveLength(2);
  });

  test('a gate in a phase drops the warning', () => {
    const flow = pipelineBoardStateOf('A7').pipelineFlow;
    if (flow === null || flow === undefined) throw new Error('no flow');
    const gateRow = {
      rowKind: 'gate' as const, name: 'typecheck', run: 'bun run typecheck', fix: null, in: null, network: [], alsoInPhases: [], mark: 'new' as const,
    };
    render(<MinimalPipelineNote flow={{ ...flow, gateRows: { ...flow.gateRows, build: [gateRow] } }} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
