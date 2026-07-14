import { context, propagation, trace, type Context } from "@opentelemetry/api";

/**
 * Trace propagation through BullMQ (P0.14): the enqueue side injects W3C trace
 * context into the job payload; the worker extracts it so one trace spans
 * api → queue → worker → agents (ARCH §14.1: one trace per plan job).
 */
export const TRACE_FIELD = "__traceContext" as const;

export function injectTraceContext<T extends Record<string, unknown>>(
  payload: T,
): T & { [TRACE_FIELD]?: Record<string, string> } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return Object.keys(carrier).length > 0 ? { ...payload, [TRACE_FIELD]: carrier } : payload;
}

export function extractTraceContext(payload: Record<string, unknown>): Context {
  const carrier = payload[TRACE_FIELD];
  if (carrier && typeof carrier === "object") {
    return propagation.extract(context.active(), carrier as Record<string, string>);
  }
  return context.active();
}

/** pino mixin: correlate every log line with the active trace. */
export function traceLogMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}
