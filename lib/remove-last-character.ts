/** Drops the last code point so a surrogate pair (emoji) is never split in half. */
export function removeLastCharacter(text: string): string {
  return Array.from(text).slice(0, -1).join("");
}
