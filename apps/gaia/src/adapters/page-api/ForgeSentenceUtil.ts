/**
 * D10 at the page's edge: no forge sentence but a refusal reaches the page telling User to run a command. A notice the forge is known to
 * word with a command leaves in Gaia's words, by its kind; any other sentence that still names a command is dropped for a neutral one. A
 * refusal is never routed here: it reads as the forge's own sentence, unchanged (decision 45).
 */
import { FORGE_NOTICE_KINDS } from '../../shared/constants/ForgeNoticeKinds.ts';

/** Any backticked span counts as a command, since the forge backticks only what is typed. */
const BACKTICKED_SPAN = /`[^`]+`/;

/** The forge program's verbs, as its command table lists them, as a sentence names them after the program's own name. */
const FORGE_VERB_NAMED = new RegExp(
  '\\bforge (?:init|update|status|task|log|hook|usage|review-stats|ticket|epic|draft|concurrency|merges|merge|worktree|gate|decisions|decide'
  + '|question|incidents|incident|jobs|job|intake|advise|await|range|open|clear|oversee|version|start|stop|machine|login-item|help)\\b',
  'i',
);

/**
 * The Overseer's notice kinds Gaia words itself: those whose sentence names a command in monitor contract 1, and `assistant-down`, the
 * forge's warning that Gaia shows as a notice.
 */
const NOTICE_SENTENCES: Readonly<Record<string, string>> = {
  'new-code':                         'New code is on disk. The Overseer runs the code it started with until it restarts.',
  'install-version-changed':          'The install version changed. Nothing launches until this forge is updated.',
  [FORGE_NOTICE_KINDS.assistantDown]: 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.',
};

/**
 * The forge verbs a registry entry's last command names that Gaia runs itself, each by the name of Gaia's own command for it. Every other
 * verb is the forge's own business, and the page shows no last command for it.
 */
const LAST_COMMAND_NAMES: Readonly<Record<string, string>> = {
  'init':         'Add a repository',
  'update':       'Update forge',
  'start':        'Start forge',
  'oversee':      'Start forge',
  'stop':         'Stop forge',
  'oversee stop': 'Stop forge',
};

const NEUTRAL_NOTICE_SENTENCE = 'This forge raised a notice that Gaia does not word yet.';

const NEUTRAL_WARNING_SENTENCE = 'This forge reports a warning that Gaia does not word yet.';

const NEUTRAL_ACTIVITY_SENTENCE = 'This forge logged an entry that Gaia does not word yet.';

function ownSentenceOf(sentences: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(sentences, key) ? sentences[key] ?? null : null;
}

function sentenceNamesACommand(sentence: string): boolean {
  return BACKTICKED_SPAN.test(sentence) || FORGE_VERB_NAMED.test(sentence);
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

/** A registry entry's last command, as the forge words it, by the name of Gaia's own command for it, or `null` for any other. */
function lastCommandNameOf(lastCommand: string | null): string | null {
  return lastCommand === null ? null : ownSentenceOf(LAST_COMMAND_NAMES, lastCommand);
}

/** Gaia has no words of its own for a warning, of any kind: only the guard words one. */
function warningSentenceOf(text: string): string {
  return sentenceNamesACommand(text) ? NEUTRAL_WARNING_SENTENCE : text;
}

/** An activity entry's text is the forge's free text, of any kind or of none, so only the guard words one. */
function activitySentenceOf(text: string): string {
  return sentenceNamesACommand(text) ? NEUTRAL_ACTIVITY_SENTENCE : text;
}

export const ForgeSentenceUtil = {
  sentenceNamesACommand,
  sentenceNamingNoCommandOf,
  noticeSentenceOf,
  lastCommandNameOf,
  warningSentenceOf,
  activitySentenceOf,
} as const;
