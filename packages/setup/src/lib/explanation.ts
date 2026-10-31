/**
 * An explanation written as HTML, such as a badge's tooltip, as lines of plain text. Read with an inert parser and never
 * put into the page as HTML, as it holds what packages' manifests say.
 */

/**
 * The lines of an explanation.
 * @param html - The explanation
 * @returns Its lines, each trimmed, leaving out empty ones
 */
export function explanationLines(html: string): string[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  for (const element of body.querySelectorAll('script, style')) element.remove();
  // A line break, or the end of a block, ends a line.
  for (const element of body.querySelectorAll('br')) element.replaceWith('\n');
  for (const element of body.querySelectorAll('p, div, li')) element.append('\n');
  return body.textContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');
}
