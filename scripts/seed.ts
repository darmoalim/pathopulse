import Database from "better-sqlite3";
import * as path from "path";
import * as xlsx from "xlsx";
import * as fs from "fs";

const dbPath = path.join(process.cwd(), "sqlite.db");
const sqlite = new Database(dbPath);

const DATA_DIR = path.join(process.cwd(), "Data of J&K");

// Approximate District Center Coordinates for J&K
// (Since official data lacks gps)
const DISTRICT_COORDS: Record<string, { lat: number, lng: number, div: string }> = {
  "Srinagar":   { lat: 34.0837, lng: 74.7973, div: "Kashmir" },
  "Baramulla":  { lat: 34.2000, lng: 74.3333, div: "Kashmir" },
  "Kupwara":    { lat: 34.5262, lng: 74.2546, div: "Kashmir" },
  "Anantnag":   { lat: 33.7311, lng: 75.1487, div: "Kashmir" },
  "Shopian":    { lat: 33.7202, lng: 74.8346, div: "Kashmir" },
  "Kulgam":     { lat: 33.6444, lng: 75.0118, div: "Kashmir" },
  "Budgam":     { lat: 34.0167, lng: 74.7167, div: "Kashmir" },
  "Bandipora":  { lat: 34.4217, lng: 74.6366, div: "Kashmir" },
  "Ganderbal":  { lat: 34.2273, lng: 74.7788, div: "Kashmir" },
  "Pulwama":    { lat: 33.8745, lng: 74.8990, div: "Kashmir" },
  "Jammu":      { lat: 32.7266, lng: 74.8570, div: "Jammu" },
  "Kathua":     { lat: 32.3833, lng: 75.5167, div: "Jammu" },
  "Poonch":     { lat: 33.7667, lng: 74.0833, div: "Jammu" },
  "Doda":       { lat: 33.1444, lng: 75.5462, div: "Jammu" },
  "Kishtwar":   { lat: 33.3167, lng: 75.7667, div: "Jammu" },
  "Ramban":     { lat: 33.2423, lng: 75.2443, div: "Jammu" },
  "Reasi":      { lat: 33.0833, lng: 74.8333, div: "Jammu" },
  "Rajouri":    { lat: 33.3800, lng: 74.3100, div: "Jammu" },
  "Samba":      { lat: 32.5600, lng: 75.1200, div: "Jammu" },
  "Udhampur":   { lat: 32.9200, lng: 75.1400, div: "Jammu" },
  "Leh Ladakh": { lat: 34.1526, lng: 77.5771, div: "Ladakh" },
  "Kargil":     { lat: 34.5551, lng: 76.1349, div: "Ladakh" },
};

function getFilePrefix(prefix: string) {
  const files = fs.readdirSync(DATA_DIR);
  const matched = files.find(f => f.startsWith(prefix) && f.endsWith(".xlsx"));
  if (!matched) throw new Error("Missing file: " + prefix);
  return path.join(DATA_DIR, matched);
}

