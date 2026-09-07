# Log Format String Companion (VS Code)

Flags a log call whose placeholder count doesn't match its argument
count — SLF4J-style `{}` (Java/Kotlin) and Python `%`-style logging.
No data leaves your editor.

**v0.1, pilot.** Part of the Gap Hunter Labs VS Code workstream,
ported from the IntelliJ-family `log-format-string-companion`.

## What it does

Live in `.java`/`.kt`/`.py` files, on any `log.info(...)`/
`logger.warn(...)`/etc. call (receiver must be named `log` or
`logger`, exactly — not a substring match, so `catalog`/`dialog`
don't trip it):

- **SLF4J-style**: `log.info("User {} logged in from {}", userId,
  ipAddress)` — counts `{}` in the message, compares against the
  trailing arguments.
- **Python `%`-style**: `logger.info("User %s logged in", user_id)` —
  counts `%s`/`%d`/`%r`/etc. (never a literal `%%` escape).

**The SLF4J trailing-`Throwable` special case, ported faithfully:**
SLF4J treats a trailing `Throwable` argument as the exception to log,
not a placeholder argument — `log.error("Failed for {}", userId,
exception)` (1 placeholder, 2 arguments) is correct, never flagged.
An excess of exactly 1 argument is only flagged when its own syntax
makes it unambiguous that it can't be a `Throwable` (a string/number/
boolean literal) — an identifier or method call is left alone
(false negative preferred over false positive).

**Python f-strings are deliberately NOT scanned** (same as the
original): an f-string's interpolations are inline expressions, not
separate arguments, so there's no placeholder-count-vs-argument-count
mismatch to detect in this shape.

**v0.1 scope, honestly noted:** a message literal built by
concatenation/interpolation instead of a plain string constant is out
of scope — reliably counting placeholders needs a literal the scanner
can read directly.

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls, everything runs
against files already open in your editor.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
