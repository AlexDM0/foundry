/**
 * How the page words a forge's version against the one this Gaia is built for, exactly as the Versions boards word it: each verdict's
 * words, a version number as its own part so it can stand in mono, and no sentence that offers to update Gaia or names a command.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_VERSIONS, FLEET_VERSIONS_READINGS }  from '../../testing/fixtures/fleet-versions.ts';
import { ForgeVersionsTextUtil, type VersionsText } from './ForgeVersionsTextUtil.ts';

const GAIA = FLEET_VERSIONS.gaia.versions;

const {
  exampleStorefront: AHEAD, invoiceService: CURRENT, exampleBilling: OLDER, analyticsSandbox: NEWER, exampleDocs: NO_VERSION
} = FLEET_VERSIONS_READINGS;


/** The parts written as the boards' source writes them: each version number between bars. */
function barredOf(versionsText: VersionsText | undefined): string {
  return (versionsText ?? []).map((part) => (part.kind === 'version' ? `|${part.text}|` : part.text)).join('');
}

function withVersions(forge: (typeof FLEET_VERSIONS_READINGS)[keyof typeof FLEET_VERSIONS_READINGS]) {
  if (forge.versions === null) throw new Error(`The fixture reads ${forge.project} without its versions.`);
  return { project: forge.project, versions: forge.versions };
}

describe('the verdict', () => {
  test('has its word for each verdict', () => {
    expect((['current', 'ahead', 'newer', 'older'] as const).map((verdict) => ForgeVersionsTextUtil.verdictWordOf(verdict))).toEqual([
      'Current',
      'Ahead of this Gaia',
      'Newer than this Gaia',
      'Older than this Gaia',
    ]);
  });

  test('prints a version as major.minor, so 3.10 reads as itself', () => {
    expect(ForgeVersionsTextUtil.versionTextOf({ major: 3, minor: 10 })).toBe('3.10');
  });
});

describe('the callout of a forge Gaia cannot talk to', () => {
  test('words an older forge with its version beside the one this Gaia is built for', () => {
    const callout = ForgeVersionsTextUtil.calloutTextOf(withVersions(OLDER), GAIA);
    expect([callout?.word, callout?.sentence]).toEqual([
      'Older than this Gaia.',
      'This forge is older than the forge this Gaia is built for. Gaia shows nothing of its work and sends it no command until the forge is '
        + 'updated. Its agents keep running.',
    ]);
    expect(barredOf(callout?.versionsLine)).toBe('forge |1.8| · this Gaia is built for forge |3.1|');
  });

  test('words a forge that states no version as older, and says it states none', () => {
    const callout = ForgeVersionsTextUtil.calloutTextOf(withVersions(NO_VERSION), GAIA);
    expect(callout?.sentence).toBe('This forge states no version, so it is older than the forge this Gaia is built for. Gaia shows nothing of its work '
      + 'and sends it no command until the forge is updated. Its agents keep running.');
    expect(barredOf(callout?.versionsLine)).toBe('forge states no version · this Gaia is built for forge |3.1|');
  });

  test('words a newer forge in its own terms, by the oldest forge version it still serves', () => {
    const callout = ForgeVersionsTextUtil.calloutTextOf(withVersions(NEWER), GAIA);
    expect([callout?.word, callout?.sentence]).toEqual([
      'Newer than this Gaia.',
      'This forge no longer serves clients built for forge 3.1, as this Gaia is. Gaia sees that it runs, shows nothing of its work and sends it '
        + 'no command. A newer Gaia shows it.',
    ]);
    expect(barredOf(callout?.versionsLine)).toBe('forge |4.1| · serves clients built for forge |4.0| and later · this Gaia is built for forge |3.1|');
  });

  test('is absent for a current or an ahead forge', () => {
    expect([ForgeVersionsTextUtil.calloutTextOf(withVersions(AHEAD), GAIA), ForgeVersionsTextUtil.calloutTextOf(withVersions(CURRENT), GAIA)]).toEqual([null, null]);
  });
});

