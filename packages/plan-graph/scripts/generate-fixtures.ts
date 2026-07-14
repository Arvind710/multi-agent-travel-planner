import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGoldenKerala7d, buildGoldenRajasthan14d } from "../src/testing/fixtures";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(outDir, { recursive: true });

const fixtures = {
  "golden-rajasthan-14d.json": buildGoldenRajasthan14d(),
  "golden-kerala-7d.json": buildGoldenKerala7d(),
};

for (const [file, graph] of Object.entries(fixtures)) {
  writeFileSync(path.join(outDir, file), `${JSON.stringify(graph, null, 2)}\n`);
  console.log(`wrote fixtures/${file}`);
}
