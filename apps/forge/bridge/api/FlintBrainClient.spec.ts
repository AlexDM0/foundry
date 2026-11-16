/**
 * The brain's ask client over a recording token source. What matters: it posts the digest as JSON to the Bridge's own ask route through
 * the token source the command client shares, so one rotation is fetched once; and a lost session and an Overseer that cannot be reached
 * reach the director as they are, which leaves the move to the rule director. The route's answers have no recorded call shape yet, so
 * no spec here words one.
 */
import { describe, expect, test } from 'bun:test';

import type { FlintBrainDigestDocument }      from './FlintBrainClient.ts';
import { FlintBrainClient }                   from './FlintBrainClient.ts';
import type { SessionTokenSource, TokenPost } from './SessionTokenSource.ts';

const DIGEST: FlintBrainDigestDocument = {
  habitatKind:       null,
  description:       null,
  suggestions:       [],
  recentCues:        [],
  newCues:           [],
  content:           null,
  lastIntent:        null,
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 0,
  intents:           ['wander', 'wave'],
  emotes:            [],
};

interface RecordedPost {
  readonly path:    string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body:    BodyInit;
}

function recordingTokenSource(posted: TokenPost): { readonly source: SessionTokenSource; readonly posts: RecordedPost[] } {
  const posts: RecordedPost[] = [];
  return {
    source: {
      post: (path, headers, body) => {
        posts.push({ path, headers, body });
        return Promise.resolve(posted);
      },
    },
    posts,
  };
}

describe('the brain\'s ask client', () => {
  test('posts the digest as JSON to the ask route through the shared token source', async () => {
    const recording = recordingTokenSource({ verdict: 'unreachable' });
    expect(await FlintBrainClient.create(recording.source).ask(DIGEST)).toEqual({ verdict: 'unreachable' });
    expect(recording.posts).toEqual([{ path: '/api/flint-brain/ask', headers: { 'content-type': 'application/json' }, body: JSON.stringify(DIGEST) }]);
  });

  test('a lost session is no-session, and an Overseer gone is unreachable', async () => {
    expect(await FlintBrainClient.create(recordingTokenSource({ verdict: 'no-session' }).source).ask(DIGEST)).toEqual({ verdict: 'no-session' });
    expect(await FlintBrainClient.create(recordingTokenSource({ verdict: 'unreachable' }).source).ask(DIGEST)).toEqual({ verdict: 'unreachable' });
  });
});
