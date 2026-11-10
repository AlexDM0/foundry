/** The Overseer's worded refusal of an answer that is not a 200, which the Bridge shows verbatim; the status when the body holds none. */
export async function refusalOf(response: Response): Promise<string> {
  try {
    const body = await response.json() as { refusal?: unknown };
    return typeof body.refusal === 'string' ? body.refusal : String(response.status);
  } catch {
    return String(response.status);
  }
}
