/**
 * The words and machine values of an agent row: its state as a word, how long it has run, and a count with its thousands grouped. A running
 * time is computed from the forge's stamp and the page's clock for display only.
 */
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const TWO_DIGITS = 2;

/** The forge's job states whose word is not the state itself; a running job is named for what its role does. */
const STATE_WORDS: Readonly<Record<string, string>> = {
  'launching':          'Launching',
  'preparing':          'Preparing',
  'waiting-for-answer': 'Waiting',
  'awaiting-answer':    'Waiting',
  'interrupted':        'Interrupted',
  'stopping':           'Stopping',
  'in-customs':         'In customs',
  'gating':             'Gating',
  'merging':            'Merging',
  'landing':            'Landing',
};

const RUNNING_WORDS_BY_ROLE: Readonly<Record<string, string>> = {
  builder:  'Building',
  reviewer: 'Reviewing',
};

const RUNNING_STATE = 'running';
const RUNNING_WORD = 'Running';

const WAITING_STATES: ReadonlySet<string> = new Set(['waiting-for-answer', 'awaiting-answer']);

function twoDigits(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}

/** A state the forge names that Gaia does not know is shown as the forge wrote it. */
function stateWordOf(state: string, role: string | null): string {
  if (state === RUNNING_STATE) return role !== null && Object.hasOwn(RUNNING_WORDS_BY_ROLE, role) ? RUNNING_WORDS_BY_ROLE[role] ?? RUNNING_WORD : RUNNING_WORD;
  return Object.hasOwn(STATE_WORDS, state) ? STATE_WORDS[state] ?? state : state;
}

function stateIsWaiting(state: string): boolean {
  return WAITING_STATES.has(state);
}

/** `45s`, `12m 04s`, `1h 02m`; `null` for a stamp that does not read as a time. A stamp ahead of the page's clock reads as just started. */
function runningTimeText(startedAt: string, readAtMilliseconds: number): string | null {
  const startedAtMilliseconds = Date.parse(startedAt);
  if (Number.isNaN(startedAtMilliseconds)) return null;
  const elapsedSeconds = Math.max(0, Math.floor((readAtMilliseconds - startedAtMilliseconds) / MILLISECONDS_PER_SECOND));
  if (elapsedSeconds < SECONDS_PER_MINUTE) return `${elapsedSeconds}s`;
  if (elapsedSeconds < SECONDS_PER_HOUR) return `${Math.floor(elapsedSeconds / SECONDS_PER_MINUTE)}m ${twoDigits(elapsedSeconds % SECONDS_PER_MINUTE)}s`;
  const elapsedMinutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  return `${Math.floor(elapsedMinutes / MINUTES_PER_HOUR)}h ${twoDigits(elapsedMinutes % MINUTES_PER_HOUR)}m`;
}

/** `821,300`: the grouping does not follow the browser's language, so a count reads the same on every machine. */
function groupedNumberText(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

export const AgentTextUtil = {
  stateWordOf,
  stateIsWaiting,
  runningTimeText,
  groupedNumberText,
  countedPhrase,
} as const;