describe('the versions pair', () => {
  test('sets the forge\'s versions beside this Gaia\'s, and the verdict\'s reason, for each verdict', () => {
    const pairs = [OLDER, NO_VERSION, NEWER, AHEAD, FLEET_VERSIONS_READINGS.researchWiki].map((forge) => ForgeVersionsTextUtil.pairTextOf(withVersions(forge), GAIA));
    expect(pairs.map((pair) => [pair.forgeName, barredOf(pair.forgeText), pair.verdict, barredOf(pair.reason)])).toEqual([
      ['Example Billing', 'forge |1.8| · serves clients built for forge |1.0| and later', 'older', '|1.8| is below |3.1|, the forge this Gaia is built for'],
      ['Example Docs', 'states no version', 'older', 'a forge that states no version is older than |3.1|'],
      ['Analytics Sandbox', 'forge |4.1| · serves clients built for forge |4.0| and later', 'newer', 'it no longer serves clients built for |3.1|'],
      ['Example Storefront', 'forge |3.4| · serves clients built for forge |3.0| and later', 'ahead', 'it is above |3.1| and still serves clients built for |3.1|'],
      ['Research Wiki', 'forge |3.1| · serves clients built for forge |3.0| and later', 'current', 'the forge this Gaia is built for'],
    ]);
    expect(pairs.every((pair) => barredOf(pair.gaiaText) === 'version |1.4| · built for forge |3.1|')).toBe(true);
  });

  test('has its sentence under the Forges row for every verdict but current, which opens no pair', () => {
    expect([OLDER, NEWER, AHEAD, CURRENT].map((forge) => ForgeVersionsTextUtil.pairSentenceOf(withVersions(forge), GAIA))).toEqual([
      'Gaia shows that Example Billing runs. It shows nothing of its work and sends it no command until the '
        + 'forge is updated; its agents keep running.',
      'Gaia shows that Analytics Sandbox runs. It shows nothing of its work and sends it no command. A newer '
        + 'Gaia shows it here.',
      'Gaia reads all it knows of Example Storefront and shows its board. What forge 3.4 added since 3.1 shows only in its Bridge; a newer '
        + 'Gaia shows it here too. Nothing waits on you.',
      null,
    ]);
  });
});

describe('the Forges row', () => {
  test('says forge 3.1 under a current forge, and opens the pair from the others\' version and verdict', () => {
    expect([CURRENT, AHEAD, OLDER, NO_VERSION, NEWER].map((forge) => ForgeVersionsTextUtil.sublineTextOf(withVersions(forge)))).toEqual([
      { opensVersions: false, text: 'forge 3.1' },
      { opensVersions: true, text: '3.4 · ahead' },
      { opensVersions: true, text: '1.8 · older' },
      { opensVersions: true, text: 'older' },
      { opensVersions: true, text: '4.1 · newer' },
    ]);
  });

  test('says quietly under an ahead forge what differs, and nothing under any other', () => {
    expect([AHEAD, CURRENT, OLDER, NEWER].map((forge) => ForgeVersionsTextUtil.quietLineOf(withVersions(forge), GAIA))).toEqual([
      'Forge 3.4 is ahead of this Gaia, built for 3.1. All Gaia shows works; what 3.4 added shows in its Bridge.',
      null,
      null,
      null,
    ]);
  });

  test('explains the verdicts once, under the table', () => {
    expect(ForgeVersionsTextUtil.VERSIONS_EXPLANATION).toBe('Each forge states its version and the oldest forge version a client may be built for and '
      + 'still be served. This Gaia is built for exactly one forge version. A forge older than that, or one that states no version, needs a forge '
      + 'update; a forge that no longer serves clients built for it needs a newer Gaia. In between, Gaia reads the forge in full and says quietly '
      + 'what is newer.');
  });
});

describe('Attention\'s row of what Gaia reads of each forge', () => {
  test('names the forge\'s version and what Gaia reads of it, in orange only for a forge that needs an update', () => {
    const readings = [AHEAD, CURRENT, OLDER, NEWER].map((forge) => ForgeVersionsTextUtil.readingTextOf(withVersions(forge)));
    expect(readings.map((reading) => [barredOf(reading.versionsText), reading.isWork, reading.reading])).toEqual([
      ['forge |3.4| · ahead', false, 'All this Gaia knows. What 3.4 added shows in its Bridge.'],
      ['forge |3.1|', false, 'Everything, live.'],
      ['forge |1.8| · older', true, 'That it runs. Nothing of its work until the forge is updated.'],
      ['forge |4.1| · newer', false, 'That it runs. Nothing of its work.'],
    ]);
  });
});

describe('the rail row\'s title', () => {
  test('is the condition word, with what an ahead forge\'s version means, and the verdict for a forge Gaia cannot talk to', () => {
    expect([AHEAD, CURRENT, OLDER, NEWER].map((forge) => ForgeVersionsTextUtil.railTitleOf(withVersions(forge), 'Running'))).toEqual([
      'Running · forge 3.4, ahead of this Gaia',
      'Running',
      'Older than this Gaia · update the forge',
      'Newer than this Gaia',
    ]);
  });
});

