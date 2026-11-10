/**
 * Pictures in the Intake view, against fake controls whose picture client records every upload. What matters: a picture attached, pasted
 * or dropped shows as a thumbnail with its name and size and counts against the served bound, and a pasted file that is no image is
 * ignored; a picture the served limits refuse never uploads and shows its refusal, and one the Overseer refuses shows the Overseer's words
 * verbatim; remove drops a picture, and Send waits while an upload runs; an applied message takes only the pictures it carried; Send and
 * Start session name the uploaded pictures, a picture alone
 * being enough; a sent picture shows in User's turn as a link to its served route and in the aside; and with no limits served nothing of
 * this is offered.
 */
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ConversationBoardDocument, PictureLimitsDocument } from '../../@types/ConversationDocuments.ts';
import { clickSettled, fakeControls, fakeTranscripts }           from '../../testing/FakeControls.ts';
import { IntakeView }                                            from './IntakeView.tsx';

const LIMITS: PictureLimitsDocument = { perMessage: 2, sizeLimitBytes: 4096, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] };

const BOARD: ConversationBoardDocument = {
  jobs: [{
    id: 'J7', kind: 'product-owner', ticketIds: [], state: 'running', intake: { text: 'Saved baskets' }
  }],
  decisions:       [],
  incidents:       [],
  questionHistory: [],
  pictureLimits:   LIMITS,
};

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function pictureFile(name: string, type = 'image/png', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function attach(files: readonly File[]): void {
  fireEvent.change(screen.getByLabelText('Attach pictures'), { target: { files } });
}

/** Every admitted picture read for its thumbnail and answered by the picture client. */
async function trayHasSettled(): Promise<void> {
  await waitFor(() => {
    const thumbs = [...document.querySelectorAll('.bridge-picture-thumb:not([data-refused])')];
    expect(thumbs.every((thumb) => thumb.querySelector('img') !== null && !thumb.hasAttribute('data-uploading'))).toBe(true);
  });
}

function thumbNames(): string[] {
  const tray = screen.queryByRole('list', { name: 'Pictures to send' });
  return tray === null ? [] : [...tray.querySelectorAll('.bridge-picture-thumb-name')].map((name) => name.textContent ?? '');
}

describe('adding pictures', () => {
  test('Attach pictures shows a thumbnail per picture with its name and size, and counts it against the bound', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    expect(screen.getByText('or paste and drop them · PNG, JPEG, WebP or GIF')).toBeDefined();
    attach([pictureFile('basket.png')]);
    await trayHasSettled();
    expect(thumbNames()).toEqual(['basket.png']);
    expect(screen.getByText('1 KB')).toBeDefined();
    expect(screen.getByText('PNG, JPEG, WebP or GIF · 1 of 2')).toBeDefined();
    expect(controls.uploaded.map((file) => (file as File).name)).toEqual(['basket.png']);
  });

  test('a pasted picture and a dropped one each add a thumbnail, and a pasted file that is no image is ignored', async () => {
    fakeControls().render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    const textBox = screen.getByLabelText('Message Product owner J7');
    fireEvent.paste(textBox, { clipboardData: { files: [pictureFile('pasted.png'), new File(['notes'], 'notes.txt', { type: 'text/plain' })] } });
    const chat = screen.getByRole('region', { name: 'Chat with J7' }).parentElement as HTMLElement;
    fireEvent.dragOver(chat, { dataTransfer: { types: ['Files'], files: [] } });
    expect(document.querySelector('.bridge-picture-drop')?.hasAttribute('data-active')).toBe(true);
    fireEvent.drop(chat, { dataTransfer: { types: ['Files'], files: [pictureFile('dropped.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(thumbNames()).toEqual(['pasted.png', 'dropped.jpg']));
    await trayHasSettled();
    expect(document.querySelector('.bridge-picture-drop')?.hasAttribute('data-active')).toBe(false);
  });
});

describe('refused pictures', () => {
  test('a type the Overseer does not take, a file over the size bound and one past the per-message bound never upload', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    attach([pictureFile('scan.bmp', 'image/bmp'), pictureFile('huge.png', 'image/png', 8192), pictureFile('one.png'), pictureFile('two.png'), pictureFile('three.png')]);
    expect(screen.getByText('scan.bmp is no PNG, JPEG, WebP or GIF picture.')).toBeDefined();
    expect(screen.getByText('huge.png is 8 KB, and a picture is at most 4 KB.')).toBeDefined();
    expect(screen.getByText('One message carries at most 2 pictures.')).toBeDefined();
    expect(controls.uploaded.map((file) => (file as File).name)).toEqual(['one.png', 'two.png']);
    await trayHasSettled();
  });

  test('a picture the Overseer refuses shows its refusal verbatim and is not sent', async () => {
    const controls = fakeControls();
    controls.answerNextUploadWith({ verdict: 'refused', refusal: 'The picture is no PNG, JPEG, WebP or GIF by its bytes.' });
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    attach([pictureFile('fake.png')]);
    await waitFor(() => expect(screen.getByText('The picture is no PNG, JPEG, WebP or GIF by its bytes.')).toBeDefined());
    await waitFor(() => expect(document.querySelector('.bridge-picture-thumb img')).not.toBeNull());
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('removing and sending', () => {
  test('remove drops a picture, and Send waits while an upload runs', async () => {
    const controls = fakeControls();
    controls.holdUploads();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    fireEvent.change(screen.getByLabelText('Message Product owner J7'), { target: { value: 'As in this sketch' } });
    attach([pictureFile('sketch.png'), pictureFile('second.png')]);
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await controls.releaseUploads();
    await trayHasSettled();
    expect(send.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove second.png' }));
    expect(thumbNames()).toEqual(['sketch.png']);
    await clickSettled(send);
    expect(controls.sent).toEqual([{
      kind: 'job-message', jobId: 'J7', text: 'As in this sketch', pictures: [{ pictureId: 'picture-1', name: 'sketch.png' }]
    }]);
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Pictures to send' })).toBeNull());
  });

  test('a picture added while a message is on its way stays to be sent once that message is applied', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    fireEvent.change(screen.getByLabelText('Message Product owner J7'), { target: { value: 'As in this sketch' } });
    attach([pictureFile('sketch.png')]);
    await trayHasSettled();
    controls.holdCommands();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    attach([pictureFile('second.png')]);
    await trayHasSettled();
    await controls.releaseCommands();
    await waitFor(() => expect(thumbNames()).toEqual(['second.png']));
  });

  test('Start session sends a picture alone with intake-start', async () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={BOARD} followTranscript={fakeTranscripts().follow} selectedItem="new" />);
    const start = screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    attach([pictureFile('empty-basket.png')]);
    await trayHasSettled();
    expect(start.disabled).toBe(false);
    await clickSettled(start);
    expect(controls.sent).toEqual([{ kind: 'intake-start', text: '', pictures: [{ pictureId: 'picture-1', name: 'empty-basket.png' }] }]);
  });
});

describe('sent pictures', () => {
  test('a sent picture shows in User\'s turn as a link to its served route, and the aside lists it', () => {
    const transcripts = fakeTranscripts();
    fakeControls().render(<IntakeView board={BOARD} followTranscript={transcripts.follow} selectedItem="J7" />);
    const pictureId = 'f'.repeat(64);
    transcripts.feed('J7', [{
      cursor:    '1.1',
      entryKey:  '1.1.0',
      at:        null,
      role:      'user',
      text:      'Like this',
      sentBy:    'user',
      clientAct: 'chat',
      pictures:  [{
        pictureId, name: 'basket.png', mediaType: 'image/png', bytes: 421_888
      }]
    }]);
    const thread = screen.getByRole('list', { name: 'Conversation of J7' });
    const sent = within(thread).getByRole('link', { name: 'Open picture basket.png' });
    expect(sent.getAttribute('href')).toBe(`/api/pictures/${pictureId}`);
    expect(sent.querySelector('img')?.getAttribute('src')).toBe(`/api/pictures/${pictureId}`);
    expect(within(sent).getByText('basket.png · 412 KB')).toBeDefined();
    expect(within(thread).getByText('1 picture')).toBeDefined();
    const pictures = within(screen.getByRole('complementary', { name: 'Drafts of J7' })).getByRole('list', { name: 'Pictures of J7' });
    expect(pictures.textContent).toBe('basket.png · 412 KB');
  });
});

describe('with no limits served', () => {
  test('no Attach pictures shows and a pasted picture is ignored', () => {
    const controls = fakeControls();
    controls.render(<IntakeView board={{ ...BOARD, pictureLimits: null }} followTranscript={fakeTranscripts().follow} selectedItem="J7" />);
    expect(screen.queryByLabelText('Attach pictures')).toBeNull();
    fireEvent.paste(screen.getByLabelText('Message Product owner J7'), { clipboardData: { files: [pictureFile('pasted.png')] } });
    expect(screen.queryByRole('list', { name: 'Pictures to send' })).toBeNull();
    expect(controls.uploaded).toEqual([]);
  });
});
