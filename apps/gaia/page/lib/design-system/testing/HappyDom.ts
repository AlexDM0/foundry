/**
 * The DOM preload for the package's `.dom.tsx` specs alone: registering happy-dom replaces `fetch` and the other globals for every spec in
 * the run, so it is never a preload of the main `bun test` run. `testing/RunDomSpecs.ts` passes it with `--preload`.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost/' });

/**
 * Bun prints a node in a failed assertion by walking all it reaches, document and window included: up to seconds of CPU a print, which under
 * load outlasts a waitFor's whole bound and, in a large tree, stalls a run for minutes. The node's opening tag names it as well.
 */
function openingTagOf(node: Node): string {
  if (!(node instanceof Element)) return node.nodeName;
  const attributes = [...node.attributes].map((attribute) => ` ${attribute.name}="${attribute.value}"`).join('');
  return `<${node.localName}${attributes}>`;
}

Object.defineProperty(Node.prototype, Bun.inspect.custom, {
  configurable: true,
  value(this: Node) {
    return openingTagOf(this);
  },
});
