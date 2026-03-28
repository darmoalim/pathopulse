import Database from "better-sqlite3";
import * as path from "path";

const dbPath = path.join(process.cwd(), "sqlite.db");
const sqlite = new Database(dbPath);

console.log("🚀 Patching structural geocoding for 'Channapora/Natipora'...");

// We inject the explicit JSON bounding points so Leaflet can stretch across them
const locs = [
  { name: "Channapora", lat: 34.03976, lng: 74.811241 },
  { name: "Natipora",   lat: 34.04500, lng: 74.814500 }
];

const res = sqlite.prepare("UPDATE zones SET locations_json = ? WHERE name LIKE '%Channapora%' OR name LIKE '%Natipora%'").run(JSON.stringify(locs));

console.log(`✅ Update complete! Rows modified: ${res.changes}`);
