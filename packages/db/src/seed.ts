import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "./client.js";
import { travellerProfiles, trips, users } from "./schema.js";

/** Dev seed: one user, one profile, one draft trip. Idempotent via fixed email. */
export async function seed(databaseUrl: string): Promise<void> {
  const { db, pool } = createDb(databaseUrl);
  try {
    const [user] = await db
      .insert(users)
      .values({ email: "dev@raah.local", name: "Dev Traveller", locale: "en" })
      .onConflictDoUpdate({ target: users.email, set: { name: "Dev Traveller" } })
      .returning();
    if (!user) throw new Error("seed: user upsert returned nothing");

    const [profile] = await db
      .insert(travellerProfiles)
      .values({
        userId: user.id,
        label: "me solo",
        profile: {
          profile_version: 1,
          taste: { pace: 0.4, interests: { food: 5, architecture: 4 }, anti: ["crowds"] },
          provenance: {},
        },
      })
      .returning();

    await db.insert(trips).values({
      ownerId: user.id,
      profileId: profile?.id,
      status: "draft",
      title: "Seed: Rajasthan in December (dev fixture)",
    });

    console.log(`✔ seeded user ${user.email}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL ?? "postgres://raah:raah@localhost:5432/raah";
  seed(url)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
