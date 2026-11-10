/**
 * What the entry does before the first paint and before the session exchange: the theme and the embedded mark.
 */
import type { PreferenceStore }                       from '../preferences/PreferenceStore.ts';
import { EmbeddedChannel, type EmbeddedSurroundings } from './EmbeddedChannel.ts';
import { type DocumentSurroundings, ThemeBootstrap }  from './ThemeBootstrap.ts';

export interface FirstPaintOutcome {
  readonly embedded:                 boolean;
  readonly stopFollowingParentTheme: () => void;
}

function prepare(
  store: PreferenceStore,
  documentSurroundings?: DocumentSurroundings,
  embeddedSurroundings: () => EmbeddedSurroundings = EmbeddedChannel.browserSurroundings,
): FirstPaintOutcome {
  const { embedded } = ThemeBootstrap.applyBeforeFirstPaint(store, documentSurroundings);
  if (!embedded) return { embedded, stopFollowingParentTheme: () => undefined };
  const follower = EmbeddedChannel.followParentTheme(embeddedSurroundings(), (choice) => ThemeBootstrap.applyParentTheme(choice, documentSurroundings));
  return { embedded, stopFollowingParentTheme: follower.close };
}

export const FirstPaint = Object.freeze({ prepare });
