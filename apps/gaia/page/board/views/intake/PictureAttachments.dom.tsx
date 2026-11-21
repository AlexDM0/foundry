/**
 * Pictures in the Intake view, against fake controls whose picture client records every upload. What matters: a picture attached, pasted
 * or dropped shows as a thumbnail with its name and size and counts against the served bound, and a pasted file that is no image is
 * ignored; a picture the served limits refuse never uploads and shows its refusal, and one the forge refuses shows the forge's words
 * verbatim and sends no message; a picture uploads before the message that names its stored id; remove drops a picture, and Send waits
 * while an upload runs; an applied message takes only the pictures it carried; Send and Start session name the uploaded pictures, a
 * picture alone being enough; a sent picture loads through Gaia's relay of its forge, in User's turn and in the aside; and with no limits
 * served nothing of this is offered.
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

import type { ReactElement } from 'react';

import type { BoardDocument }                          from '../../../@types/board/BoardDocument.ts';
import type { BoardPictureLimitsDocument }             from '../../../@types/board/BoardFactDocuments.ts';
import { boardRouteSurroundings }                      from '../../testing/BoardRouteSurroundings.tsx';
import { FIXTURE_TRACKER_ID }                          from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls, fakeTranscripts } from '../../testing/FakeControls.ts';
import { intakeBoardOf, productOwnerJob }              from '../../testing/IntakeBoardFixture.ts';
import { exampleTranscriptEntry }                      from '../../testing/TranscriptEntryFixture.ts';
import { IntakeView }                                  from './IntakeView.tsx';

const LIMITS: BoardPictureLimitsDocument = { perMessage: 2, sizeLimitBytes: 4096, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] };

const BOARD: BoardDocument = intakeBoardOf({
  jobs:            [productOwnerJob({ id: 'J7', state: 'running', intake: { text: 'Saved baskets', title: null } })],
  questionHistory: [],
  pictureLimits:   LIMITS,
});

const COMMAND_VERSION = { boardCommandVersion: 1 } as const;

function intakeViewOf(board: BoardDocument, selectedItem: string, followTranscript = fakeTranscripts().follow): ReactElement {
  return boardRouteSurroundings().wrap(<IntakeView board={board} followTranscript={followTranscript} selectedItem={selectedItem} />);
}

afterEach(cleanup);

function pictureFile(name: string, type = 'image/png', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function attach(files: readonly File[]): void {
  fireEvent.change(screen.getByLabelText('Attach pictures'), { target: { files } });
}

/** Every admitted picture read for its thumbnail and answered by the picture client. */
async function trayHasSettled(): Promise<void> {
  await waitFor(() => {
    const thumbnails = [...document.querySelectorAll('.board-picture-thumbnail:not([data-refused])')];
    expect(thumbnails.every((thumbnail) => thumbnail.querySelector('img') !== null && !thumbnail.hasAttribute('data-uploading'))).toBe(true);
  });
}

function thumbnailNames(): string[] {
  const tray = screen.queryByRole('list', { name: 'Pictures to send' });
  return tray === null ? [] : [...tray.querySelectorAll('.board-picture-thumbnail-name')].map((name) => name.textContent ?? '');
}