describe('the forge bar', () => {
  test('ends an ahead forge\'s line with a quiet clause, and holds the whole sentence in its title', () => {
    const bar = ForgeVersionsTextUtil.barTextOf(withVersions(AHEAD), GAIA);
    expect(barredOf(bar?.line)).toBe('forge |3.4|, its newest parts only in its Bridge');
    expect(bar?.title).toBe('Example Storefront is forge 3.4; this Gaia is built for 3.1. Everything Gaia shows works; what 3.4 added shows in its '
      + 'Bridge. A newer Gaia shows it here too.');
  });

  test('names both versions for a forge Gaia cannot talk to, and a forge that states no version as older', () => {
    const bars = [NEWER, OLDER, NO_VERSION].map((forge) => ForgeVersionsTextUtil.barTextOf(withVersions(forge), GAIA));
    expect(bars.map((bar) => [barredOf(bar?.line), bar?.title])).toEqual([
      [
        'forge |4.1| · newer than this Gaia, built for |3.1|',
        'Analytics Sandbox is forge 4.1 and serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1, so they cannot talk.',
      ],
      [
        'forge |1.8| · older than this Gaia, built for |3.1|',
        'Example Billing is forge 1.8; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated.',
      ],
      [
        'states no version · older than this Gaia',
        'Example Docs states no version; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated.',
      ],
    ]);
  });

  test('names no version for a current forge', () => {
    expect(ForgeVersionsTextUtil.barTextOf(withVersions(CURRENT), GAIA)).toBeNull();
  });

  test('holds a notice instead of the board of a forge Gaia cannot talk to, and none for one it talks to', () => {
    expect([NEWER, OLDER].map((forge) => ForgeVersionsTextUtil.noticeTextOf(withVersions(forge), GAIA))).toEqual([
      {
        word:     'Newer than this Gaia.',
        heading:  'This Gaia cannot show Analytics Sandbox in place',
        sentence: 'Analytics Sandbox no longer serves clients built for forge 3.1, as this Gaia is, so this Gaia cannot talk to it: it shows nothing '
          + 'of its work and sends it no command. The forge runs on its own. A newer Gaia shows it here.',
      },
      {
        word:     'Older than this Gaia.',
        heading:  'Example Billing is older than this Gaia',
        sentence: 'This Gaia is built for forge 3.1, and Example Billing is 1.8. Update the forge to show it here; its agents keep running.',
      },
    ]);
    expect([AHEAD, CURRENT].map((forge) => ForgeVersionsTextUtil.noticeTextOf(withVersions(forge), GAIA))).toEqual([null, null]);
  });

  test('titles a control Gaia cannot send with both versions, and leaves a control it sends untitled', () => {
    expect([OLDER, NEWER, NO_VERSION, AHEAD, CURRENT].map((forge) => ForgeVersionsTextUtil.unsentControlTitleOf(withVersions(forge), GAIA))).toEqual([
      'Example Billing is forge 1.8; this Gaia is built for forge 3.1.',
      'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
      'Example Docs states no version; this Gaia is built for forge 3.1.',
      null,
      null,
    ]);
  });
});

const EVERY_FORGE = [AHEAD, CURRENT, OLDER, NEWER, NO_VERSION].map(withVersions);

describe('every sentence', () => {
  test('offers no update of Gaia, names no command, and speaks of no oldest Gaia and no Gaia minimum', () => {
    const sentences = EVERY_FORGE.flatMap((forge) => {
      const callout = ForgeVersionsTextUtil.calloutTextOf(forge, GAIA);
      const pair = ForgeVersionsTextUtil.pairTextOf(forge, GAIA);
      const bar = ForgeVersionsTextUtil.barTextOf(forge, GAIA);
      const notice = ForgeVersionsTextUtil.noticeTextOf(forge, GAIA);
      const reading = ForgeVersionsTextUtil.readingTextOf(forge);
      return [
        callout?.word,
        callout?.sentence,
        ForgeVersionsTextUtil.plainTextOf(callout?.versionsLine ?? []),
        ForgeVersionsTextUtil.plainTextOf(pair.forgeText),
        ForgeVersionsTextUtil.plainTextOf(pair.reason),
        ForgeVersionsTextUtil.pairSentenceOf(forge, GAIA),
        ForgeVersionsTextUtil.sublineTextOf(forge).text,
        ForgeVersionsTextUtil.quietLineOf(forge, GAIA),
        reading.reading,
        ForgeVersionsTextUtil.railTitleOf(forge, 'Running'),
        bar?.title,
        notice?.heading,
        notice?.sentence,
        ForgeVersionsTextUtil.unsentControlTitleOf(forge, GAIA),
      ].filter((sentence) => typeof sentence === 'string');
    });
    const everyText = [...sentences, ForgeVersionsTextUtil.VERSIONS_EXPLANATION, ...Object.values(ForgeVersionsTextUtil.UPDATE_FORGE_TEXT)].join('\n');
    expect(everyText).not.toMatch(/Update Gaia|oldest Gaia|talks to forge|minimum|`|--[a-z]|\bbun\b|gaia install/);
  });
});
