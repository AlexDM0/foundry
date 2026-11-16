/**
 * What the entry does before the first paint and before the session exchange: the theme, followed through each change of the system's
 * scheme while it is `auto`, and the embed mode, whose framing page's theme the embed channel follows from then on.
 */
import type { PreferenceStore }                       from '../preferences/PreferenceStore.ts';
import { EmbeddedChannel, type EmbeddedSurroundings } from './EmbeddedChannel.ts';
import {
  type DocumentSurroundings,
  type EmbedMode,
  type ThemeChoice,
  ThemeBootstrap
} from './ThemeBootstrap.ts';
import { VersionedEmbedChannel } from './VersionedEmbedChannel.ts';

export interface FirstPaintOutcome {
  readonly embedMode:                 EmbedMode | null;
  readonly stopFollowingParentTheme:  () => void;
  readonly stopFollowingSystemScheme: () => void;
}

function prepare(
  store: PreferenceStore,
  documentSurroundings?: DocumentSurroundings,
  embeddedSurroundings: () => EmbeddedSurroundings = EmbeddedChannel.browserSurroundings,
): FirstPaintOutcome {
  const { embedMode } = ThemeBootstrap.applyBeforeFirstPaint(store, documentSurroundings);
  const stopFollowingSystemScheme = ThemeBootstrap.followSystemScheme(documentSurroundings);
  if (embedMode === null) return { embedMode, stopFollowingParentTheme: () => undefined, stopFollowingSystemScheme };
  const onTheme = (choice: ThemeChoice): void => ThemeBootstrap.applyParentTheme(choice, documentSurroundings);
  const follower = VersionedEmbedChannel.followParent(embeddedSurroundings(), { onTheme });
  return { embedMode, stopFollowingParentTheme: follower.close, stopFollowingSystemScheme };
}

export const FirstPaint = Object.freeze({ prepare });
