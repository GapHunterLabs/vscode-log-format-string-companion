import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, looksLikeLoggerReceiverName } from '../scanner';

test('looksLikeLoggerReceiverName matches "log" and "logger" exactly', () => {
  assert.equal(looksLikeLoggerReceiverName('log'), true);
  assert.equal(looksLikeLoggerReceiverName('logger'), true);
  assert.equal(looksLikeLoggerReceiverName('Logger'), true);
});

test('looksLikeLoggerReceiverName does not match a substring containing "log"', () => {
  assert.equal(looksLikeLoggerReceiverName('catalog'), false);
  assert.equal(looksLikeLoggerReceiverName('dialog'), false);
});

test('scan flags SLF4J too-many-placeholders (more {} than arguments)', () => {
  const hits = scan('log.info("User {} logged in from {}", userId);');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'SLF4J_BRACE_PLACEHOLDER');
  assert.equal(hits[0].mismatchKind, 'TOO_MANY_PLACEHOLDERS');
  assert.equal(hits[0].placeholderCount, 2);
  assert.equal(hits[0].argumentCount, 1);
});

test('scan flags SLF4J too-few-placeholders (excess of 2+ arguments, not the Throwable-exempt case)', () => {
  const hits = scan('logger.warn("User {}", userId, ip, extra);');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mismatchKind, 'TOO_FEW_PLACEHOLDERS');
  assert.equal(hits[0].placeholderCount, 1);
  assert.equal(hits[0].argumentCount, 3);
});

test('scan does not flag an exact placeholder/argument match', () => {
  const hits = scan('log.info("User {} logged in from {}", userId, ip);');
  assert.equal(hits.length, 0);
});

test('scan does not flag zero placeholders and zero arguments', () => {
  const hits = scan('log.info("Server started");');
  assert.equal(hits.length, 0);
});

test('scan does not flag the conventional SLF4J trailing-Throwable shape', () => {
  const hits = scan('log.error("Failed for {}", userId, exception);');
  assert.equal(hits.length, 0);
});

test('scan flags a trailing argument that syntactically cannot be a Throwable', () => {
  const hits = scan('log.error("Failed for {}", userId, "unexpected-string");');
  assert.equal(hits.length, 1);
});

test('scan ignores a call on a receiver that does not look like a logger', () => {
  const hits = scan('builder.info("User {} logged in from {}", userId);');
  assert.equal(hits.length, 0);
});

test('scan flags Python %-style too-few-placeholders', () => {
  const hits = scan('logger.info("User %s logged in from %s", user_id)');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'PYTHON_PERCENT_STYLE');
});

test('scan does not flag a matching Python %-style call', () => {
  const hits = scan('logger.info("User %s logged in from %s", user_id, ip)');
  assert.equal(hits.length, 0);
});

test('scan does not flag a Python %-style call with excess argument (no Throwable exemption)', () => {
  const hits = scan('logger.info("User %s", user_id, extra)');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mismatchKind, 'TOO_FEW_PLACEHOLDERS');
});

test('scan does not double-count a literal %% escape as a placeholder', () => {
  const hits = scan('log.info("Progress: 100%% done")');
  assert.equal(hits.length, 0);
});
