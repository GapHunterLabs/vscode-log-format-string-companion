/**
 * Pure text scanner -- no `vscode` dependency. Ported from the
 * IntelliJ-family log-format-string-companion (LogFormatScanner +
 * LogSignalNames), already plain-text/regex analysis with zero PSI
 * dependency in the original -- targets Java, Kotlin, AND Python
 * source in one pass, same principle as sql-concatenation-companion.
 *
 * One call shape covers both placeholder conventions:
 * 1. SLF4J-style brace placeholders (Java/Kotlin):
 *    `log.info("User {} logged in from {}", userId, ipAddress)`.
 * 2. Python %-style logging: `logger.info("User %s logged in", user_id)`.
 *
 * Python f-strings are deliberately NOT scanned (same as the
 * original): an f-string's interpolations are inline expressions, not
 * separate arguments, so there's no placeholder-count-vs-argument-
 * count mismatch to detect in this shape.
 *
 * The SLF4J trailing-Throwable special case (critical, ported
 * verbatim): SLF4J treats a trailing Throwable argument as the
 * exception to log, not a placeholder argument -- an excess of
 * exactly 1 argument is the conventional shape and never flagged,
 * unless the last argument's syntax makes it unambiguous that it
 * can't be a Throwable (a string/number/boolean literal).
 */

export type LogFormatKind = 'SLF4J_BRACE_PLACEHOLDER' | 'PYTHON_PERCENT_STYLE';
export type MismatchKind = 'TOO_FEW_PLACEHOLDERS' | 'TOO_MANY_PLACEHOLDERS';

export interface Hit {
  kind: LogFormatKind;
  mismatchKind: MismatchKind;
  startOffset: number;
  endOffset: number;
  placeholderCount: number;
  argumentCount: number;
}

// Exact receiver identifier names (case-insensitive) that make a
// nearby .info(...)/.warn(...)/etc. call look like real logging, not
// an unrelated method that happens to share a name (a builder's
// .info(...), a notification service's .warn(...)). Matched as the
// whole identifier, not a substring.
const SIGNAL_RECEIVER_NAMES = new Set(['log', 'logger']);

export function looksLikeLoggerReceiverName(identifier: string): boolean {
  return SIGNAL_RECEIVER_NAMES.has(identifier.toLowerCase());
}

const STRING_LITERAL = `"(?:[^"\\\\]|\\\\.)*"`;
const LOG_CALL = new RegExp(
  `\\b([A-Za-z_][A-Za-z0-9_]*)\\s*\\.\\s*(trace|debug|info|warn|warning|error)\\s*\\(\\s*(${STRING_LITERAL})\\s*(,\\s*(?:[^()]|\\([^()]*\\))*)?\\)`,
  'gd',
);
const BRACE_PLACEHOLDER = /\{}/g;
const PERCENT_PLACEHOLDER = /(?<!%)%[sdrfxXoeEgG]/g;

function countMatches(regex: RegExp, text: string): number {
  return [...text.matchAll(regex)].length;
}

/** Splits a raw trailing-arguments string on top-level commas only --
 * a comma inside a nested call's parentheses (`foo(a, b)`) does not
 * split. */
function splitArguments(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];

  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(trimmed.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(trimmed.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** Best-effort, syntax-only check for the rare case where the last
 * argument's text makes it unambiguous that it cannot be a Throwable
 * -- a string/char/numeric/boolean literal. Anything else (an
 * identifier, a method call) is left alone: without real type
 * resolution there's no reliable way to tell a String variable from
 * an Exception variable by name alone -- false negative preferred
 * over false positive. */
function isDefinitelyNotThrowable(argumentText: string): boolean {
  const trimmed = argumentText.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return true;
  if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') return true;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return true;
  // A Java/Kotlin numeric literal with a type suffix (42L, 1.5f, 3.0d,
  // 100u, 100uL) -- Number() alone doesn't strip these.
  const withoutSuffix = trimmed.replace(/[LlFfDdUu]+$/, '');
  if (withoutSuffix !== '' && withoutSuffix !== trimmed && !Number.isNaN(Number(withoutSuffix))) return true;
  return false;
}

function classifyMismatch(placeholderCount: number, argumentCount: number, lastArgumentText: string | null): MismatchKind | null {
  if (placeholderCount === 0 && argumentCount === 0) return null;
  if (placeholderCount === argumentCount) return null;

  if (argumentCount > placeholderCount) {
    const excess = argumentCount - placeholderCount;
    if (excess === 1) {
      return lastArgumentText !== null && isDefinitelyNotThrowable(lastArgumentText) ? 'TOO_FEW_PLACEHOLDERS' : null;
    }
    return 'TOO_FEW_PLACEHOLDERS';
  }

  return 'TOO_MANY_PLACEHOLDERS';
}

export function scan(text: string): Hit[] {
  const results: Hit[] = [];

  for (const match of text.matchAll(LOG_CALL)) {
    const receiver = match[1];
    if (!looksLikeLoggerReceiverName(receiver)) continue;

    const literal = match[3];
    // @ts-expect-error -- `indices` exists at runtime with the 'd' flag; not in the default RegExpMatchArray type.
    const literalRange: [number, number] = match.indices[3];
    const argsRaw = (match[4] ?? '').replace(/^,/, '');
    const args = splitArguments(argsRaw);
    const argumentCount = args.length;

    const bracePlaceholders = countMatches(BRACE_PLACEHOLDER, literal);
    const percentPlaceholders = countMatches(PERCENT_PLACEHOLDER, literal);
    const lastArg = args.length > 0 ? args[args.length - 1] : null;

    let hit: Hit | null = null;
    if (bracePlaceholders > 0 && percentPlaceholders === 0) {
      const mismatch = classifyMismatch(bracePlaceholders, argumentCount, lastArg);
      if (mismatch) {
        hit = {
          kind: 'SLF4J_BRACE_PLACEHOLDER',
          mismatchKind: mismatch,
          startOffset: literalRange[0],
          endOffset: literalRange[1],
          placeholderCount: bracePlaceholders,
          argumentCount,
        };
      }
    } else if (percentPlaceholders > 0 && bracePlaceholders === 0) {
      const mismatch: MismatchKind | null =
        percentPlaceholders === argumentCount ? null : argumentCount > percentPlaceholders ? 'TOO_FEW_PLACEHOLDERS' : 'TOO_MANY_PLACEHOLDERS';
      if (mismatch) {
        hit = {
          kind: 'PYTHON_PERCENT_STYLE',
          mismatchKind: mismatch,
          startOffset: literalRange[0],
          endOffset: literalRange[1],
          placeholderCount: percentPlaceholders,
          argumentCount,
        };
      }
    } else if (bracePlaceholders === 0 && percentPlaceholders === 0) {
      const mismatch = classifyMismatch(0, argumentCount, lastArg);
      if (mismatch) {
        hit = {
          kind: 'SLF4J_BRACE_PLACEHOLDER',
          mismatchKind: mismatch,
          startOffset: literalRange[0],
          endOffset: literalRange[1],
          placeholderCount: 0,
          argumentCount,
        };
      }
    }

    if (hit) results.push(hit);
  }

  return results.sort((a, b) => a.startOffset - b.startOffset);
}
