/**
 * The first event of each board stream from forge 1.22, `GET /api/v2/events`, `/api/v1/jobs/<jobId>/stream` and
 * `/api/v1/profiles/<profileRunId>/stream`: `event: handshake` with no id, so it never moves a client's `Last-Event-ID`.
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

export interface BoardStreamHandshake {
  readonly systemVersion: SystemVersion;
}