// ── Helpers ─────────────────────────────────────────────────────────
function calcPriority(sequenced: boolean, cases: number, deaths: number) {
  let score = cases * 1.2 - (sequenced ? 40 : 0) + deaths * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function now() { return new Date().toISOString(); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
// Random coordinate offset based on center
function jitter(coord: number, variance = 0.2) {
  return coord + (Math.random() * variance * 2 - variance);
}

// Read raw rows
const districtsFile = getFilePrefix("Districtof_");
const tehsilsFile   = getFilePrefix("Sub_District");
const blocksFile    = getFilePrefix("Blockofspecific");
const villagesFile  = getFilePrefix("Villageof_");
const wardsFile     = getFilePrefix("Statewise_localbody_ward");

function readExcel(fp: string, startRow = 1) {
  const wb = xlsx.readFile(fp);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json<any[][]>(sheet, { header: 1 }).slice(startRow);
}

console.log("Loading District list...");
const rawDistricts = readExcel(districtsFile, 1);
console.log("Loading Tehsils...");
const rawTehsils = readExcel(tehsilsFile, 1);
console.log("Loading Blocks...");
const rawBlocks = readExcel(blocksFile, 1);
console.log("Loading Villages...");
const rawVillages = readExcel(villagesFile, 1);
console.log("Loading Wards...");
const rawWards = readExcel(wardsFile, 1);


sqlite.exec("BEGIN");
sqlite.exec(`
  DELETE FROM report_submissions;
  DELETE FROM outbreaks;
  DELETE FROM zones;
  DELETE FROM asha_workers;
  DELETE FROM labs;
  DELETE FROM districts;
  DELETE FROM regions;
`);

// ── 1. Districts ──────────────────────────────────────────────────
const districtInsert = sqlite.prepare(`
  INSERT INTO districts (name, division, latitude, longitude, population, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const districtMap: Record<string, number> = {}; // Name to ID mapping
const districtCoordMap: Record<number, {lat: number, lng: number}> = {}; 

for (const row of rawDistricts) {
  if (!row || row.length < 4) continue;
  const rawName = row[3];
  if (!rawName) continue;
  const nameStr = String(rawName).trim();
  
  // Clean up e.g., "Leh Ladakh"
  let matchName = Object.keys(DISTRICT_COORDS).find(k => nameStr.includes(k)) || "Srinagar";
  const geo = DISTRICT_COORDS[matchName];
  
  const pop = Math.floor(Math.random() * 500000) + 100000;
  
  const r = districtInsert.run(nameStr, geo.div, geo.lat, geo.lng, pop, now()) as any;
  const id = r.lastInsertRowid as number;
  districtMap[nameStr] = id;
  districtCoordMap[id] = { lat: geo.lat, lng: geo.lng };
}

// ── 2. Zones (Tehsils, Blocks, Wards, Villages) ───────────────────
const zoneInsert = sqlite.prepare(`
  INSERT INTO zones (district_id, name, type, latitude, longitude, population, asha_count, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const zoneIds: number[] = [];

// Tehsils (Sub-districts)
// ['S.No.', 'District Code', 'District Name', 'Sub-district Code', 'Sub-district Version', 'Sub-district Name (In English)', ...]
for (const row of rawTehsils) {
  if (row.length < 6) continue;
  const dName = String(row[2]).trim();
  const tName = String(row[5]).trim();
  if (!dName || !tName) continue;
  const did = districtMap[dName];
  if (!did) continue;
  
  const geo = districtCoordMap[did];
  const pop = Math.floor(Math.random() * 80000) + 10000;
  const z = zoneInsert.run(did, tName, "Tehsil", jitter(geo.lat, 0.1), jitter(geo.lng, 0.1), pop, Math.floor(pop/1000), now()) as any;
  zoneIds.push(z.lastInsertRowid as number);
}

// Blocks
// ['S.No.', 'District Code', 'District Name (In English)', 'Development Block Code', ' Development Block Version', 'Development Block Name (In English)', ...]
for (const row of rawBlocks) {
  if (row.length < 6) continue;
  const dName = String(row[2]).trim();
  const bName = String(row[5]).trim();
  if (!dName || !bName) continue;
  const did = districtMap[dName];
  if (!did) continue;
  
  const geo = districtCoordMap[did];
  const pop = Math.floor(Math.random() * 60000) + 5000;
  const z = zoneInsert.run(did, bName, "Block", jitter(geo.lat, 0.15), jitter(geo.lng, 0.15), pop, Math.floor(pop/1000), now()) as any;
  zoneIds.push(z.lastInsertRowid as number);
}

// Wards
// ['S.No.', 'Localbody Code', 'Ward Code', 'Localbody Name (In English)', 'Ward Number', 'Ward Name (In English)', 'District Code', 'Distrct Name (In English)', ...]
for (const row of rawWards) {
  if (row.length < 8) continue;
  const wName = String(row[5]).trim();
  const dName = String(row[7]).trim(); // District Name
  if (!dName || !wName) continue;
  const did = districtMap[dName];
  if (!did) continue;
  
  const geo = districtCoordMap[did];
  const pop = Math.floor(Math.random() * 20000) + 2000;
  const z = zoneInsert.run(did, wName, "Ward", jitter(geo.lat, 0.05), jitter(geo.lng, 0.05), pop, Math.floor(pop/500), now()) as any;
  zoneIds.push(z.lastInsertRowid as number);
}

// Villages
// ['S.No.', 'District Code', 'District Name (In English)', 'Sub-District Code', 'Sub-District Name (In English)', 'Village Code', 'Village Version', 'Village Name (In English)', ...]
for (const row of rawVillages) {
  if (row.length < 8) continue;
  const dName = String(row[2]).trim();
  const vName = String(row[7]).trim();
  if (!dName || !vName) continue;
  const did = districtMap[dName];
  if (!did) continue;
  
  const geo = districtCoordMap[did];
  const pop = Math.floor(Math.random() * 5000) + 200;
  const z = zoneInsert.run(did, vName, "Village", jitter(geo.lat, 0.25), jitter(geo.lng, 0.25), pop, Math.floor(pop/300) || 1, now()) as any;
  zoneIds.push(z.lastInsertRowid as number);
}

console.log("Parsed " + Object.keys(districtMap).length + " Districts and " + zoneIds.length + " Zones.");


// ── 3. Labs (Randomly assigned to real districts) ─────────────────
const labInsert = sqlite.prepare(`
  INSERT INTO labs (name, code, district_id, type, capacity, active, address)
  VALUES (?, ?, ?, ?, ?, 1, ?)
`);
const labIds: number[] = [];
const allDistrictIds = Object.values(districtMap);

for (let i = 1; i <= 20; i++) {
  const dId = allDistrictIds[Math.floor(Math.random() * allDistrictIds.length)];
  const l = labInsert.run("J&K Lab Facility " + i, "LAB-" + i, dId, i % 2 === 0 ? "RTPCR" : "WGS", 100, "Government Hospital Facility " + i) as any;
  labIds.push(l.lastInsertRowid as number);
}


// ── 4. Outbreaks (Generate 100 demo outbreaks across the massive zone pool)
const outbreakInsert = sqlite.prepare(`
  INSERT INTO outbreaks (zone_id, district_id, disease, variant, resistance, status, sequenced,
    priority_score, previous_score, total_cases, active_cases, deaths, hospitalized, recovered,
    lab_id, first_reported, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const DISEASES = ["COVID-19", "Influenza A (H1N1)", "Scrub Typhus", "Dengue", "Typhoid", "Mumps", "Measles"];
const outbreakIds: number[] = [];

for (let i = 0; i < 200; i++) {
  const tId = zoneIds[Math.floor(Math.random() * zoneIds.length)]; // Random zone
  // We need to fetch district_id for this zone
  const zRow = sqlite.prepare("SELECT district_id FROM zones WHERE id = ?").get(tId) as { district_id: number };
  
  const d = DISEASES[Math.floor(Math.random() * DISEASES.length)];
  const seq = Math.random() > 0.3;
  const cases = Math.floor(Math.random() * 150) + 10;
  const deaths = Math.floor(Math.random() * 3);
  const score = calcPriority(seq, cases, deaths);
  const lid = labIds[Math.floor(Math.random() * labIds.length)];
  
  const o = outbreakInsert.run(
    tId, zRow.district_id, d, seq ? "Variant" : "N/A", "N/A", "active", seq ? 1 : 0,
    score, Math.max(0, score - 5), cases, cases - deaths - 5, deaths, 2, 3, lid, daysAgo(Math.floor(Math.random() * 30)), now()
  ) as any;
  outbreakIds.push(o.lastInsertRowid as number);
}

sqlite.exec("COMMIT");
console.log("Database seeded globally!");
