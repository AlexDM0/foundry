/**
 * D10 at the page's edge: no forge sentence reaches the page telling User to run a command. A refusal or a notice the forge is known to word
 * with a command leaves in Gaia's words, by its code or kind; any other sentence that still names a command is dropped for a neutral one.
 */

/** Any backticked span counts as a command, since the forge backticks only what is typed. */
const BACKTICKED_SPAN = /`[^`]+`/;

/** The forge program's verbs, as its command table lists them, as a sentence names them after the program's own name. */
const FORGE_VERB_NAMED = new RegExp(
  '\\bforge (?:init|update|status|task|log|hook|usage|review-stats|ticket|epic|draft|concurrency|merges|merge|worktree|gate|decisions|decide'
  + '|question|incidents|incident|jobs|job|intake|advise|await|range|open|clear|oversee|version|start|stop|machine|login-item|help)\\b',
  'i',
);

/** The forge's refusal codes whose sentence names a command, each in Gaia's words: Gaia updates, starts and opens the forge itself. */
const REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  'launches-held-by-install-change': 'The install version changed. Nothing launches until this forge is updated.',
  'install-version-mismatch':        'The install version of the forge files in this repository does not match the forge program Gaia runs, so nothing was done.',
  'no-tracker-at-override':          'No forge tracker was found in this repository, so nothing was done.',
  'no-tracker-found':                'No forge tracker was found in this repository, so nothing was done.',
  'unauthorized':                    'The Overseer did not accept Gaia\'s token. It may have restarted.',
  'read-failed':                     'The Overseer could not read the board\'s files.',
};

/**
 * The Overseer's notice kinds Gaia words itself: those whose sentence names a command in monitor contract 1, and `assistant-down`, the
 * forge's warning that Gaia shows as a notice.
 */
const NOTICE_SENTENCES: Readonly<Record<string, string>> = {
  'new-code':                  'New code is on disk. The Overseer runs the code it started with until it restarts.',
  'install-version-changed':   'The install version changed. Nothing launches until this forge is updated.',
  'claude-md-block-committed': 'Launches wait until the CLAUDE.md change that updating the forge made is committed.',
  'assistant-down':            'This forge\'s Assistant cannot come up, so its open incidents take their defaults.',
};

const NEUTRAL_NOTICE_SENTENCE = 'This forge raised a notice that Gaia does not word yet.';

const NEUTRAL_WARNING_SENTENCE = 'This forge reports a warning that Gaia does not word yet.';

const NEUTRAL_ACTIVITY_SENTENCE = 'This forge logged an entry that Gaia does not word yet.';

const NEUTRAL_BRAIN_INTENT_SENTENCE = 'Flint\'s brain made a move that Gaia does not word yet.';

function ownSentenceOf(sentences: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(sentences, key) ? sentences[key] ?? null : null;
}

function sentenceNamesACommand(sentence: string): boolean {
  return BACKTICKED_SPAN.test(sentence) || FORGE_VERB_NAMED.test(sentence);
}

/** `null` when the forge's sentence names a command Gaia has no words for, so the page words the refusal from its outcome. */
function refusalSentenceOf(refusal: string | null, text: string | null): string | null {
  const gaiaSentence = refusal === null ? null : ownSentenceOf(REFUSAL_SENTENCES, refusal);
  if (gaiaSentence !== null) return gaiaSentence;
  return text === null || sentenceNamesACommand(text) ? null : text;
}

function noticeSentenceOf(kind: string, text: string): string {
  const gaiaSentence = ownSentenceOf(NOTICE_SENTENCES, kind);
  if (gaiaSentence !== null) return gaiaSentence;
  return sentenceNamesACommand(text) ? NEUTRAL_NOTICE_SENTENCE : text;
}

/** The forge's sentence as it is, or `null` when it names a command and the page words the state itself. */
function sentenceNamingNoCommandOf(text: string): string | null {
  return sentenceNamesACommand(text) ? null : text;
}

/** Gaia has no words of its own for a warning, of a kind or of none (monitor 1): only the guard words one. */
function warningSentenceOf(text: string): string {
  return sentenceNamesACommand(text) ? NEUTRAL_WARNING_SENTENCE : text;
}

/** An activity entry's text is the forge's free text, of any kind or of none, so only the guard words one. */
function activitySentenceOf(text: string): string {
  return sentenceNamesACommand(text) ? NEUTRAL_ACTIVITY_SENTENCE : text;
}

/** A brain move's intent is the brain's own free text, so only the guard words one; its emote is dropped instead, since a move needs none. */
function brainIntentSentenceOf(intent: string): string {
  return sentenceNamesACommand(intent) ? NEUTRAL_BRAIN_INTENT_SENTENCE : intent;
}

export const ForgeSentenceUtil = {
  sentenceNamesACommand,
  refusalSentenceOf,
  sentenceNamingNoCommandOf,
  noticeSentenceOf,
  warningSentenceOf,
  activitySentenceOf,
  brainIntentSentenceOf,
} as const;
