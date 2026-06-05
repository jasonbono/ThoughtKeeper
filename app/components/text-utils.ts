/** Preview the first N lines of text, capped at maxChars to handle long single-line paragraphs. */
export function truncateText(text: string, maxLines = 3, maxChars = 200): string {
  const lines = text.split("\n").slice(0, maxLines);
  let result = lines.join("\n");
  if (result.length > maxChars) {
    result = result.slice(0, maxChars).trimEnd() + "\u2026";
  } else if (result.length < text.length) {
    result += "\u2026";
  }
  return result;
}
