import Database from "better-sqlite3";
import * as path from "path";

const dbPath = path.join(process.cwd(), "sqlite.db");
const sqlite = new Database(dbPath);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function enrichData() {
  console.log("🚀 Starting data enrichment process for Outbreak Zones...");
  
  // Get all zones that actually have outbreaks so we don't geocode 8,000 idle villages
  const rawZones = sqlite.prepare(`
    SELECT DISTINCT z.id, z.name, d.name as district 
    FROM zones z 
    JOIN districts d ON z.district_id = d.id 
    JOIN outbreaks o ON o.zone_id = z.id
  `).all() as { id: number; name: string; district: string }[];

  console.log(`Found ${rawZones.length} critical zones to enrich.`);

  const updateZone = sqlite.prepare("UPDATE zones SET latitude = ?, longitude = ? WHERE id = ?");
  let successCount = 0;

  for (const zone of rawZones) {
    try {
      const cleanName = zone.name.split('/')[0];
      const searchQuery = `${cleanName}, ${zone.district}, Jammu and Kashmir, India`;
      
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        // [Longitude, Latitude]
        const [lng, lat] = data.features[0].geometry.coordinates;
        updateZone.run(lat, lng, zone.id);
        successCount++;
        console.log(`✅ [${successCount}/${rawZones.length}] Found: ${zone.name} -> [${lat}, ${lng}]`);
      } else {
        console.log(`❌ [${successCount}/${rawZones.length}] Not found: ${zone.name}`);
      }
    } catch (error: any) {
      console.error(`⚠️ Error processing ${zone.name}:`, error.message);
    }
    await sleep(1000); // 1.0s delay for Photon API
  }

  console.log("\n🎉 Enrichment complete! Accurate coordinates attached to critical zones.");
}

enrichData();
