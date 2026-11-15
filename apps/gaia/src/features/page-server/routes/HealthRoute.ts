/**
 * `GET /api/health`, open to any local caller: Gaia's health document, never cached. The launcher's probe and `serve` read it to find
 * Gaia on a port; the contract itself is `adapters/gaia-server/HealthDocument.ts`.
 */
import { healthDocumentOf, type ForgeCounts } from '../../../adapters/gaia-server/HealthDocument.ts';

export function healthAnswerOf(forgeCounts: ForgeCounts): Response {
  return Response.json(healthDocumentOf(forgeCounts), { headers: { 'cache-control': 'no-store' } });
}
