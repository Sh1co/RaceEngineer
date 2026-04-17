const CONTROL_TOKENS = [
  "<\uFF5Cfim\u2581begin\uFF5C>",
  "<\uFF5Cfim\u2581hole\uFF5C>",
  "<\uFF5Cfim\u2581end\uFF5C>",
  "<|fim_prefix|>",
  "<|fim_suffix|>",
  "<|fim_middle|>",
  "<fim_prefix>",
  "<fim_suffix>",
  "<fim_middle>",
  "<PRE>",
  "<SUF>",
  "<MID>",
  "<END>",
  "EOT",
  "<|endoftext|>",
];

const KNOWN_PLACEHOLDER_PATTERNS = [
  /^["'`]?obj\[\s*["'](?:middle_code|SUF|PRE|MID|prefix|suffix|fim_prefix|fim_suffix|fim_middle)["']\s*\]["'`]?;?$/i,
];

function stripControlTokens(text: string): string {
  return CONTROL_TOKENS.reduce(
    (result, token) => result.split(token).join(""),
    text
  );
}

function tryExtractFirstCodeBlock(text: string): string {
  const codeBlockMatch = text.match(/```[^\n]*\n([\s\S]*?)```/);
  return codeBlockMatch?.[1] ?? text;
}

function stripKnownAdditionalContextPrefix(text: string): string {
  return text.replace(
    /^(?:[ \t]*(?:#|\/\/)\s*(?:Language|File uri):.*\r?\n)+/i,
    ""
  );
}

function removeLeadingPrefixOverlap(text: string, prefix: string): string {
  if (prefix.length === 0 || text.length === 0) {
    return text;
  }

  const maxOverlap = Math.min(prefix.length, text.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const prefixTail = prefix.slice(-overlap);
    if (text.startsWith(prefixTail)) {
      return text.slice(overlap);
    }
  }

  return text;
}

function removeTrailingSuffixOverlap(text: string, suffix: string): string {
  if (suffix.length === 0 || text.length === 0) {
    return text;
  }

  const fullSuffixIndex = text.indexOf(suffix);
  const withoutFullSuffix =
    fullSuffixIndex >= 0 ? text.slice(0, fullSuffixIndex) : text;

  const maxOverlap = Math.min(withoutFullSuffix.length, suffix.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const suffixHead = suffix.slice(0, overlap);
    if (withoutFullSuffix.endsWith(suffixHead)) {
      return withoutFullSuffix.slice(0, -overlap);
    }
  }

  return withoutFullSuffix;
}

function getTrailingIndent(prefix: string): string {
  const match = prefix.match(/(?:^|\n)([ \t]*)$/);
  return match?.[1] ?? "";
}

function truncateAtLikelyTopLevelTail(text: string, prefix: string): string {
  const trailingIndent = getTrailingIndent(prefix);
  if (trailingIndent.length > 0) {
    const genericTopLevelMarker = text.match(/\n\n(?=[^\s])/);
    if (genericTopLevelMarker?.index != null) {
      return text.slice(0, genericTopLevelMarker.index);
    }
  }

  const marker = text.match(
    /\n\n(?=(?:#|\/\/|def\s|class\s|function\s|if __name__|In the ))/i
  );
  if (marker?.index == null) {
    return text;
  }

  return text.slice(0, marker.index);
}

export function sanitizeAutoCompleteResponse(
  response: string,
  {
    prefix = "",
    suffix = "",
  }: {
    prefix?: string;
    suffix?: string;
  } = {}
): string {
  const withoutControlTokens = stripControlTokens(response);
  const codeLikeResponse = tryExtractFirstCodeBlock(withoutControlTokens);
  const withoutKnownContextPrefix =
    stripKnownAdditionalContextPrefix(codeLikeResponse);
  const withoutPrefix = removeLeadingPrefixOverlap(
    withoutKnownContextPrefix,
    prefix
  );
  const withoutSuffix = removeTrailingSuffixOverlap(withoutPrefix, suffix);
  const withoutTail = truncateAtLikelyTopLevelTail(withoutSuffix, prefix);
  const result = withoutTail.trim();

  if (
    KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(result))
  ) {
    return "";
  }

  return result;
}
