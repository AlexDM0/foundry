/** The bounds Hephaestus and the sessions it launches keep: how long a relayed verb waits for its reply, and how much a worker may file. */

/** How many times a relayed verb looks for its reply before it prints `queued <requestId>`; a schedule only, never a decision. */
export const HATCH_REPLY_TRIES = 20;

export const HATCH_REPLY_INTERVAL_MILLISECONDS = 250;

/** The low findings one builder, reviewer or Airlock agent job may file through its Hatch. */
export const WORKER_FILINGS_PER_JOB = 10;

/** The calls a session may make past its role's call budget after the wind-down message, before Hephaestus stops it `out-of-calls`. */
export const WIND_DOWN_GRACE_CALLS = 10;

/** The calls a session resumed after a red handoff may make before its wind-down message, counted from the resume. */
export const RED_HANDOFF_RESUME_CALL_BUDGET = 30;

/** Consecutive Hephaestus sweeps a running build or review job's event log may stand still before it opens `quiet-job`: a count, never a clock. */
export const QUIET_JOB_SWEEPS = 6;

/**
 * The refused forced stops of a lost child's tree before its job ends `blocked` and opens `forced-stop-refused`: Hephaestus start
 * tries once, then each sweep once. A count, never a clock.
 */
export const FORCED_STOP_TRIES_BEFORE_BLOCKING = 3;

/** The Assistant's model alias, which tracks the latest Sonnet, and its effort: a per-role setting User can raise. */
export const ASSISTANT_MODEL = 'sonnet';

export const ASSISTANT_EFFORT = 'medium' as const;

/** The pipeline agent's model and effort where the pipeline names none. */
export const PIPELINE_AGENT_MODEL = 'opus';

export const PIPELINE_AGENT_EFFORT = 'high' as const;

/** Every other role Hephaestus launches where the pipeline names no model and effort: builders, reviewers and the product owner. */
export const WORKER_MODEL = 'opus';

export const WORKER_EFFORT = 'medium' as const;

/** The newest `incident-*` log records an Assistant's first message carries, so the board is its memory. */
export const ASSISTANT_HISTORY_RECORDS = 20;

/** Tool calls one Assistant turn may make before Hephaestus interrupts it and the turn's open incidents default: a count. */
export const ASSISTANT_TURN_CALL_BUDGET = 40;

/** Context tokens of an Assistant's latest turn past which Hephaestus closes its input after the turn, for a fresh one. */
export const ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH = 200_000;

/** How long Talos lets a stopped session end before killing its process tree. */
export const SESSION_STOP_GRACE_MILLISECONDS = 5000;

/** How long Talos lets its agents go unsupervised: Hephaestus writes it into each start file, and specs pass short ones. */
export const SUPERVISION_LEASE_MILLISECONDS = 60_000;

/** Renewed from the main loop, and only while Hephaestus's passes make progress (`LeaseRenewal.ts`). */
export const LEASE_RENEWAL_INTERVAL_MILLISECONDS = 15_000;

/** How long a clean quit lets each agent reach the end of its turn before Talos stops what still runs. */
export const CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS = 10_000;

/** Every install, prepare and gate line, a sleep not counted; a merge carries no bound. */
export const LINE_TIME_BOUND_MILLISECONDS = 900_000;

export const TALOS_TICK_MILLISECONDS = 1000;

/**
 * Two ticks further apart than one tick plus this are a gap: a sleep, a suspension, or a clock that moved. The lease
 * renewal reads its own timer's gaps by the same allowance.
 */
export const TALOS_TICK_GAP_MILLISECONDS = 5000;

/** How long Hephaestus waits on Talos's answer to one frame, its first line included. */
export const TALOS_FRAME_TIMEOUT_MILLISECONDS = 2000;

/** How many times Hephaestus looks for a Talos it started to serve; a schedule only, never a decision. */
export const TALOS_START_TRIES = 40;

export const TALOS_START_INTERVAL_MILLISECONDS = 250;

/** Covers the clean quit's 10 seconds and its stop sweep at TALOS_START_INTERVAL_MILLISECONDS. */
export const TALOS_QUIT_TRIES = 60;

