/**
 * The modal dialog, in a happy-dom document. What matters: closed, it renders nothing; open, it is a modal `<dialog>` shown through
 * `showModal()`, named by its title and described by its description; opening focuses the element the caller names, else the first
 * field, or × when there is none; Esc, × and a click on the backdrop call `onDismiss` with their reason, while a click inside the panel,
 * a press that began inside it and an Esc a layer above already took do not; Tab and Shift+Tab cycle inside it; on close the focus
 * returns to the opener; and the words are text, never markup. happy-dom's `showModal()` only sets `open` and fires no `cancel`, so the
 * cases send the events themselves.
 */
import {
  act,
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
import { useRef, useState, type ReactNode } from 'react';

import { Button }                                               from '../atoms/Button.tsx';
import { Dialog, type DialogDismissalReason, type DialogWidth } from './Dialog.tsx';

interface OpenedDialogProps {
  readonly reasons:      DialogDismissalReason[];
  readonly title?:       string;
  readonly description?: string;
  readonly width?:       DialogWidth;
  readonly children?:    ReactNode;
}

/** An opener button and the dialog it opens; a dismissal records its reason and closes the dialog. */
function OpenedDialog({
  reasons, title = 'Example step', description, width = 'standard', children = <input aria-label="Example field" />
}: OpenedDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open</button>
      <Dialog
        title={title}
        kicker="Example kicker"
        {...(description === undefined ? {} : { description })}
        isOpen={isOpen}
        onDismiss={(reason) => {
          reasons.push(reason);
          setIsOpen(false);
        }}
        closeLabel="Close"
        width={width}
        foot={<Button label="Save" onPress={() => undefined} />}
      >
        {children}
      </Dialog>
    </>
  );
}

function openFromTheOpener(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

function shownDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog');
  if (dialog === null) throw new Error('no dialog is rendered');
  return dialog;
}

afterEach(() => {
  cleanup();
});

describe('the dialog', () => {
  test('closed, it renders nothing', () => {
    render(<OpenedDialog reasons={[]} />);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('open, it is a modal dialog shown through showModal, named by its title and described by its description', () => {
    render(<OpenedDialog reasons={[]} description="Example description" width="wide" />);
    openFromTheOpener();
    const dialog = screen.getByRole('dialog', { name: 'Example step' });
    expect(dialog).toBe(shownDialog());
    expect([shownDialog().open, dialog.className, dialog.getAttribute('aria-modal'), dialog.getAttribute('data-width'), dialog.getAttribute('data-motion')])
      .toEqual([true, 'design-system-dialog', 'true', 'wide', 'in']);
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Example description');
    expect(screen.getByText('Example kicker').className).toBe('design-system-dialog-kicker');
  });

  test('without a description it names no description', () => {
    render(<OpenedDialog reasons={[]} />);
    openFromTheOpener();
    expect(shownDialog().hasAttribute('aria-describedby')).toBe(false);
  });

  test('opening focuses the first field', () => {
    render(<OpenedDialog reasons={[]} />);
    openFromTheOpener();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Example field' }));
  });

  test('opening focuses the element the caller names before the first field', () => {
    function NamedFocusDialog() {
      const group = useRef<HTMLButtonElement>(null);
      return (
        <Dialog title="Example step" isOpen onDismiss={() => undefined} closeLabel="Close" width="standard" initialFocus={group}>
          <input aria-label="Example field" />
          <button ref={group} type="button">Example choice</button>
        </Dialog>
      );
    }
    render(<NamedFocusDialog />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Example choice' }));
  });

  test('opening a dialog with no field focuses ×', () => {
    render(<OpenedDialog reasons={[]}><p>Example text</p></OpenedDialog>);
    openFromTheOpener();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  test('Esc calls onDismiss with escape and cancels the keydown, so the browser does not close the dialog itself', () => {
    const reasons: DialogDismissalReason[] = [];
    render(<OpenedDialog reasons={reasons} />);
    openFromTheOpener();
    const keptGoing = fireEvent.keyDown(screen.getByRole('textbox', { name: 'Example field' }), { key: 'Escape' });
    expect([reasons, keptGoing]).toEqual([['escape'], false]);
  });

  test('the browser cancel request calls onDismiss with escape and is cancelled', () => {
    const reasons: DialogDismissalReason[] = [];
    render(<OpenedDialog reasons={reasons} />);
    openFromTheOpener();
    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      shownDialog().dispatchEvent(cancel);
    });
    expect([reasons, cancel.defaultPrevented]).toEqual([['escape'], true]);
  });

  test('an Esc a layer above already took dismisses nothing', () => {
    const reasons: DialogDismissalReason[] = [];
    render(<OpenedDialog reasons={reasons} />);
    openFromTheOpener();
    const field = screen.getByRole('textbox', { name: 'Example field' });
    field.addEventListener('keydown', (event) => event.preventDefault());
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(reasons).toEqual([]);
  });

  test('× calls onDismiss with close', () => {
    const reasons: DialogDismissalReason[] = [];
    render(<OpenedDialog reasons={reasons} />);
    openFromTheOpener();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(reasons).toEqual(['close']);
  });

  test('a click on the backdrop calls onDismiss with backdrop; a click inside, or a press that began inside, does not', () => {
    const reasons: DialogDismissalReason[] = [];
    render(<OpenedDialog reasons={reasons} />);
    openFromTheOpener();
    const dialog = shownDialog();
    const field = screen.getByRole('textbox', { name: 'Example field' });
    fireEvent.mouseDown(field);
    fireEvent.click(field);
    fireEvent.mouseDown(field);
    fireEvent.click(dialog);
    expect(reasons).toEqual([]);
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(reasons).toEqual(['backdrop']);
  });

  test('Tab from the last element focuses the first, Shift+Tab from the first focuses the last', () => {
    render(<OpenedDialog reasons={[]} />);
    openFromTheOpener();
    const field = screen.getByRole('textbox', { name: 'Example field' });
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
    field.focus();
    const keptGoing = fireEvent.keyDown(field, { key: 'Tab' });
    expect([document.activeElement, keptGoing]).toEqual([field, true]);
  });

  test('closing returns the focus to the opener and closes the native dialog', () => {
    render(<OpenedDialog reasons={[]} />);
    const opener = openFromTheOpener();
    const dialog = shownDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect([document.querySelector('dialog'), dialog.open, document.activeElement]).toEqual([null, false, opener]);
  });

  test('unmounting an open dialog returns the focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<Dialog title="Example step" isOpen onDismiss={() => undefined} closeLabel="Close" width="narrow">Example</Dialog>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  test('the title is text, never markup', () => {
    render(<OpenedDialog reasons={[]} title="<b>planted</b>" />);
    openFromTheOpener();
    expect([screen.getByRole('heading').textContent, shownDialog().querySelector('b')]).toEqual(['<b>planted</b>', null]);
  });
});
