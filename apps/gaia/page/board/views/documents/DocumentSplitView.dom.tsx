/**
 * Split in a happy-dom document. What matters: the Preview beside Code draws the text User types before it is saved, the head line
 * names the line the caret stands on and the Preview marks that line's block alone; and the Preview brings the caret's block to its
 * middle once it is out of view, and stays still while it shows it whole.
 */
import {
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { fakeControls }                     from '../../testing/FakeControls.ts';
import { onBoard }                          from '../../testing/OnBoard.ts';
import { DOCUMENT_STATES, SPEC_MARKDOWN }   from '../../testing/TicketDocumentsFixture.ts';
import { DiagramFrameAddressContext }       from './DiagramFrame.tsx';
import { DocumentSplitView, followCaretIn } from './DocumentSplitView.tsx';

afterEach(cleanup);

describe('Split', () => {
  test('its Preview draws the unsaved text and its head names the caret\'s line', () => {
    const typed: string[] = [];
    const [spec] = DOCUMENT_STATES.specWorking.documents;
    fakeControls().render(onBoard(
      <DiagramFrameAddressContext value={null}>
        <DocumentSplitView
          place={{ ticketId: '004', document: 'spec' }}
          markdown={SPEC_MARKDOWN}
          versionNumber={4}
          messages={spec?.messages ?? []}
          readOnly={false}
          draft={null}
          onDraft={() => undefined}
          onTextChange={(text) => typed.push(text)}
        />
      </DiagramFrameAddressContext>,
    ));
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' });
    const edited = SPEC_MARKDOWN.replace('(a later ticket)', '(ticket #011)');
    fireEvent.change(editor, { target: { value: edited } });
    const caret = edited.indexOf('#011');
    editor.setSelectionRange(caret, caret);
    fireEvent.select(editor);
    const preview = screen.getByRole('region', { name: 'Live preview' });
    expect(within(preview).getByText('A theme toggle in the account menu (ticket #011).')).toBeTruthy();
    expect(screen.getByText(`You are typing on line ${edited.slice(0, caret).split('\n').length}`)).toBeTruthy();
    expect(typed.at(-1)).toBe(edited);
    const caretBlocks = [...preview.querySelectorAll('[data-caret]')].filter((block) => block.querySelector('[data-caret]') === null);
    expect(caretBlocks.map((block) => block.textContent.trim())).toEqual(['A theme toggle in the account menu (ticket #011).']);
  });

  test('the Preview brings the caret\'s block to its middle once it is out of view, and stays still while it shows it whole', () => {
    const preview = document.createElement('section');
    document.body.append(preview);
    const scrollTopsAfter = (blockTop: number): number => {
      const list = document.createElement('ul');
      const item = document.createElement('li');
      list.dataset['caret'] = '';
      item.dataset['caret'] = '';
      item.textContent = 'The caret\'s block';
      list.append(item);
      preview.replaceChildren(list);
      preview.scrollTop = 0;
      preview.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect;
      const block = preview.querySelector('li');
      if (block === null) throw new Error('no block');
      block.getBoundingClientRect = () => ({ top: blockTop, bottom: blockTop + 20 }) as DOMRect;
      let scrollTop = 0;
      Object.defineProperty(preview, 'scrollTop', { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } });
      followCaretIn(preview);
      return scrollTop;
    };
    const scrollTops = [scrollTopsAfter(100), scrollTopsAfter(900)];
    preview.remove();
    expect(scrollTops).toEqual([0, 710]);
  });
});
