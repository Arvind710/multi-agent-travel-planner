import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { parse } from "yaml";
import { EntitySchema, type KbEntity } from "./schemas";

export interface ContentIssue {
  file: string;
  message: string;
}
export interface ContentValidation {
  entities: KbEntity[];
  issues: ContentIssue[];
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory() ? filesUnder(resolve(dir, entry.name)) : [resolve(dir, entry.name)],
    ),
  );
  return nested.flat().filter((file) => [".yaml", ".yml"].includes(extname(file)));
}

export async function validateContent(contentRoot: string): Promise<ContentValidation> {
  const entities: KbEntity[] = [];
  const issues: ContentIssue[] = [];
  let files: string[] = [];
  try {
    files = await filesUnder(contentRoot);
  } catch {
    return {
      entities,
      issues: [{ file: contentRoot, message: "content directory does not exist" }],
    };
  }
  for (const file of files.filter((f) => !f.includes("/drafts/"))) {
    const parsed = EntitySchema.safeParse(parse(await readFile(file, "utf8")));
    if (parsed.success) entities.push(parsed.data);
    else
      issues.push({
        file: relative(contentRoot, file),
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
  }
  const byKindSlug = new Map<string, KbEntity>();
  for (const entity of entities) {
    const key = `${entity.kind}:${entity.slug}`;
    if (byKindSlug.has(key)) issues.push({ file: entity.slug, message: `duplicate entity ${key}` });
    byKindSlug.set(key, entity);
    if (entity.meta.expires_at < entity.meta.last_verified)
      issues.push({ file: entity.slug, message: "expires_at must not precede last_verified" });
  }
  const regions = new Set(entities.filter((e) => e.kind === "region").map((e) => e.slug));
  for (const entity of entities) {
    const refs =
      "region" in entity && typeof entity.region === "string"
        ? [entity.region]
        : "regions" in entity
          ? entity.regions
          : [];
    for (const region of refs)
      if (!regions.has(region))
        issues.push({ file: entity.slug, message: `unknown region reference: ${region}` });
  }
  return { entities, issues };
}
