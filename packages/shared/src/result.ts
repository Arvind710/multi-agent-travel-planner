/**
 * Typed Result + the repo-wide AppError taxonomy.
 * Domain/package code returns Results; apps translate to HTTP/tRPC errors at the edge.
 */
export type AppErrorCode =
  | "validation"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "provider_unavailable"
  | "budget_exceeded"
  | "internal";

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Machine-readable context (node ids, provider name, retry-after…). Never secrets. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export function appError(
  code: AppErrorCode,
  message: string,
  extra?: { details?: Record<string, unknown>; cause?: unknown },
): AppError {
  return { code, message, ...extra };
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Unwrap or throw — for boundaries where an error is genuinely unrecoverable. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(JSON.stringify(r.error));
}

export function mapResult<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Wrap a promise into a Result, converting throws into an AppError. */
export async function tryResult<T>(
  fn: () => Promise<T>,
  code: AppErrorCode = "internal",
): Promise<Result<T, AppError>> {
  try {
    return ok(await fn());
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(appError(code, message, { cause }));
  }
}
