/**
 * `sentLineOf` reads back the lines a Watcher writes to a Claude Code session, so a transcript shows what was said rather than the vendor's
 * JSON. What matters: it is the exact inverse of the three writers (a chat with or without pictures, an answer with its request and
 * answers, an interrupt), it reads the recorded stdin lines of a real session the same way, and any other line, a stdout line among them,
 * reads as `null` rather than a guess. A chat with pictures is written as probe P21 found Claude Code takes it: base64 image blocks before
 * one text block (`.platform-probes/claude-p21-stream-json-image-input.js`); without pictures the content stays the plain text.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { CLAUDE_STREAM_LINES } from './ClaudeStreamLines.ts';

const FIXTURES_FOLDER = join(import.meta.dir, 'testing', 'fixtures');

function fixtureLines(fileName: string): string[] {
  return readFileSync(join(FIXTURES_FOLDER, fileName), 'utf8').split('\n').filter((line) => line.length > 0);
}

const EXAMPLE_PICTURE = { mediaType: 'image/png', base64Data: 'iVBORw0KGgo=' };

const QUESTION = {
  question: 'Which colour should the button be?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.' }]
};

describe('sentLineOf', () => {
  test('reads a chat line back as its text, quotes and line breaks intact', () => {
    const text = 'Look at "#004 Account pages dark mode" first.\nThen the header.';
    expect(CLAUDE_STREAM_LINES.sentLineOf(CLAUDE_STREAM_LINES.chatLineOf(text))).toEqual({ act: 'chat', text, pictures: [] });
  });

  test('writes a chat without pictures as plain text content, as every line before pictures was written', () => {
    expect(JSON.parse(CLAUDE_STREAM_LINES.chatLineOf('Build it.'))).toEqual({ type: 'user', message: { role: 'user', content: 'Build it.' } });
  });

  test('writes a chat with pictures as base64 image blocks before one text block, and reads it back with each picture in order', () => {
    const secondPicture = { mediaType: 'image/jpeg', base64Data: '/9j/4AAQ' };
    const line = CLAUDE_STREAM_LINES.chatLineOf('What colour is the header?', [EXAMPLE_PICTURE, secondPicture]);
    expect(JSON.parse(line)).toEqual({
      type:    'user',
      message: {
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' } },
          { type: 'text', text: 'What colour is the header?' },
        ],
      },
    });
    expect(CLAUDE_STREAM_LINES.sentLineOf(line)).toEqual({ act: 'chat', text: 'What colour is the header?', pictures: [EXAMPLE_PICTURE, secondPicture] });
  });

  test('reads a picture sent with no text back as an empty text and its picture', () => {
    expect(CLAUDE_STREAM_LINES.sentLineOf(CLAUDE_STREAM_LINES.chatLineOf('', [EXAMPLE_PICTURE]))).toEqual({ act: 'chat', text: '', pictures: [EXAMPLE_PICTURE] });
  });

  test('reads a content list no writer gives as null: no text block last, a block that is no base64 image, or an empty list', () => {
    const lineOf = (content: unknown) => JSON.stringify({ type: 'user', message: { role: 'user', content } });
    const imageBlock = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
    const contents = [
      [imageBlock],
      [{ type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } }, { type: 'text', text: 'Look.' }],
      [{ type: 'document' }, { type: 'text', text: 'Look.' }],
      [],
    ];
    for (const content of contents) expect(CLAUDE_STREAM_LINES.sentLineOf(lineOf(content))).toBeNull();
  });

  test('reads an answer line back as its request and its answers keyed by question', () => {
    const answers = { [QUESTION.question]: 'Blue' };
    const line = CLAUDE_STREAM_LINES.answerLineOf('request-example', [QUESTION], answers);
    expect(CLAUDE_STREAM_LINES.sentLineOf(line)).toEqual({ act: 'answer', requestId: 'request-example', answers });
  });

  test('reads an interrupt line back as an interrupt', () => {
    expect(CLAUDE_STREAM_LINES.sentLineOf(CLAUDE_STREAM_LINES.interruptLineOf())).toEqual({ act: 'interrupt' });
  });

  test('reads the recorded stdin of a real session as a chat, then an answer', () => {
    const [firstLine = '', answerLine = ''] = fixtureLines('ask-user-question-live-answer.stdin.jsonl');
    expect(CLAUDE_STREAM_LINES.sentLineOf(firstLine)?.act).toBe('chat');
    expect(CLAUDE_STREAM_LINES.sentLineOf(answerLine)).toMatchObject({ act: 'answer', answers: { [QUESTION.question]: 'Blue' } });
  });

  test('reads every other line as null: a stdout line, text that is no JSON, a list, and an answer whose answers are not text', () => {
    const [stdoutLine = ''] = fixtureLines('ask-user-question-live-answer.stdout.jsonl');
    const answerWithNumber = JSON.stringify({
      type:     'control_response',
      response: { subtype: 'success', request_id: 'request-example', response: { behavior: 'allow', updatedInput: { answers: { Colour: 1 } } } },
    });
    for (const line of [stdoutLine, 'not json', '[]', answerWithNumber]) expect(CLAUDE_STREAM_LINES.sentLineOf(line)).toBeNull();
  });
});
