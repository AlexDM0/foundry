/**
 * The pipeline page's panel width, in a happy-dom document. What matters: the panel starts at its least width and never goes below it, it
 * widens only by the room the main column can spare above its own least width, and a width User chose is kept and opens the next page.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { boardPreferenceStoreOf }     from '../../preferences/PreferenceStore.ts';
import { PipelinePage }               from './PipelinePage.tsx';
import { PipelinePreferencesContext } from './PipelinePreferencesContext.ts';
import { PANEL_LEAST_WIDTH_PIXELS }   from './UseResizablePanelWidth.ts';

afterEach(cleanup);

const PANEL_WIDTH_KEY = 'gaia:board:example-tracker:pipeline-panel-width';

function memoryStorage(): Map<string, string> {
  return new Map<string, string>();
}

function renderPageWithMainColumnWidth(mainColumnWidth: number, storage: Map<string, string> | null = null): HTMLElement {
  const preferences = storage === null ? null : boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key),
  }));
  render(
    <PipelinePreferencesContext.Provider value={preferences}>
      <PipelinePage main={<p>Example main</p>} panel={<p>Example panel</p>} footer={null} />
    </PipelinePreferencesContext.Provider>
  );
  const mainColumn = document.querySelector('.board-pipeline-focus-main');
  if (mainColumn === null) throw new Error('no main column');
  Object.defineProperty(mainColumn, 'clientWidth', { value: mainColumnWidth });
  return screen.getByRole('separator', { name: 'Panel width' });
}

function panelWidthOf(handle: HTMLElement): number {
  return Number(handle.getAttribute('aria-valuenow'));
}

describe('the pipeline page\'s resizable panel', () => {
  test('starts at its least width and refuses to grow narrower', () => {
    const handle = renderPageWithMainColumnWidth(1000);
    expect(panelWidthOf(handle)).toBe(PANEL_LEAST_WIDTH_PIXELS);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(panelWidthOf(handle)).toBe(PANEL_LEAST_WIDTH_PIXELS);
  });

  test('widens with the left arrow while the main column has room to spare', () => {
    const handle = renderPageWithMainColumnWidth(1000);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panelWidthOf(handle)).toBeGreaterThan(PANEL_LEAST_WIDTH_PIXELS);
  });

  test('does not widen when the main column is already at its least width', () => {
    const handle = renderPageWithMainColumnWidth(480);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panelWidthOf(handle)).toBe(PANEL_LEAST_WIDTH_PIXELS);
  });

  test('keeps a widened panel and opens the next page at that width', () => {
    const storage = memoryStorage();
    const handle = renderPageWithMainColumnWidth(1000, storage);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    const widenedWidth = panelWidthOf(handle);
    expect(storage.get(PANEL_WIDTH_KEY)).toBe(String(widenedWidth));
    cleanup();
    expect(panelWidthOf(renderPageWithMainColumnWidth(1000, storage))).toBe(widenedWidth);
  });

  test('leaves nothing stored once the panel is back at its least width, and reads a stored width below it as the least width', () => {
    const storage = memoryStorage();
    const handle = renderPageWithMainColumnWidth(1000, storage);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(storage.has(PANEL_WIDTH_KEY)).toBe(false);
    cleanup();
    storage.set(PANEL_WIDTH_KEY, '120');
    expect(panelWidthOf(renderPageWithMainColumnWidth(1000, storage))).toBe(PANEL_LEAST_WIDTH_PIXELS);
  });
});
