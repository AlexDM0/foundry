/**
 * What the entry does before the first paint and before the session exchange: the theme and the embedded mark.
 */
import type { PreferenceStore }                       from '../preferences/PreferenceStore.ts';
import { EmbeddedChannel, type EmbeddedSurroundings } from './EmbeddedChannel.ts';
import {
  type DocumentSurroundings,
  type EmbeddingHost,
  type ThemeChoice,
  ThemeBootstrap
} from './ThemeBootstrap.ts';
import { VersionedEmbedChannel } from './VersionedEmbedChannel.ts';

export interface FirstPaintOutcome {
  readonly embeddingHost:            EmbeddingHost | null;
  readonly stopFollowingParentTheme: () => void;
}

function prepare(
  store: PreferenceStore,
  documentSurroundings?: DocumentSurroundings,
  embeddedSurroundings: () => EmbeddedSurroundings = EmbeddedChannel.browserSurroundings,
): FirstPaintOutcome {
  const { embeddingHost } = ThemeBootstrap.applyBeforeFirstPaint(store, documentSurroundings);
  if (embeddingHost === null) return { embeddingHost, stopFollowingParentTheme: () => undefined };
  const onTheme = (choice: ThemeChoice): void => ThemeBootstrap.applyParentTheme(choice, documentSurroundings);
  const follower = embeddingHost === 'gaia'
    ? VersionedEmbedChannel.followParent(embeddedSurroundings(), { onTheme })
    : EmbeddedChannel.followParentTheme(embeddedSurroundings(), onTheme);
  return { embeddingHost, stopFollowingParentTheme: follower.close };
}

export const FirstPaint = Object.freeze({ prepare });
