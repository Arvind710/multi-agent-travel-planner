import { z } from "zod";

/** Common provenance required for every KB fact (ARCH §9.1). */
export const EntityMetaSchema = z.object({
  last_verified: z.iso.date(),
  verified_by: z.string().min(1),
  expires_at: z.iso.date(),
  sources: z.array(z.url()).min(1),
});

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const EntityBase = z.object({ slug, name: z.string().min(1), meta: EntityMetaSchema });
const month = z.int().min(1).max(12);

export const RegionSchema = EntityBase.extend({
  kind: z.literal("region"),
  country: z.literal("IN"),
  climate_ref: slug,
  road_realism_ref: slug.optional(),
});
export const MonumentSchema = EntityBase.extend({
  kind: z.literal("monument"),
  region: slug,
  closed_weekdays: z.array(z.int().min(1).max(7)).default([]),
  closed_dates: z.array(z.iso.date()).default([]),
  fees: z
    .object({
      domestic_inr: z.number().nonnegative().optional(),
      international_inr: z.number().nonnegative().optional(),
    })
    .optional(),
  dress: z.string().optional(),
  best_time: z.string().optional(),
});
export const ParkSchema = EntityBase.extend({
  kind: z.literal("park"),
  region: slug,
  closed_months: z.array(month).default([]),
  booking_window_days: z.int().positive().optional(),
});
export const FestivalSchema = EntityBase.extend({
  kind: z.literal("festival"),
  dates_by_year: z.record(z.string(), z.object({ start: z.iso.date(), end: z.iso.date() })),
  surge_factor: z.number().min(1),
  impact_radius_km: z.number().nonnegative(),
  regions: z.array(slug).default([]),
});
export const PermitSchema = EntityBase.extend({
  kind: z.literal("permit"),
  regions: z.array(slug).min(1),
  applies_to: z.enum(["all", "foreign"]),
  lead_time_days: z.int().nonnegative(),
  channel: z.string().min(1),
});
export const RailRouteSchema = EntityBase.extend({
  kind: z.literal("rail-route"),
  from: slug,
  to: slug,
  booking_window_days: z.int().positive().default(60),
  tatkal_days_before: z.int().positive().default(1),
  waitlist_note: z.string().optional(),
});
export const FoodAtlasSchema = EntityBase.extend({
  kind: z.literal("food-atlas"),
  region: slug,
  dishes: z.array(z.string()).min(1),
  venues: z
    .array(
      z.object({
        name: z.string(),
        locality: z.string().optional(),
        hygiene_tier: z.enum(["high", "medium", "adventurous"]).optional(),
      }),
    )
    .default([]),
});
export const CraftClusterSchema = EntityBase.extend({
  kind: z.literal("craft-cluster"),
  region: slug,
  place: z.string(),
  crafts: z.array(z.string()).min(1),
  ethics_note: z.string().optional(),
});
export const SafetyNoteSchema = EntityBase.extend({
  kind: z.literal("safety-note"),
  region: slug,
  city: z.string(),
  arrival_guidance: z.string(),
  notes: z.array(z.string()).default([]),
});
export const RoadRealismSchema = EntityBase.extend({
  kind: z.literal("road-realism"),
  terrain: z.string(),
  effective_kmph: z.number().positive(),
  regions: z.array(slug).min(1),
});
export const ClimateCalendarSchema = EntityBase.extend({
  kind: z.literal("climate-calendar"),
  region: slug.optional(),
  months: z
    .record(z.coerce.number().pipe(month), z.enum(["good", "shoulder", "avoid", "closed"]))
    .optional(),
  coverage: z
    .record(
      slug,
      z.record(z.coerce.number().pipe(month), z.enum(["good", "shoulder", "avoid", "closed"])),
    )
    .optional(),
  nuance: z.string().optional(),
}).refine(
  (value) => value.region !== undefined || value.coverage !== undefined,
  "A climate calendar needs region or coverage",
);
export const AltitudeSchema = EntityBase.extend({
  kind: z.literal("altitude"),
  place: z.string(),
  sleeping_altitude_m: z.number().nonnegative(),
  region: slug,
});

export const EntitySchema = z.discriminatedUnion("kind", [
  RegionSchema,
  MonumentSchema,
  ParkSchema,
  FestivalSchema,
  PermitSchema,
  RailRouteSchema,
  FoodAtlasSchema,
  CraftClusterSchema,
  SafetyNoteSchema,
  RoadRealismSchema,
  ClimateCalendarSchema,
  AltitudeSchema,
]);
export type KbEntity = z.infer<typeof EntitySchema>;
export type KbEntityKind = KbEntity["kind"];

/** JSON Schema is useful to editors/content CI without importing application code. */
export const KbEntityJsonSchema = z.toJSONSchema(EntitySchema);
export const schemas = {
  region: RegionSchema,
  monument: MonumentSchema,
  park: ParkSchema,
  festival: FestivalSchema,
  permit: PermitSchema,
  "rail-route": RailRouteSchema,
  "food-atlas": FoodAtlasSchema,
  "craft-cluster": CraftClusterSchema,
  "safety-note": SafetyNoteSchema,
  "road-realism": RoadRealismSchema,
  "climate-calendar": ClimateCalendarSchema,
  altitude: AltitudeSchema,
} as const;
