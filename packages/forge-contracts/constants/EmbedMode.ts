/**
 * The query a framing page opens a forge's Bridge with, `?embedded=frame`: the Bridge leaves its own chrome to the host and speaks the
 * embed channel (`@types/EmbedChannelMessage.ts`). The value names no host.
 */
export const EMBED_MODE_QUERY = {
  parameter: 'embedded',
  value:     'frame',
} as const;
