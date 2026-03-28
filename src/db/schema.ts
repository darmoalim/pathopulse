import {
  sqliteTable, text, integer, real, index
} from "drizzle-orm/sqlite-core";

// ── Districts (J&K Top-Level Administrative Units) ─────────────────
export const districts = sqliteTable("districts", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  name:      text("name").notNull(),
  division:  text("division").notNull(), // Kashmir / Jammu / Ladakh
  latitude:  real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  population: integer("population"),
  created_at: text("created_at"),
});

// ── ASHA Workers / Field Officers ─────────────────────────────────
export const asha_workers = sqliteTable("asha_workers", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  name:        text("name").notNull(),
  worker_id:   text("worker_id").notNull().unique(), // govt employee ID
  district_id: integer("district_id").references(() => districts.id),
  zone_id:     integer("zone_id"),               // assigned zone
  phone:       text("phone"),
  active:      integer("active", { mode: "boolean" }).default(true),
  joined_at:   text("joined_at"),
});

// ── Labs ──────────────────────────────────────────────────────────
export const labs = sqliteTable("labs", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  name:        text("name").notNull(),
  code:        text("code").notNull().unique(),  // e.g. "SKIMS-MB"
  district_id: integer("district_id").references(() => districts.id),
  type:        text("type").notNull(),  // RTPCR | WGS | Serology | Culture
  capacity:    integer("capacity"),    // tests/day
  active:      integer("active", { mode: "boolean" }).default(true),
  address:     text("address"),
});

// ── Zones (Sub-areas: villages, wards, tehsils) ──────────────────
export const zones = sqliteTable("zones", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  district_id: integer("district_id").notNull().references(() => districts.id),
  name:        text("name").notNull(),
  type:        text("type").notNull(), // Ward | Village | Tehsil | Block | Urban
  latitude:    real("latitude"),
  longitude:   real("longitude"),
  locations_json: text("locations_json"), // Stores JSON array: [{lat, lng}, {lat, lng}]
  population:  integer("population"),
  asha_count:  integer("asha_count").default(0), // active workers in zone
  created_at:  text("created_at"),
}, (t) => [index("zones_district_idx").on(t.district_id)]);

// ── Outbreaks (Active disease situations per zone) ─────────────────
export const outbreaks = sqliteTable("outbreaks", {
  id:              integer("id").primaryKey({ autoIncrement: true }),
  zone_id:         integer("zone_id").notNull().references(() => zones.id),
  district_id:     integer("district_id").notNull().references(() => districts.id),
  disease:         text("disease").notNull(),
  variant:         text("variant"),
  resistance:      text("resistance"),
  status:          text("status").notNull().default("active"), // active | contained | resolved
  sequenced:       integer("sequenced", { mode: "boolean" }).default(false),
  priority_score:  integer("priority_score").default(0),
  previous_score:  integer("previous_score").default(0),
  total_cases:     integer("total_cases").default(0),
  active_cases:    integer("active_cases").default(0),
  deaths:          integer("deaths").default(0),
  hospitalized:    integer("hospitalized").default(0),
  recovered:       integer("recovered").default(0),
  lab_id:          integer("lab_id").references(() => labs.id), // primary processing lab
  first_reported:  text("first_reported"),
  last_updated:    text("last_updated"),
}, (t) => [
  index("outbreaks_zone_idx").on(t.zone_id),
  index("outbreaks_district_idx").on(t.district_id),
]);

// ── Report Submissions (Full audit trail of every field report) ───
export const report_submissions = sqliteTable("report_submissions", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  outbreak_id:  integer("outbreak_id").notNull().references(() => outbreaks.id),
  zone_id:      integer("zone_id").notNull().references(() => zones.id),
  worker_id:    integer("worker_id").references(() => asha_workers.id),
  worker_name:  text("worker_name"),         // denormalized for speed
  new_cases:    integer("new_cases").default(0),
  deaths:       integer("deaths").default(0),
  hospitalized: integer("hospitalized").default(0),
  recovered:    integer("recovered").default(0),
  lab_id:       integer("lab_id").references(() => labs.id),
  sample_status: text("sample_status"),      // pending | in_lab | results_ready | sequenced
  severity:     text("severity"),            // mild | moderate | severe
  notes:        text("notes"),
  location_accuracy: text("location_accuracy"), // GPS | manual | approximate
  submitted_at: text("submitted_at"),
}, (t) => [
  index("sub_outbreak_idx").on(t.outbreak_id),
  index("sub_zone_idx").on(t.zone_id),
]);

// ── LEGACY: Keep for backwards compatibility during migration ──────
export const regions = sqliteTable("regions", {
  id:              integer("id").primaryKey({ autoIncrement: true }),
  region:          text("region").notNull(),
  country:         text("country").notNull(),
  latitude:        real("latitude").notNull(),
  longitude:       real("longitude").notNull(),
  sequenced:       integer("sequenced", { mode: "boolean" }).notNull(),
  disease:         text("disease"),
  variant:         text("variant"),
  resistance:      text("resistance"),
  symptom_reports: integer("symptom_reports").default(0),
  priority_score:  integer("priority_score").default(0),
  previous_score:  integer("previous_score").default(0),
  notes:           text("notes"),
  updated_at:      text("updated_at"),
});
