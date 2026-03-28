# PathoPulse | Genomic Surveillance Command Center

PathoPulse is an enterprise-grade, localized public health dashboard explicitly designed for the Jammu & Kashmir region. It visualizes syndromic load alongside genomic sequencing blindspots, highlighting critical vulnerabilities where a high density of clinical symptoms coincides with a lack of laboratory sequencing data (a "Genomic Blindspot"). 

This project was rebuilt on an advanced Next.js 16 App Router foundation with TypeScript, TailwindCSS v4, and a local SQLite database orchestrated by Drizzle ORM.

## Quick Start (Local Deployment)

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Initialization
This project uses SQLite for zero-setup local deployment. Generate the schema and push dummy telemetry data from J&K remote clinics:
```bash
npm run db:push
npm run db:seed
```

### 3. Start Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000` to view the Command Center matrix.

## System Architecture

**Frontend**
- **Next.js & React**: Utilizing React Server Components and dynamic module loading.
- **Tailwind CSS**: Stroke-based, ultra-minimalist Command Center styling.
- **Leaflet.js**: Integrated via `react-leaflet` to render coordinate data over the high-altitude terrain of Kashmir.

**Backend**
- **Next.js API Routes**: Standardized `/api/regions` GET and POST hooks for data querying and live symptom reporting.
- **Drizzle ORM**: Deeply typed interactions with the underlying `sqlite.db` engine.
- **Scoring Engine**: Priority indices are dynamically generated upon submission via `reports * 1.2 - (seq ? 40 : 0)`.

## Threat Prioritization Mathematics
PathoPulse evaluates District threat levels through the mathematical intersection of symptomatic clustering and sequencing absence:
`Threat Index = (Reported Symptoms × 1.2) - (Genomic Sequence Confirmed ? 40 : 0)`
Districts exceeding Index 75 are flagged as **CRITICAL (RED)** and prioritize immediate sequencing kit dispatch. 
