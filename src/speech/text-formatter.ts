/**
 * Text formatter for VoiceFlow AI
 * Cleans up spoken punctuation, ensures proper capitalization and spacing.
 */

export interface FormatterOptions {
  autoPunctuation?: boolean;
  autoCapitalize?: boolean;
}

export function formatTranscript(rawText: string, options: FormatterOptions = {}): string {
  if (!rawText) return '';

  let text = rawText.trim();

  if (options.autoPunctuation !== false) {
    // Replace verbal punctuation commands with actual symbols
    // Use word boundaries so words like 'periodic' are not replaced
    text = text
      .replace(/\b(period|full stop)\b/gi, '.')
      .replace(/\b(comma)\b/gi, ',')
      .replace(/\b(question mark)\b/gi, '?')
      .replace(/\b(exclamation (point|mark))\b/gi, '!')
      .replace(/\b(colon)\b/gi, ':')
      .replace(/\b(semicolon)\b/gi, ';')
      .replace(/\b(new line|newline)\b/gi, '\n')
      .replace(/\b(new paragraph)\b/gi, '\n\n')
      .replace(/\b(hyphen|dash)\b/gi, ' - ')
      .replace(/\b(open quote)\b/gi, ' "')
      .replace(/\b(close quote)\b/gi, '" ');

    // Clean up spaces before punctuation (e.g. "hello ." -> "hello.")
    text = text
      .replace(/\s+([.,!?:;])/g, '$1')
      // Ensure one space after punctuation unless followed by newline or already spaced
      .replace(/([.,!?:;])([^\s\d\n"'])/g, '$1 $2')
      // Clean up multiple spaces
      .replace(/[ \t]{2,}/g, ' ');
  }

  if (options.autoCapitalize !== false) {
    // Capitalize first character
    text = text.replace(/^([a-z])/, (match) => match.toUpperCase());

    // Capitalize after sentence-ending punctuation + whitespace
    text = text.replace(/([.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());

    // Capitalize after newlines
    text = text.replace(/(\n+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());

    // Capitalize standalone "i" -> "I"
    text = text.replace(/\b(i)\b/g, 'I');
  }

  return text;
}
