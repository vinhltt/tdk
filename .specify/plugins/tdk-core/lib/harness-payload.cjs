'use strict';

/**
 * Canonical payload returned by every harness adapter.
 *
 * @typedef {Object} HarnessPayload
 * @property {'claude'|'omp'} harness
 * @property {string|null} sessionId
 * @property {string|null} transcriptPath
 * @property {string} cwd
 * @property {string|null} eventName
 * @property {string|null} prompt
 * @property {string|null} toolName
 * @property {Object|null} toolInput
 * @property {unknown} raw
 */

const SUPPORTED_HARNESSES = new Set(['claude', 'omp']);

function parsePayload(rawPayload) {
  const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Harness payload must be a JSON object');
  }
  return parsed;
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? null;
}
function canonicalToolName(...values) {
  const toolName = firstString(...values);
  return toolName ? toolName.toLowerCase() : null;
}

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function safeCall(receiver, methodName) {
  if (!receiver || typeof receiver[methodName] !== 'function') return null;
  try {
    return receiver[methodName]();
  } catch (_) {
    return null;
  }
}

/**
 * Load a Claude Code hook payload into the canonical shape.
 * Claude Code uses snake_case common fields; the camelCase aliases preserve
 * compatibility with older local fixtures and callers.
 *
 * @param {string|Object} rawPayload
 * @returns {HarnessPayload}
 */
function loadPayloadClaudeCodeHarness(rawPayload) {
  const payload = parsePayload(rawPayload);
  return {
    harness: 'claude',
    sessionId: firstString(payload.session_id, payload.sessionId),
    transcriptPath: firstString(payload.transcript_path, payload.transcriptPath),
    cwd: firstString(payload.cwd) ?? process.cwd(),
    eventName: firstString(payload.hook_event_name, payload.eventName),
    prompt: firstString(payload.prompt),
    toolName: canonicalToolName(payload.tool_name, payload.toolName),
    toolInput: objectOrNull(payload.tool_input ?? payload.toolInput),
    raw: payload,
  };
}

/**
 * Load an OMP hook event into the canonical shape.
 *
 * A serialized bridge envelope carries `{ event, context, eventName }`, with
 * session metadata materialized in context. Direct native calls read session
 * metadata only from the official OMP `context.sessionManager` contract.
 *
 * @param {string|Object} rawEventOrEnvelope
 * @param {Object} [context]
 * @returns {HarnessPayload}
 */
function loadPayloadOmpHarness(rawEventOrEnvelope, context) {
  const parsed = parsePayload(rawEventOrEnvelope);
  const isEnvelope = context === undefined && Object.prototype.hasOwnProperty.call(parsed, 'event');
  const event = objectOrNull(isEnvelope ? parsed.event : parsed) ?? {};
  const hookContext = isEnvelope ? objectOrNull(parsed.context) : context ?? null;
  const sessionManager = isEnvelope ? null : hookContext?.sessionManager;
  const sessionId = isEnvelope
    ? firstString(hookContext?.sessionId)
    : firstString(safeCall(sessionManager, 'getSessionId'));
  const sessionFile = isEnvelope
    ? firstString(hookContext?.sessionFile)
    : firstString(safeCall(sessionManager, 'getSessionFile'));
  const raw = isEnvelope ? parsed : { event: parsed, context: hookContext };

  return {
    harness: 'omp',
    sessionId,
    transcriptPath: sessionFile,
    cwd: firstString(hookContext?.cwd) ?? process.cwd(),
    eventName: firstString(isEnvelope ? parsed.eventName : event.type),
    prompt: firstString(event.prompt),
    toolName: canonicalToolName(event.toolName),
    toolInput: objectOrNull(event.input),
    raw,
  };
}

/**
 * Dispatch payload loading to the adapter for the selected harness.
 *
 * Harness selection is explicit. When omitted, TDK_HARNESS is honored and
 * otherwise Claude Code remains the backward-compatible default for the
 * existing standalone .cjs hooks.
 *
 * @param {string|Object} rawPayload
 * @param {'claude'|'omp'} [harness]
 * @param {Object} [context] Native harness context when the payload is not an envelope.
 * @returns {HarnessPayload}
 */
function loadPayloadHarness(rawPayload, harness = process.env.TDK_HARNESS || 'claude', context) {
  switch (harness) {
    case 'claude':
      return loadPayloadClaudeCodeHarness(rawPayload);
    case 'omp':
      return loadPayloadOmpHarness(rawPayload, context);
    default:
      throw new Error(`Unsupported harness "${harness}". Supported harnesses: claude, omp.`);
  }
}

module.exports = {
  SUPPORTED_HARNESSES,
  loadPayloadHarness,
  loadPayloadClaudeCodeHarness,
  loadPayloadOmpHarness,
};
