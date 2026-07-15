import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { validateContent } from "./content";

const root = resolve(process.cwd(), "../../content/kb");
const [command, kind, ...nameParts] = process.argv.slice(2);
if (command === "validate") {
  const result = await validateContent(root);
  if (result.issues.length) {
    console.error(result.issues.map((i) => `${i.file}: ${i.message}`).join("\n"));
    process.exitCode = 1;
  } else console.log(`KB valid: ${result.entities.length} entities`);
} else if (command === "draft" && kind && nameParts.length) {
  const name = nameParts.join(" ");
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const path = resolve(root, "drafts", `${slug}.yaml`);
  await mkdir(resolve(root, "drafts"), { recursive: true });
  await writeFile(
    path,
    stringify({
      kind,
      slug,
      name,
      meta: {
        last_verified: "REQUIRED",
        verified_by: "REQUIRED",
        expires_at: "REQUIRED",
        sources: ["REQUIRED: source URL for every factual claim"],
      },
      review_checklist: [
        "Verify every factual field on an official source.",
        "For taste entities, record at least two corroborating sources.",
        "Set verification dates, then move this file out of drafts before committing.",
      ],
    }),
  );
  console.log(
    `Draft created: ${path}\nDrafts are candidates only; human verification is required before promotion.`,
  );
} else {
  console.error("Usage: pnpm kb:validate | pnpm kb:draft <kind> <name>");
  process.exitCode = 1;
}
