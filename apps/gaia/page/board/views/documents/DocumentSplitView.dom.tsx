/**
 * Split in a happy-dom document. What matters: the Preview beside Code draws the text User types before it is saved, and the head line
 * names the line the caret stands on.
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

import { fakeControls }                   from '../../testing/FakeControls.ts';
import { onBoard }                        from '../../testing/OnBoard.ts';
import { DOCUMENT_STATES, SPEC_MARKDOWN } from '../../testing/TicketDocumentsFixture.ts';
import { DiagramFrameAddressContext }     from './DiagramFrame.tsx';
import { DocumentSplitView }              from './DocumentSplitView.tsx';

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
  });
});
