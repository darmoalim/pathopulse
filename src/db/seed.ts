import { db } from "./index";
import { asha_workers } from "./schema";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";

async function seed() {
  const workers = [
    {
      name: "Aatif",
      worker_id: "KSH-ASH-00421",
      pin: "pathopulse2025",
      role: "field_worker",
    },
    {
      name: "Dr. Farooq",
      worker_id: "LAB-SKIMS-001",
      pin: "labaccess2025",
      role: "lab_operator",
    }
  ];

  console.log("🌱 Seeding Demo Operators...");

  for (const w of workers) {
    const pin_hash = createHash("sha256").update(w.pin).digest("hex");
    
    // Check if worker exists
    const existing = await db.select().from(asha_workers).where(eq(asha_workers.worker_id, w.worker_id)).get();
    
    if (existing) {
      await db.update(asha_workers).set({ pin_hash, role: w.role, name: w.name }).where(eq(asha_workers.worker_id, w.worker_id));
      console.log(`✅ Updated existing worker: ${w.worker_id} (${w.name})`);
    } else {
      await db.insert(asha_workers).values({
        name: w.name,
        worker_id: w.worker_id,
        pin_hash: pin_hash,
        role: w.role,
        active: true,
      });
      console.log(`✅ Created new worker: ${w.worker_id} (${w.name})`);
    }
  }

  console.log("🎉 Seeding complete.");
}

seed().catch(console.error);
