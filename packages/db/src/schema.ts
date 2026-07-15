import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * Complete schema per ARCH §8.1 + Auth.js v5 adapter tables.
 * DETERMINISTIC PACKAGE: no LLM imports (CI rule no-llm-in-deterministic).
 * JSONB columns hold Zod-validated payloads — the app layer never writes
 * a graph/profile that fails its schema (ARCH §5.2).
 */

// ── enums ────────────────────────────────────────────────────────────────────
export const tripStatus = pgEnum("trip_status", ["draft", "generating", "active", "archived"]);
export const tripRole = pgEnum("trip_role", ["owner", "editor", "commenter", "viewer"]);
export const jobType = pgEnum("job_type", [
  "plan.generate",
  "plan.revise",
  "plan.export",
  "watch.price",
  "kb.ingest",
  "notify",
]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const sharePermission = pgEnum("share_permission", ["view", "comment"]);

// ── users & auth (Auth.js v5 drizzle-adapter shape, extended with locale) ────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── traveller profiles (versioned, provenance inside JSONB) ─────────────────
export const travellerProfiles = pgTable(
  "traveller_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** "me solo", "family mode" … */
    label: text("label").notNull().default("default"),
    profile: jsonb("profile").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("traveller_profiles_user_idx").on(t.userId)],
);

// ── trips & membership ───────────────────────────────────────────────────────
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nullable: anonymous sessions may own one trip pre-signup (ARCH §11). */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    anonymousSessionId: text("anonymous_session_id"),
    status: tripStatus("status").notNull().default("draft"),
    activeProfileVersion: integer("active_profile_version"),
    profileId: uuid("profile_id").references(() => travellerProfiles.id),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trips_owner_idx").on(t.ownerId)],
);

export const tripMembers = pgTable(
  "trip_members",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: tripRole("role").notNull().default("viewer"),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

// ── plan graphs (full graph per version + structural diff, ARCH §5.2) ───────
export const planGraphs = pgTable(
  "plan_graphs",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graph: jsonb("graph").notNull(),
    diff: jsonb("diff"),
    parentVersion: integer("parent_version"),
    jobId: text("job_id"),
    criticScore: real("critic_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.version] })],
);

// ── jobs (checkpointed pipeline runs, ARCH §6.2) ─────────────────────────────
export const jobs = pgTable(
  "jobs",
  {
    /** BullMQ job id (ULID assigned at enqueue). */
    id: text("id").primaryKey(),
    type: jobType("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    stateCheckpoint: jsonb("state_checkpoint"),
    tokenLedger: jsonb("token_ledger"),
    timings: jsonb("timings"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_trip_idx").on(t.tripId), index("jobs_status_idx").on(t.status)],
);

// ── intake & learning logs ───────────────────────────────────────────────────
export const clarifierLog = pgTable(
  "clarifier_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: jsonb("options"),
    answer: jsonb("answer"),
    askedBecause: text("asked_because"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clarifier_log_trip_idx").on(t.tripId)],
);

export const editsLog = pgTable(
  "edits_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    inferredProfileDelta: jsonb("inferred_profile_delta"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("edits_log_trip_idx").on(t.tripId)],
);

// ── India KB entities (ARCH §9; embeddings for hybrid retrieval) ────────────
export const kbEntities = pgTable(
  "kb_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    data: jsonb("data").notNull(),
    lastVerified: date("last_verified"),
    expiresAt: date("expires_at"),
    /** Gemini text-embedding dimensionality; chunk-level embeddings arrive in P2.6. */
    embedding: vector("embedding", { dimensions: 768 }),
    kbVersion: integer("kb_version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("kb_entities_kind_slug_idx").on(t.kind, t.slug),
    index("kb_entities_kind_idx").on(t.kind),
  ],
);

// ── provider response cache (ARCH §8.2 TTL policies) ─────────────────────────
export const providerCache = pgTable(
  "provider_cache",
  {
    provider: text("provider").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    ttlSeconds: integer("ttl_seconds").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.requestHash] })],
);

// ── price watches (table only at bootstrap; feature flagged off, P7.7) ──────
export const priceWatches = pgTable(
  "price_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    target: jsonb("target").notNull(),
    lastPrice: real("last_price"),
    threshold: real("threshold"),
    channel: text("channel").notNull().default("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_watches_user_idx").on(t.userId)],
);

// ── share links (scoped capabilities, ARCH §11) ──────────────────────────────
export const shareLinks = pgTable(
  "share_links",
  {
    token: text("token").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    permissions: sharePermission("permissions").notNull().default("view"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("share_links_trip_idx").on(t.tripId)],
);

// ── comments (per-block comments for shared plans, ARCH §11) ─────────────────
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }), // Nullable for anonymous/external
    authorName: text("author_name").notNull(),
    nodeRef: text("node_ref").notNull(), // e.g. "block_123"
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_trip_idx").on(t.tripId), index("comments_node_idx").on(t.nodeRef)],
);

// ── audit log (admin/KB actions, ARCH §11) ───────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  detail: jsonb("detail"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});
