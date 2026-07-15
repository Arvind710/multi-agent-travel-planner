import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph } from "@raah/plan-graph/testing";
import { runRules } from "@raah/constraints";
import { seasonWindowRule } from "@raah/constraints";
import { emptyProfile } from "@raah/shared/profile";
import { ingest, KnowledgeBase } from "./index";

const root = resolve(process.cwd(), "../../content/kb");

describe("KnowledgeBase", () => {
  it("loads reviewed content and returns deterministic closure facts", async () => {
    const kb = await KnowledgeBase.fromContent(root, new Date("2026-07-15"));
    expect(kb.monument("taj-mahal")?.closed_weekdays).toEqual([5]);
    expect(kb.permitsFor("sikkim-north", "IN")).toEqual([]);
    expect(kb.permitsFor("sikkim-north", "GB")).toHaveLength(1);
  });

  it("marks expired records stale and ranks curation searches", async () => {
    const kb = await KnowledgeBase.fromContent(root, new Date("2027-02-01"));
    expect(kb.lookup("monument", "taj-mahal")?.stale).toBe(true);
    expect(kb.search("block printing workshop", { kind: "craft-cluster" })[0]?.entity.slug).toBe(
      "bagru-block-printing",
    );
  });

  it("supplies real content to the deterministic constraint gate", async () => {
    const kb = await KnowledgeBase.fromContent(root);
    const graph = buildGraph({
      start: "2026-01-10",
      stops: [{ name: "Leh", region: "ladakh", nights: 2 }],
    });
    expect(runRules({ graph, profile: emptyProfile(), kb }, [seasonWindowRule]).pass).toBe(false);
  });

  it("ingests idempotently and advances the retrieval version", async () => {
    const kb = await KnowledgeBase.fromContent(root);
    const records = new Map<string, string>();
    let version = 0;
    const store = {
      upsert: async (record: { kind: string; slug: string; data: unknown }) => {
        const key = `${record.kind}:${record.slug}`;
        const previous = records.get(key);
        const value = JSON.stringify(record.data);
        records.set(key, value);
        return previous === undefined ? "created" : previous === value ? "unchanged" : "updated";
      },
      bumpVersion: async () => ++version,
    };
    const first = await ingest(kb.entities, store);
    const second = await ingest(kb.entities, store);
    expect(first.created).toHaveLength(kb.entities.length);
    expect(second.unchanged).toHaveLength(kb.entities.length);
    expect(second.kbVersion).toBe(2);
  });
});