/** How often a line's run looks at its child's record for its end; a schedule only, never a decision. */
export const TALOS_LINE_LOOK_MILLISECONDS = 1000;

/** How many ports above `HEPHAESTUS_PORT_FIRST` a board's preferred Hephaestus port is spread over, and how far a busy port moves upward. */
export const HEPHAESTUS_PORT_COUNT = 100;

/** How many times `start` and `restart` look for the Hephaestus they started to answer; a schedule only, never a decision. */
export const HEPHAESTUS_READY_TRIES = 40;

export const HEPHAESTUS_READY_INTERVAL_MILLISECONDS = 250;

/** How long the code on disk may take to report its preflight before a restart is refused; real time, since a hung preflight must end. */
export const RESTART_PREFLIGHT_TIMEOUT_MILLISECONDS = 20_000;

/** How many times `restart` and `update` look for a restarted Hephaestus, which first finishes a landing in progress, to let go of the board. */
export const RESTART_RELEASE_TRIES = 600;

/** How long `restart` and `update` wait for the live Hephaestus to answer a restart, which it does once the preflight reported. */
export const RESTART_REQUEST_TIMEOUT_MILLISECONDS = 30_000;

/** How many times `stop` looks for the stopped Hephaestus's Hephaestus lock to be gone or dead before it reports Hephaestus still live. */
export const HEPHAESTUS_STOP_TRIES = 40;

export const HEPHAESTUS_STOP_INTERVAL_MILLISECONDS = 250;

/**
 * How long a stopping Hephaestus waits, all its waits together, before it records its stop and releases its lock anyway: under the 5 s Windows gives a
 * process after its console closes.
 */
export const HEPHAESTUS_STOP_WAIT_MILLISECONDS = 4000;

/** How long one request to a Hephaestus's API may take before the caller treats the API as not answering. */
export const HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS = 2000;

/**
 * How long a job stays interrupted after the API refused its call with 429 under API billing, which names no reset: Hephaestus
 * holds launches as for a usage limit, then resumes the job.
 */
export const API_RATE_LIMIT_BACKOFF_SECONDS = 60;

/** How often Hephaestus re-reads the board as a backstop for watch events the platform dropped; a schedule only, never a decision. */
export const HEPHAESTUS_SWEEP_SECONDS = 30;

/** How many gates the Hephaestus processes of this machine run at once, the rest queued; only the Hephaestus processes' own gate runs count. */
export const GATE_RUNS_AT_ONCE = 2;

/** How often a Hephaestus's in-process gate run looks for a free gate slot; a schedule only, never a decision. */
export const GATE_SLOT_RETRY_MILLISECONDS = 500;

/** How long Hephaestus lets a burst of file events settle before it wakes a pass. */
export const HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS = 150;

/** How long a verb's best-effort nudge may wait on Hephaestus after its write; Hephaestus's own watch notices the write anyway. */
export const HEPHAESTUS_NUDGE_TIMEOUT_MILLISECONDS = 500;

/** How often a Hephaestus event stream sends its `: ping` comment: under Bun's 10-second idle timeout, which closes a quiet stream. */
export const SSE_HEARTBEAT_SECONDS = 5;

/** How often a gate profile's output stream reads the run's output file for appended lines; a schedule only, never a decision. */
export const PROFILE_OUTPUT_FOLLOW_MILLISECONDS = 250;

/** The files of a job folder the API serves, as plain text under a sandbox CSP; every other file of the job folder is not served. */
export const SERVED_JOB_FILE_NAMES: readonly string[] = ['report.json', 'gate.log'];

/** The vendor API's limit for one image, which it measures on the base64 data a session is sent, not on the picture's bytes. */
export const PICTURE_ENCODED_SIZE_LIMIT_BYTES = 5_242_880;

/** The largest picture Hephaestus stores and sends a session: base64 makes four characters of every three bytes. */
export const PICTURE_SIZE_LIMIT_BYTES = Math.floor(PICTURE_ENCODED_SIZE_LIMIT_BYTES / 4) * 3;

/** The pictures one message or one intake request carries at most. */
export const PICTURES_PER_MESSAGE_LIMIT = 4;

/** The picture types Hephaestus stores, each known by its first bytes, never by a name or a header. */
export const ACCEPTED_PICTURE_MEDIA_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
