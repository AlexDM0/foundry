/**
 * How the page words a forge's system version against the one forge version this Gaia is built for, wherever it shows it. A forge is
 * spoken of in forge's own terms; Gaia's facts are its own version and the forge version it is built for. A version number stands apart
 * as its own part, so a view sets it in mono.
 */
import type {
  FleetDocumentForge,
  FleetDocumentForgeVersions,
  FleetDocumentGaia,
  FleetDocumentSystemVersion,
  FleetDocumentVersionsVerdict,
} from '../../@types/FleetDocument.ts';

export interface VersionsTextPart {
  readonly kind: 'words' | 'version';
  readonly text: string;
}

/** A line or sentence whose version numbers are parts of their own. */
export type VersionsText = readonly VersionsTextPart[];

/** A forge read with its versions; a forge whose versions are `null` was not asked them and is worded by none of this. */
export interface ForgeWithVersions {
  readonly project:  FleetDocumentForge['project'];
  readonly versions: FleetDocumentForgeVersions;
}

export type GaiaVersions = FleetDocumentGaia['versions'];

export interface VersionsCalloutText {
  readonly word:         string;
  readonly sentence:     string;
  readonly versionsLine: VersionsText;
}

export interface VersionsPairText {
  readonly forgeName: string;
  readonly forgeText: VersionsText;
  readonly gaiaText:  VersionsText;
  readonly verdict:   FleetDocumentVersionsVerdict;
  readonly reason:    VersionsText;
}

/** Attention's row of what Gaia reads of the forge: the forge's version on the right, in orange only for a forge that needs an update. */
export interface VersionsReadingText {
  readonly versionsText: VersionsText;
  readonly isWork:       boolean;
  readonly reading:      string;
}

/** The Forges row's second line under the condition: a plain subline for a current forge, a disclosure of the versions pair otherwise. */
export interface VersionsSublineText {
  readonly opensVersions: boolean;
  readonly text:          string;
}

export interface VersionsBarText {
  readonly line:  VersionsText;
  readonly title: string;
}

export interface VersionsNoticeText {
  readonly word:     string;
  readonly heading:  string;
  readonly sentence: string;
}

const VERDICT_WORDS: Readonly<Record<FleetDocumentVersionsVerdict, string>> = {
  current: 'Current',
  ahead:   'Ahead of this Gaia',
  newer:   'Newer than this Gaia',
  older:   'Older than this Gaia',
};

const STATES_NO_VERSION = 'states no version';

/** A forge that serves no `/api/versions` reads as older and states no version. */
const NO_VERSIONS_SERVED: FleetDocumentForgeVersions = { verdict: 'older', current: null, minimumSupported: null };

/** Under the Forges table, once for every forge. */
const VERSIONS_EXPLANATION = 'Each forge states its version and the oldest forge version a client may be built for and still be served. This Gaia is built '
  + 'for exactly one forge version. A forge older than that, or one that states no version, needs a forge update; a forge that no longer serves '
  + 'clients built for it needs a newer Gaia. In between, Gaia reads the forge in full and says quietly what is newer.';

/**
 * Update forge, step by step, alike in the callout, the Forges row and the forge bar. The done step's lead word, Restart and its dismiss
 * label are `ForgeCommandTextUtil.RESTART_PENDING`'s; the refusal is the forge's own sentence.
 */
const UPDATE_FORGE_TEXT = {
  pending:             'Updating the forge…',
  pendingInCallout:    'Updating the forge… its agents keep running',
  pendingButton:       'Updating',
  doneStandingAlone:   'Its Hephaestus runs the old code, and this Gaia reads none of it, until it restarts.',
  doneUnderAControl:   'Gaia reads it after the restart.',
  doneCalloutSentence: 'This forge stays older than the forge this Gaia is built for until its Hephaestus restarts.',
} as const;

function versionTextOf({ major, minor }: FleetDocumentSystemVersion): string {
  return `${major}.${minor}`;
}

