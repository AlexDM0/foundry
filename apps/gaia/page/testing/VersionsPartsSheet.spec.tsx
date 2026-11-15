/**
 * The Versions parts sheet. What matters: it holds a pair at each verdict and one for the forge that states no version, every verdict's
 * label, and the versions line, in a document naming its theme, so the by-eye pass compares every shared part with U4.
 */
import { describe, expect, test } from 'bun:test';

import { SCREEN_THEMES }           from './ArtboardScreens.tsx';
import { versionsPartsDocumentOf } from './VersionsPartsSheet.tsx';

describe('the Versions parts sheet', () => {
  test('holds five pairs, the four verdicts\' labels and a versions line, in each theme', () => {
    for (const theme of SCREEN_THEMES) {
      const sheet = versionsPartsDocumentOf(theme);
      expect(sheet).toStartWith(`<!doctype html>\n<html lang="en" data-theme="${theme}">`);
      expect(sheet.match(/<dl class="gaia-versions-pair">/g)).toHaveLength(5);
      expect(['current', 'ahead', 'newer', 'older'].map((verdict) => sheet.split(`class="gaia-versions-verdict" data-verdict="${verdict}"`).length - 1)).toEqual([2, 2, 2, 3]);
      expect(sheet).toContain('class="gaia-versions-line"');
    }
  });
});
