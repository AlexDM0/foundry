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

/** The Overseer's notice kinds whose sentence names a command, each in Gaia's words. */
const NOTICE_SENTENCES: Readonly<Record<string, string>> = {
  'new-code':                  'New code is on disk. The Overseer runs the code it started with until it restarts.',
  'install-version-changed':   'The install version changed. Nothing launches until this forge is updated.',
  'claude-md-block-committed': 'Launches wait until the CLAUDE.md change that updating the forge made is committed.',
};

const NEUTRAL_NOTICE_SENTENCE = 'This forge raised a notice that Gaia does not word yet.';

const NEUTRAL_WARNING_SENTENCE = 'This forge reports a warning that Gaia does not word yet.';

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

/** Monitor contract 1 gives a warning no kind, so only the guard words it. */
function warningSentenceOf(text: string): string {
  return sentenceNamesACommand(text) ? NEUTRAL_WARNING_SENTENCE : text;
}

export const ForgeSentenceUtil = {
  sentenceNamesACommand,
  refusalSentenceOf,
  noticeSentenceOf,
  warningSentenceOf,
} as const;