/** Each interpolated version becomes a part of its own; the words between them, unless empty, a part each. */
function versionsTextOf(words: TemplateStringsArray, ...versions: FleetDocumentSystemVersion[]): VersionsText {
  return words.flatMap((text, i) => {
    const version = versions[i];
    const wordsPart: VersionsTextPart[] = text === '' ? [] : [{ kind: 'words', text }];
    return version === undefined ? wordsPart : [...wordsPart, { kind: 'version', text: versionTextOf(version) }];
  });
}

function plainTextOf(versionsText: VersionsText): string {
  return versionsText.map((part) => part.text).join('');
}

function verdictWordOf(verdict: FleetDocumentVersionsVerdict): string {
  return VERDICT_WORDS[verdict];
}

/** `forge 1.8`, or for a forge that serves no versions `forge states no version`. */
function forgeVersionTextOf(current: FleetDocumentSystemVersion | null): VersionsText {
  return current === null ? [{ kind: 'words', text: `forge ${STATES_NO_VERSION}` }] : versionsTextOf`forge ${current}`;
}

/** What the forge serves, in its own terms: `forge 4.1 · serves clients built for forge 4.0 and later`. */
function forgeServesTextOf({ current, minimumSupported }: FleetDocumentForgeVersions): VersionsText {
  if (current === null) return [{ kind: 'words', text: STATES_NO_VERSION }];
  if (minimumSupported === null) return versionsTextOf`forge ${current}`;
  return versionsTextOf`forge ${current} · serves clients built for forge ${minimumSupported} and later`;
}