describe('adding pictures', () => {
  test('Attach pictures shows a thumbnail per picture with its name and size, and counts it against the bound', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J7'));
    expect(screen.getByText('or paste and drop them · PNG, JPEG, WebP or GIF')).toBeDefined();
    attach([pictureFile('basket.png')]);
    await trayHasSettled();
    expect(thumbnailNames()).toEqual(['basket.png']);
    expect(screen.getByText('1 KB')).toBeDefined();
    expect(screen.getByText('PNG, JPEG, WebP or GIF · 1 of 2')).toBeDefined();
    expect(controls.uploaded.map((file) => (file as File).name)).toEqual(['basket.png']);
  });

  test('a pasted picture and a dropped one each add a thumbnail, and a pasted file that is no image is ignored', async () => {
    fakeControls().render(intakeViewOf(BOARD, 'J7'));
    const textBox = screen.getByLabelText('Message Product owner J7');
    fireEvent.paste(textBox, { clipboardData: { files: [pictureFile('pasted.png'), new File(['notes'], 'notes.txt', { type: 'text/plain' })] } });
    const chat = screen.getByRole('region', { name: 'Chat with J7' }).parentElement as HTMLElement;
    fireEvent.dragOver(chat, { dataTransfer: { types: ['Files'], files: [] } });
    expect(document.querySelector('.board-picture-drop')?.hasAttribute('data-active')).toBe(true);
    fireEvent.drop(chat, { dataTransfer: { types: ['Files'], files: [pictureFile('dropped.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(thumbnailNames()).toEqual(['pasted.png', 'dropped.jpg']));
    await trayHasSettled();
    expect(document.querySelector('.board-picture-drop')?.hasAttribute('data-active')).toBe(false);
  });
});

describe('refused pictures', () => {
  test('a type the Overseer does not take, a file over the size bound and one past the per-message bound never upload', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J7'));
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
    controls.render(intakeViewOf(BOARD, 'J7'));
    attach([pictureFile('fake.png')]);
    await waitFor(() => expect(screen.getByText('The picture is no PNG, JPEG, WebP or GIF by its bytes.')).toBeDefined());
    await waitFor(() => expect(document.querySelector('.board-picture-thumbnail img')).not.toBeNull());
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('removing and sending', () => {
  test('a picture uploads first, and only then does Send post the job-message that names the id the forge stored it under', async () => {
    const controls = fakeControls();
    const storedPictureId = 'e'.repeat(64);
    controls.holdUploads();
    controls.answerNextUploadWith({
      verdict: 'uploaded', pictureId: storedPictureId, bytes: 1024, mediaType: 'image/png'
    });
    controls.render(intakeViewOf(BOARD, 'J7'));
    fireEvent.change(screen.getByLabelText('Message Product owner J7'), { target: { value: 'As in this sketch' } });
    attach([pictureFile('sketch.png')]);
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect([controls.uploaded.length, controls.sent]).toEqual([1, []]);
    await controls.releaseUploads();
    await trayHasSettled();
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'job-message', jobId: 'J7', text: 'As in this sketch', pictures: [{ pictureId: storedPictureId, name: 'sketch.png' }], incidentId: null
    }]);
  });

  test('a picture the forge refuses sends no message and shows the forge\'s sentence', async () => {
    const controls = fakeControls();
    const forgeSentence = 'The picture is 4.0 MB, larger than the 3.8 MB a picture may be.';
    controls.answerNextUploadWith({ verdict: 'refused', refusal: forgeSentence });
    controls.render(intakeViewOf(BOARD, 'J7'));
    attach([pictureFile('large.png')]);
    await waitFor(() => expect(screen.getByText(forgeSentence)).toBeDefined());
    await trayHasSettled();
    fireEvent.keyDown(screen.getByLabelText('Message Product owner J7'), { key: 'Enter' });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([]);
  });

  test('remove drops a picture, and Send waits while an upload runs', async () => {
    const controls = fakeControls();
    controls.holdUploads();
    controls.render(intakeViewOf(BOARD, 'J7'));
    fireEvent.change(screen.getByLabelText('Message Product owner J7'), { target: { value: 'As in this sketch' } });
    attach([pictureFile('sketch.png'), pictureFile('second.png')]);
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await controls.releaseUploads();
    await trayHasSettled();
    expect(send.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove second.png' }));
    expect(thumbnailNames()).toEqual(['sketch.png']);
    await clickSettled(send);
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'job-message', jobId: 'J7', text: 'As in this sketch', pictures: [{ pictureId: 'picture-1', name: 'sketch.png' }], incidentId: null
    }]);
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Pictures to send' })).toBeNull());
  });

  test('a picture added while a message is on its way stays to be sent once that message is applied', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'J7'));
    fireEvent.change(screen.getByLabelText('Message Product owner J7'), { target: { value: 'As in this sketch' } });
    attach([pictureFile('sketch.png')]);
    await trayHasSettled();
    controls.holdCommands();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    attach([pictureFile('second.png')]);
    await trayHasSettled();
    await controls.releaseCommands();
    await waitFor(() => expect(thumbnailNames()).toEqual(['second.png']));
  });

  test('Start session sends a picture alone with intake-start', async () => {
    const controls = fakeControls();
    controls.render(intakeViewOf(BOARD, 'new'));
    const start = screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    attach([pictureFile('empty-basket.png')]);
    await trayHasSettled();
    expect(start.disabled).toBe(false);
    await clickSettled(start);
    expect(controls.sent).toEqual([{
      ...COMMAND_VERSION, kind: 'intake-start', text: '', pictures: [{ pictureId: 'picture-1', name: 'empty-basket.png' }]
    }]);
  });
});

describe('sent pictures', () => {
  test('a sent picture loads through Gaia\'s relay of its forge in User\'s turn, and the aside lists it', () => {
    const transcripts = fakeTranscripts();
    fakeControls().render(intakeViewOf(BOARD, 'J7', transcripts.follow));
    const pictureId = 'f'.repeat(64);
    transcripts.feed('J7', [exampleTranscriptEntry({
      cursor:    '1.1',
      role:      'user',
      text:      'Like this',
      sentBy:    'user',
      clientAct: 'chat',
      pictures:  [{
        pictureId, name: 'basket.png', mediaType: 'image/png', bytes: 421_888
      }]
    })]);
    const thread = screen.getByRole('list', { name: 'Conversation of J7' });
    const sent = within(thread).getByRole('link', { name: 'Open picture basket.png' });
    const relayAddress = `/api/v1/forges/${FIXTURE_TRACKER_ID}/pictures/${pictureId}`;
    expect(sent.getAttribute('href')).toBe(relayAddress);
    expect(sent.querySelector('img')?.getAttribute('src')).toBe(relayAddress);
    expect(within(sent).getByText('basket.png · 412 KB')).toBeDefined();
    expect(within(thread).getByText('1 picture')).toBeDefined();
    const pictures = within(screen.getByRole('complementary', { name: 'Drafts of J7' })).getByRole('list', { name: 'Pictures of J7' });
    expect(pictures.textContent).toBe('basket.png · 412 KB');
    expect(within(pictures).getByRole('link', { name: 'basket.png' }).getAttribute('href')).toBe(relayAddress);
  });
});

describe('with no limits served', () => {
  test('no Attach pictures shows and a pasted picture is ignored', () => {
    const controls = fakeControls();
    controls.render(intakeViewOf({ ...BOARD, pictureLimits: null }, 'J7'));
    expect(screen.queryByLabelText('Attach pictures')).toBeNull();
    fireEvent.paste(screen.getByLabelText('Message Product owner J7'), { clipboardData: { files: [pictureFile('pasted.png')] } });
    expect(screen.queryByRole('list', { name: 'Pictures to send' })).toBeNull();
    expect(controls.uploaded).toEqual([]);
  });
});
