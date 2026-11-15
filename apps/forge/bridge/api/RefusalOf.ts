/**
 * The Overseer's worded refusal of an answer that is not a 200, which the Bridge shows verbatim: its `text` where the answer carries the
 * refusal's code beside its sentence, else the sentence in `refusal`; the status when the body holds neither.
 */
export async function refusalOf(response: Response): Promise<string> {
  try {
    const body = await response.json() as { refusal?: unknown; text?: unknown };
    if (typeof body.text === 'string') return body.text;
    return typeof body.refusal === 'string' ? body.refusal : String(response.status);
  } catch {
    return String(response.status);
  }
}