/** The callout in "Forges that need a look", for a forge Gaia cannot talk to; a current or ahead forge has none. */
function calloutTextOf({ versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): VersionsCalloutText | null {
  const supported = versionTextOf(supportedForgeVersion);
  const builtFor = versionsTextOf` · this Gaia is built for forge ${supportedForgeVersion}`;
  switch (versions.verdict) {
    case 'older': {
      const opening = versions.current === null
        ? 'This forge states no version, so it is older than the forge this Gaia is built for.'
        : 'This forge is older than the forge this Gaia is built for.';
      return {
        word:         `${VERDICT_WORDS.older}.`,
        sentence:     `${opening} Gaia shows nothing of its work and sends it no command until the forge is updated. Its agents keep running.`,
        versionsLine: [...forgeVersionTextOf(versions.current), ...builtFor],
      };
    }
    case 'newer':
      return {
        word:     `${VERDICT_WORDS.newer}.`,
        sentence: `This forge no longer serves clients built for forge ${supported}, as this Gaia is. Gaia sees that it runs, shows nothing of its work `
          + 'and sends it no command. A newer Gaia shows it.',
        versionsLine: [...forgeServesTextOf(versions), ...builtFor],
      };
    case 'ahead':
    case 'current':
      return null;
  }
}

function verdictReasonOf({ current, verdict }: FleetDocumentForgeVersions, supported: FleetDocumentSystemVersion): VersionsText {
  switch (verdict) {
    case 'older':
      return current === null
        ? versionsTextOf`a forge that states no version is older than ${supported}`
        : versionsTextOf`${current} is below ${supported}, the forge this Gaia is built for`;
    case 'newer':
      return versionsTextOf`it no longer serves clients built for ${supported}`;
    case 'ahead':
      return versionsTextOf`it is above ${supported} and still serves clients built for ${supported}`;
    case 'current':
      return [{ kind: 'words', text: 'the forge this Gaia is built for' }];
  }
}

/** The forge's versions beside this Gaia's, and the verdict with its reason. */
function pairTextOf({ project, versions }: ForgeWithVersions, { systemVersion, supportedForgeVersion }: GaiaVersions): VersionsPairText {
  return {
    forgeName: project,
    forgeText: forgeServesTextOf(versions),
    gaiaText:  versionsTextOf`version ${systemVersion} · built for forge ${supportedForgeVersion}`,
    verdict:   versions.verdict,
    reason:    verdictReasonOf(versions, supportedForgeVersion),
  };
}

/** The sentence under the Forges row's open pair; a current forge opens no pair. */
function pairSentenceOf({ project, versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): string | null {
  switch (versions.verdict) {
    case 'older':
      return `Gaia shows that ${project} runs. It shows nothing of its work and sends it no command until the forge is updated; its agents keep `
        + 'running.';
    case 'newer':
      return `Gaia shows that ${project} runs. It shows nothing of its work and sends it no command. A newer Gaia shows it here.`;
    case 'ahead': {
      const current = versions.current === null ? '' : ` ${versionTextOf(versions.current)}`;
      return `Gaia reads all it knows of ${project} and shows its board. What forge${current} added since ${versionTextOf(supportedForgeVersion)} shows `
        + 'only in its Bridge; a newer Gaia shows it here too. Nothing waits on you.';
    }
    case 'current':
      return null;
  }
}

/** The Forges row's subline: `forge 3.1`, or the disclosure `3.4 · ahead`, `1.8 · older`, `4.1 · newer`, and `older` alone for no version. */
function sublineTextOf({ versions }: ForgeWithVersions): VersionsSublineText {
  const { current, verdict } = versions;
  if (verdict === 'current') return { opensVersions: false, text: current === null ? STATES_NO_VERSION : `forge ${versionTextOf(current)}` };
  return { opensVersions: true, text: current === null ? verdict : `${versionTextOf(current)} · ${verdict}` };
}

/** The quiet line under an ahead forge's Forges row; no other verdict has one. */
function quietLineOf({ versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): string | null {
  if (versions.verdict !== 'ahead' || versions.current === null) return null;
  const current = versionTextOf(versions.current);
  return `Forge ${current} is ahead of this Gaia, built for ${versionTextOf(supportedForgeVersion)}. All Gaia shows works; what ${current} added shows in its Bridge.`;
}

/** Attention's row of what Gaia reads of the forge. */
function readingTextOf({ versions }: ForgeWithVersions): VersionsReadingText {
  const { current, verdict } = versions;
  const forgeVersion = forgeVersionTextOf(current);
  const withVerdict = (word: string): VersionsText => (current === null
    ? [{ kind: 'words', text: `${STATES_NO_VERSION} · ${word}` }]
    : [...forgeVersion, { kind: 'words', text: ` · ${word}` }]);
  switch (verdict) {
    case 'current':
      return { versionsText: forgeVersion, isWork: false, reading: 'Everything, live.' };
    case 'ahead': {
      const whatWasAdded = current === null ? 'What the forge added' : `What ${versionTextOf(current)} added`;
      return { versionsText: withVerdict('ahead'), isWork: false, reading: `All this Gaia knows. ${whatWasAdded} shows in its Bridge.` };
    }
    case 'older':
      return { versionsText: withVerdict('older'), isWork: true, reading: 'That it runs. Nothing of its work until the forge is updated.' };
    case 'newer':
      return { versionsText: withVerdict('newer'), isWork: false, reading: 'That it runs. Nothing of its work.' };
  }
}

/** The rail row's title: the condition word, and for a forge at another version what that version means. */
function railTitleOf({ versions }: ForgeWithVersions, conditionWord: string): string {
  switch (versions.verdict) {
    case 'current':
      return conditionWord;
    case 'ahead':
      return versions.current === null ? conditionWord : `${conditionWord} · forge ${versionTextOf(versions.current)}, ahead of this Gaia`;
    case 'older':
      return `${VERDICT_WORDS.older} · update the forge`;
    case 'newer':
      return VERDICT_WORDS.newer;
  }
}

/**
 * The forge bar's version clause, which truncates first, and its whole sentence for the title. For an ahead forge the clause follows the
 * bar's agents; for a forge Gaia cannot talk to it follows the condition word alone. A current forge's bar names no version.
 */
function barTextOf({ project, versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): VersionsBarText | null {
  const { current, minimumSupported, verdict } = versions;
  const supported = versionTextOf(supportedForgeVersion);
  switch (verdict) {
    case 'current':
      return null;
    case 'ahead': {
      if (current === null) return null;
      const currentText = versionTextOf(current);
      return {
        line:  versionsTextOf`forge ${current}, its newest parts only in its Bridge`,
        title: `${project} is forge ${currentText}; this Gaia is built for ${supported}. Everything Gaia shows works; what ${currentText} added shows in its `
          + 'Bridge. A newer Gaia shows it here too.',
      };
    }
    case 'newer': {
      const serves = minimumSupported === null ? '' : ` and serves clients built for forge ${versionTextOf(minimumSupported)} and later`;
      return {
        line:  [...forgeVersionTextOf(current), ...versionsTextOf` · newer than this Gaia, built for ${supportedForgeVersion}`],
        title: `${project} is ${current === null ? 'a forge that states no version' : `forge ${versionTextOf(current)}`}${serves}; this Gaia is built for `
          + `forge ${supported}, so they cannot talk.`,
      };
    }
    case 'older':
      return current === null
        ? {
          line:  [{ kind: 'words', text: `${STATES_NO_VERSION} · older than this Gaia` }],
          title: `${project} states no version; this Gaia is built for forge ${supported}, so they cannot talk until the forge is updated.`,
        }
        : {
          line:  versionsTextOf`forge ${current} · older than this Gaia, built for ${supportedForgeVersion}`,
          title: `${project} is forge ${versionTextOf(current)}; this Gaia is built for forge ${supported}, so they cannot talk until the forge is updated.`,
        };
  }
}

/** The notice the forge view holds instead of its board, for a forge Gaia cannot talk to. */
function noticeTextOf({ project, versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): VersionsNoticeText | null {
  const supported = versionTextOf(supportedForgeVersion);
  switch (versions.verdict) {
    case 'newer':
      return {
        word:     `${VERDICT_WORDS.newer}.`,
        heading:  `This Gaia cannot show ${project} in place`,
        sentence: `${project} no longer serves clients built for forge ${supported}, as this Gaia is, so this Gaia cannot talk to it: it shows nothing of its `
          + 'work and sends it no command. The forge runs on its own. A newer Gaia shows it here.',
      };
    case 'older': {
      const forgeIs = versions.current === null ? `${project} ${STATES_NO_VERSION}` : `${project} is ${versionTextOf(versions.current)}`;
      return {
        word:     `${VERDICT_WORDS.older}.`,
        heading:  `${project} is older than this Gaia`,
        sentence: `This Gaia is built for forge ${supported}, and ${forgeIs}. Update the forge to show it here; its agents keep running.`,
      };
    }
    case 'ahead':
    case 'current':
      return null;
  }
}

/** The title of a control Gaia cannot send a forge it cannot talk to, naming both versions; `null` for a forge Gaia talks to. */
function unsentControlTitleOf({ project, versions }: ForgeWithVersions, { supportedForgeVersion }: GaiaVersions): string | null {
  const builtFor = `this Gaia is built for forge ${versionTextOf(supportedForgeVersion)}.`;
  const { current, minimumSupported } = versions;
  switch (versions.verdict) {
    case 'older':
      return current === null ? `${project} ${STATES_NO_VERSION}; ${builtFor}` : `${project} is forge ${versionTextOf(current)}; ${builtFor}`;
    case 'newer':
      return minimumSupported === null
        ? `${project} no longer serves clients built for forge ${versionTextOf(supportedForgeVersion)}; ${builtFor}`
        : `${project} serves clients built for forge ${versionTextOf(minimumSupported)} and later; ${builtFor}`;
    case 'ahead':
    case 'current':
      return null;
  }
}

export const ForgeVersionsTextUtil = {
  NO_VERSIONS_SERVED,
  VERSIONS_EXPLANATION,
  UPDATE_FORGE_TEXT,
  versionTextOf,
  plainTextOf,
  verdictWordOf,
  calloutTextOf,
  pairTextOf,
  pairSentenceOf,
  sublineTextOf,
  quietLineOf,
  readingTextOf,
  railTitleOf,
  barTextOf,
  noticeTextOf,
  unsentControlTitleOf,
} as const;
