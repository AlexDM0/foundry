/**
 * `GET /diagram-frame/` and its script: page files, unversioned like `/`, served under the frame's own policy, a sandbox with scripts and no
 * origin of its own, which the page's policy never replaces. A refusal keeps the page's policy.
 */
import { diagramFrameContentSecurityPolicyFor }                        from '../../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { DIAGRAM_FRAME_PATH, pageFileAnswerFor, type PageFilesSource } from './PageFilesRoute.ts';

const SERVED_STATUS = 200;

export function isDiagramFramePath(pathname: string): boolean {
  return pathname.startsWith(DIAGRAM_FRAME_PATH);
}

export async function diagramFrameAnswerFor(diagramFrameFiles: PageFilesSource, pathname: string): Promise<Response> {
  const answer = await pageFileAnswerFor(diagramFrameFiles, pathname);
  if (answer.status === SERVED_STATUS) answer.headers.set('content-security-policy', diagramFrameContentSecurityPolicyFor());
  return answer;
}
