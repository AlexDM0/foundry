/**
 * Standing replies as pure data rules: every `whenAllEqual` path must hold and no `whenNoneEqual` path may, the request identifier is read
 * at the path the rule names and filled in as JSON string content, and a line that is no JSON object, matches nothing, or lacks the
 * identifier its template needs is never answered.
 */
import { expect, test } from 'bun:test';

import { type StandingReply, standingReplyFor, standingReplyOf } from './StandingReplies.ts';

const DENY_ALL_BUT_QUESTIONS: StandingReply = {
  whenAllEqual:          { 'kind': 'permission-asked', 'request.purpose': 'use-tool' },
  whenNoneEqual:         { 'request.toolName': 'ask-the-person' },
  replyTemplate:         '{"askId":"{{request-identifier}}","behavior":"deny"}',
  requestIdentifierPath: 'askId',
};

const DENY_BY_NESTED_IDENTIFIER: StandingReply = { ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: 'request.askId' };

function permissionRequest(toolName: string, requestIdentifier: unknown = 'r-7'): string {
  return JSON.stringify({ kind: 'permission-asked', askId: requestIdentifier, request: { purpose: 'use-tool', toolName, askId: `nested-${String(requestIdentifier)}` } });
}

test('answers a matching line with its request identifier filled in from the named path', () => {
  expect(standingReplyFor(permissionRequest('shell'), [DENY_ALL_BUT_QUESTIONS])).toBe('{"askId":"r-7","behavior":"deny"}');
});

test('reads the request identifier at a nested path', () => {
  expect(standingReplyFor(permissionRequest('shell'), [DENY_BY_NESTED_IDENTIFIER])).toBe('{"askId":"nested-r-7","behavior":"deny"}');
});

test('never answers a line a whenNoneEqual path holds, such as a question', () => {
  expect(standingReplyFor(permissionRequest('ask-the-person'), [DENY_ALL_BUT_QUESTIONS])).toBeNull();
});

test('never answers a line missing a whenAllEqual value, or one that is not a JSON object', () => {
  expect(standingReplyFor('{"kind":"permission-asked","askId":"r-7","request":{"purpose":"interrupt"}}', [DENY_ALL_BUT_QUESTIONS])).toBeNull();
  expect(standingReplyFor('plain text', [DENY_ALL_BUT_QUESTIONS])).toBeNull();
  expect(standingReplyFor('["permission-asked"]', [DENY_ALL_BUT_QUESTIONS])).toBeNull();
  expect(standingReplyFor(permissionRequest('shell'), [])).toBeNull();
});

test('a template needing an identifier the line lacks, or holds as no string, is not sent', () => {
  expect(standingReplyFor(permissionRequest('shell', 7), [DENY_ALL_BUT_QUESTIONS])).toBeNull();
  expect(standingReplyFor(permissionRequest('shell'), [{ ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: 'request.missing' }])).toBeNull();
  expect(standingReplyFor(permissionRequest('shell'), [{ ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: null }])).toBeNull();
});

test('a template without the placeholder is answered as it is under a null path', () => {
  const rule: StandingReply = { ...DENY_ALL_BUT_QUESTIONS, replyTemplate: '{"behavior":"deny"}', requestIdentifierPath: null };
  expect(standingReplyFor(permissionRequest('shell'), [rule])).toBe('{"behavior":"deny"}');
});

test('the identifier is escaped as JSON string content', () => {
  const reply = standingReplyFor(permissionRequest('shell', 'r-"8"'), [DENY_ALL_BUT_QUESTIONS]) ?? '';
  expect(JSON.parse(reply)).toEqual({ askId: 'r-"8"', behavior: 'deny' });
});

test('an identifier holding a replacement pattern goes in as it is, never read as one', () => {
  for (const requestIdentifier of ['r-$&', 'r-$\'', 'r-$`', 'r-$$']) {
    const reply = standingReplyFor(permissionRequest('shell', requestIdentifier), [DENY_ALL_BUT_QUESTIONS]) ?? '';
    expect(JSON.parse(reply)).toEqual({ askId: requestIdentifier, behavior: 'deny' });
  }
});

test('a path is read only through own keys', () => {
  const rule: StandingReply = {
    whenAllEqual: { 'request.constructor': 'x' }, whenNoneEqual: {}, replyTemplate: 'reply', requestIdentifierPath: null
  };
  expect(standingReplyFor('{"request":{}}', [rule])).toBeNull();
  const inheritedIdentifier: StandingReply = { ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: 'request.constructor.name' };
  expect(standingReplyFor(permissionRequest('shell'), [inheritedIdentifier])).toBeNull();
});

test('the validator keeps the request identifier path, a null one included, and drops keys it does not name', () => {
  expect(standingReplyOf({ ...DENY_ALL_BUT_QUESTIONS, later: true })).toEqual(DENY_ALL_BUT_QUESTIONS);
  const withoutPlaceholder = { ...DENY_ALL_BUT_QUESTIONS, replyTemplate: 'reply', requestIdentifierPath: null };
  expect(standingReplyOf(withoutPlaceholder)).toEqual(withoutPlaceholder);
});

test('the validator refuses a rule without the request identifier path, or with one that is no string', () => {
  const { whenAllEqual, whenNoneEqual, replyTemplate } = DENY_ALL_BUT_QUESTIONS;
  expect(standingReplyOf({ whenAllEqual, whenNoneEqual, replyTemplate })).toBeNull();
  expect(standingReplyOf({ ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: 7 })).toBeNull();
  expect(standingReplyOf({ ...DENY_ALL_BUT_QUESTIONS, requestIdentifierPath: ['askId'] })).toBeNull();
});
