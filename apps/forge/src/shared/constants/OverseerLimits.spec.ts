/**
 * A relation between the Overseer's limits and the Watcher's that no code checks at run time. What matters: the Watcher's client line limit
 * holds a chat line with every picture a message may carry, since the Watcher refuses a longer line and the message would never reach the
 * session.
 */
import { expect, test } from 'bun:test';

import { TALOS_CLIENT_LINE_LIMIT_CHARACTERS }                           from '../../lib/talos/constants/TalosProtocol.ts';
import { PICTURES_PER_MESSAGE_LIMIT, PICTURE_ENCODED_SIZE_LIMIT_BYTES } from './OverseerLimits.ts';

test('the Watcher client line limit is above the base64 of every picture one message may carry', () => {
  expect(TALOS_CLIENT_LINE_LIMIT_CHARACTERS).toBeGreaterThan(PICTURES_PER_MESSAGE_LIMIT * PICTURE_ENCODED_SIZE_LIMIT_BYTES);
});
