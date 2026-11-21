/**
 * The intake chat's own cue (`docs/design/board.md`, "Flint's habitats on the board views", `chat`). What matters: a draft whose state becomes
 * `researching` is cued once, as is a draft that appears researching; a draft that stays researching, one that leaves the state, and one that appears
 * waiting are no change.
 */
import { expect, test } from 'bun:test';

import type { CuedDraft }    from './IntakeSpriteModel.ts';
import { IntakeSpriteModel } from './IntakeSpriteModel.ts';

const draft = (state: CuedDraft['state'], id = 'D1'): CuedDraft => ({ id, state });

test.each<readonly [string, readonly CuedDraft[], readonly CuedDraft[], readonly string[]]>([
  ['a draft that becomes researching', [draft('waiting')], [draft('researching')], ['draft-is-researching']],
  ['a draft that appears researching', [], [draft('researching')], ['draft-is-researching']],
  ['two drafts that become researching at once', [draft('waiting'), draft('resumable', 'D2')], [draft('researching'), draft('researching', 'D2')], ['draft-is-researching']],
  ['a draft that stays researching', [draft('researching')], [draft('researching')], []],
  ['a draft that leaves researching', [draft('researching')], [draft('waiting')], []],
  ['a draft that appears waiting', [], [draft('waiting')], []],
])('%s', (_description, previous, next, cueNames) => {
  expect(IntakeSpriteModel.cuesBetween(previous, next)).toEqual(cueNames);
});
