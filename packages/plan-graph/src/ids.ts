import { ulid } from "ulid";
import { z } from "zod";

/**
 * Stable node-ID scheme: `{kind}_{ulid}` (implementation-plan P1.1).
 * IDs are stable across versions — diffing, targeted invalidation, deep links,
 * and optimistic UI all key off them (ARCH §5.1).
 */
export const NODE_KINDS = [
  "concept",
  "stop",
  "day",
  "block",
  "meal",
  "stay",
  "leg",
  "line_item",
  "ledger",
  "risk",
  "pretrip",
  "packing",
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = (typeof NODE_KINDS)[number];

export type NodeId<K extends NodeKind = NodeKind> = `${K}_${string}`;

const ULID_PATTERN = "[0-9A-HJKMNP-TV-Z]{26}";

const KIND_ID_RE: Record<NodeKind, RegExp> = Object.fromEntries(
  NODE_KINDS.map((k) => [k, new RegExp(`^${k}_${ULID_PATTERN}$`)]),
) as Record<NodeKind, RegExp>;

export const ANY_NODE_ID_RE = new RegExp(`^(${NODE_KINDS.join("|")})_${ULID_PATTERN}$`);

/** ULID source is injectable so fixture generation can be deterministic. */
export type IdSource = () => string;

export function newNodeId<K extends NodeKind>(kind: K, uid: IdSource = ulid): NodeId<K> {
  return `${kind}_${uid()}`;
}

export function isNodeId(value: unknown): value is NodeId {
  return typeof value === "string" && ANY_NODE_ID_RE.test(value);
}

export function isNodeIdOf<K extends NodeKind>(kind: K, value: unknown): value is NodeId<K> {
  return typeof value === "string" && KIND_ID_RE[kind].test(value);
}

/** Extract the kind prefix from a node id, or null if malformed. */
export function kindOf(id: string): NodeKind | null {
  const match = ANY_NODE_ID_RE.exec(id);
  if (!match) return null;
  return match[1] as NodeKind;
}

/** Zod schema for a node id of a specific kind. */
export function nodeIdOf<K extends NodeKind>(kind: K): z.ZodType<NodeId<K>> {
  return z.custom<NodeId<K>>((v) => isNodeIdOf(kind, v), {
    message: `Expected a "${kind}_<ulid>" node id`,
  });
}

/** Zod schema for any node id. */
export const AnyNodeId: z.ZodType<NodeId> = z.custom<NodeId>((v) => isNodeId(v), {
  message: 'Expected a "{kind}_<ulid>" node id',
});
