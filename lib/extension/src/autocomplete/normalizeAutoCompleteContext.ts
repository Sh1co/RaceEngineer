export function normalizeAutoCompleteContext({
  prefix,
  suffix,
}: {
  prefix: string;
  suffix: string;
}): { prefix: string; suffix: string } {
  const prefixLines = prefix.split("\n");
  const lastLineIndex = prefixLines.length - 1;
  const lastLine = prefixLines[lastLineIndex] ?? "";

  const prefixCursorMarkerMatch = lastLine.match(
    /^([ \t]*)(?:#|\/\/)\s*cursor here\b.*$/i
  );
  if (prefixCursorMarkerMatch != null) {
    prefixLines[lastLineIndex] = prefixCursorMarkerMatch[1] ?? "";
    prefix = prefixLines.join("\n");
  }

  suffix = suffix.replace(
    /^[ \t]*(?:#|\/\/)\s*cursor here\b[^\n]*\r?\n?/i,
    ""
  );

  return { prefix, suffix };
}

