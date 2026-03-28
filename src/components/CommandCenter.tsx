"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Activity, Search, X, AlertTriangle, CheckCircle, MapPin,
  Dna, Pill, FileText, TrendingUp, TrendingDown, Minus,
  Download, ChevronRight, AlertCircle, Shield, Users, Clock,
  Menu, ChevronLeft, Lock, LogOut, ShieldCheck, Microscope,
  FlaskConical, User, Building2, ChevronDown, Plus, Layers,
  Calendar, Syringe, Heart, Skull, Home, ArrowLeft, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import LoginModal from "./LoginModal";
import Fuse from "fuse.js";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

const CommandMap = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground tracking-widest uppercase">Initializing Map Grid</span>
      </div>
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────
interface District {
  id: number; name: string; division: string;
  latitude: number; longitude: number; population: number;
  outbreak_count: number; total_cases: number; total_deaths: number;
  max_score: number; has_blindspot: boolean; diseases: string[];
}
interface Outbreak {
  id: number; zone_id: number; disease: string; variant: string;
  resistance: string; status: string; sequenced: boolean;
  priority_score: number; previous_score: number;
  total_cases: number; active_cases: number; deaths: number;
  hospitalized: number; recovered: number;
  first_reported: string; last_updated: string;
  lab_name: string | null; lab_code: string | null; lab_type: string | null;
}
interface Zone {
  id: number; district_id: number; name: string; type: string;
  latitude: number; longitude: number; population: number; asha_count: number;
  locations_json: string | null;
  outbreaks: Outbreak[];
}
interface Submission {
  id: number; worker_name: string; new_cases: number; deaths: number;
  hospitalized: number; recovered: number; sample_status: string;
  severity: string; notes: string; submitted_at: string; lab_id: number | null;
}
interface OutbreakDetail extends Outbreak {
  lab: { name: string; code: string; type: string; address: string } | null;
  zone: { name: string; type: string; population: number } | null;
  submissions: Submission[];
}
type Role = "public" | "operator";

// ── Helpers ────────────────────────────────────────────────────────
function getTier(score: number) {
  if (score >= 75) return "critical";
  if (score >= 50) return "warning";
  return "stable";
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TierStripe({ score }: { score: number }) {
  const t = getTier(score);
  return <div className={cn("absolute left-0 top-0 bottom-0 w-0.5 rounded-r",
    t === "critical" ? "bg-red-500" : t === "warning" ? "bg-orange-400" : "bg-emerald-500"
  )} />;
}
function TierBadge({ score, sm }: { score: number; sm?: boolean }) {
  const t = getTier(score);
  const cls = sm ? "text-[9px] px-1.5 py-0.5" : "text-[10px]";
  if (t === "critical") return <Badge variant="critical" className={cn("font-bold uppercase tracking-wider", cls)}>Critical</Badge>;
  if (t === "warning")  return <Badge variant="warning"  className={cn("font-bold uppercase tracking-wider", cls)}>Warning</Badge>;
  return <Badge variant="success" className={cn("font-bold uppercase tracking-wider", cls)}>Stable</Badge>;
}
function TrendIcon({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev;
  if (d > 2)  return <TrendingUp className="size-3 text-red-500" />;
  if (d < -2) return <TrendingDown className="size-3 text-emerald-500" />;
  return <Minus className="size-3 text-muted-foreground" />;
}
function StatusDot({ status }: { status: string }) {
  const cls = status === "active" ? "bg-red-500 animate-pulse" : status === "contained" ? "bg-orange-400" : "bg-emerald-500";
  return <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", cls)} />;
}
function SampleBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600 border-slate-200",
    in_lab: "bg-blue-50 text-blue-700 border-blue-200",
    results_ready: "bg-orange-50 text-orange-700 border-orange-200",
    sequenced: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const label: Record<string, string> = {
    pending: "Pending Dispatch", in_lab: "In Lab", results_ready: "Results Ready", sequenced: "Sequenced"
  };
  return (
    <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5", map[status] || map.pending)}>
      <FlaskConical className="size-2.5" />{label[status] || status}
    </span>
  );
}
function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    mild: "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate: "bg-orange-50 text-orange-700 border-orange-200",
    severe: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={cn("inline-flex text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5", map[sev] || map.moderate)}>
      {sev}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function CommandCenter() {
  // Data
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [selectedOutbreak, setSelectedOutbreak] = useState<OutbreakDetail | null>(null);
  const [outbreakLoading, setOutbreakLoading] = useState(false);
  // UI
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "map" | "detail">("list");
  // Submission form
  const [form, setForm] = useState({ new_cases:"", deaths:"", hospitalized:"", recovered:"", notes:"", severity:"moderate", sample_status:"pending", worker_name:"", lab_code:"" });
  const [submitting, setSubmitting] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  // Auth
  const [role, setRole] = useState<Role>("public");
  const [showLogin, setShowLogin] = useState(false);
  const isOperator = role === "operator";

  // Restore session
  useEffect(() => {
    const r = localStorage.getItem("pp_role");
    const ts = localStorage.getItem("pp_session_ts");
    if (r === "operator" && ts && Date.now() - parseInt(ts) < 8 * 3600 * 1000) {
      setRole("operator");
    }
  }, []);

  const logout = () => { localStorage.removeItem("pp_role"); localStorage.removeItem("pp_session_ts"); setRole("public"); };
  const onLoginSuccess = (r: "operator") => { setRole(r); setShowLogin(false); };

  // ── Fetch districts ────────────────────────────────────────────
  const fetchDistricts = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/districts");
      const data = await res.json();
      setDistricts(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { fetchDistricts(); }, []);

  // ── Fetch zones when district selected ────────────────────────
  const selectDistrict = useCallback(async (d: District) => {
    setSelectedDistrict(d);
    setSelectedZone(null);
    setSelectedOutbreak(null);
    setMobileView("detail");
    try {
      const res = await fetch(`/api/v2/districts/${d.id}/zones`);
      const data = await res.json();
      setZones(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  // ── Fetch outbreak detail when outbreak selected ───────────────
  const selectOutbreak = useCallback(async (o: Outbreak) => {
    setOutbreakLoading(true);
    try {
      const res = await fetch(`/api/v2/outbreaks/${o.id}`);
      const data = await res.json();
      setSelectedOutbreak(data);
      setMobileView("detail");
    } catch {}
    setOutbreakLoading(false);
  }, []);

  // ── Submit report ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutbreak || !form.new_cases || !isOperator) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/outbreaks/${selectedOutbreak.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-operator-pin": "PP-ADMIN-2025" },
        body: JSON.stringify({
          new_cases: parseInt(form.new_cases),
          deaths: parseInt(form.deaths || "0"),
          hospitalized: parseInt(form.hospitalized || "0"),
          recovered: parseInt(form.recovered || "0"),
          notes: form.notes, severity: form.severity,
          sample_status: form.sample_status, worker_name: form.worker_name,
          lab_code: form.lab_code,
        }),
      });
      if (res.ok) {
        setForm({ new_cases:"", deaths:"", hospitalized:"", recovered:"", notes:"", severity:"moderate", sample_status:"pending", worker_name:"", lab_code:"" });
        setSubmitOk(true); setTimeout(() => setSubmitOk(false), 3000);
        // refresh outbreak detail
        await selectOutbreak(selectedOutbreak);
        await fetchDistricts();
      }
    } catch {}
    setSubmitting(false);
  };

  // ── Aggregates ────────────────────────────────────────────────
  const totalReports = useMemo(() => districts.reduce((s, d) => s + d.total_cases, 0), [districts]);
  const critCount    = useMemo(() => districts.filter(d => getTier(d.max_score) === "critical").length, [districts]);
  const warnCount    = useMemo(() => districts.filter(d => getTier(d.max_score) === "warning").length, [districts]);
  const blindCount   = useMemo(() => districts.filter(d => d.has_blindspot).length, [districts]);

  const filteredDistricts = useMemo(() => {
    if (!searchQuery) return districts;
    const fuse = new Fuse(districts, {
      keys: ["name", "diseases"],
      threshold: 0.3, // Allows small typos
      distance: 100
    });
    return fuse.search(searchQuery).map(res => res.item);
  }, [districts, searchQuery]);

  // Flatten regions for map
  const mapRegions = useMemo(() => districts.map(d => ({
    id: d.id, region: d.name, country: d.division, latitude: d.latitude, longitude: d.longitude,
    sequenced: !d.has_blindspot, disease: (d.diseases || []).join(", "),
    variant: "", priority_score: d.max_score, symptom_reports: d.total_cases,
  })), [districts]);

  const activeMapRegion = selectedZone ? {
    id: selectedZone.id, region: selectedZone.name, country: selectedZone.type,
    latitude: selectedZone.latitude, longitude: selectedZone.longitude,
    locations_json: selectedZone.locations_json,
    sequenced: true, disease: "", variant: "", priority_score: 50, symptom_reports: 0,
    zoomLevel: 13
  } : selectedDistrict ? {
    id: selectedDistrict.id, region: selectedDistrict.name, country: selectedDistrict.division,
    latitude: selectedDistrict.latitude, longitude: selectedDistrict.longitude,
    locations_json: null,
    sequenced: !selectedDistrict.has_blindspot, disease: "",
    variant: "", priority_score: selectedDistrict.max_score, symptom_reports: selectedDistrict.total_cases,
    zoomLevel: 10
  } : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {showLogin && <LoginModal onSuccess={onLoginSuccess} onClose={() => setShowLogin(false)} />}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 md:px-6 h-14 bg-card border-b border-border shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(v => !v)} className="hidden md:flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground transition-colors">
            {sidebarOpen ? <ChevronLeft className="size-4" /> : <Menu className="size-4" />}
          </button>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="PathoPulse Logo" className="h-7 w-auto object-contain drop-shadow" />
            <span className="font-bold text-sm tracking-widest uppercase">PathoPulse</span>
          </div>
          <div className="hidden sm:block h-5 w-px bg-border mx-1" />
          <span className="hidden sm:block text-xs text-muted-foreground font-medium tracking-wider uppercase">J&K Genomic Surveillance</span>
        </div>
        <div className="flex items-center gap-2">
          {critCount > 0 && <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />{critCount} Critical</div>}
          {warnCount > 0 && <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />{warnCount} Warning</div>}
          {isOperator ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold"><ShieldCheck className="size-3" />Operator</div>
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground" onClick={logout}><LogOut className="size-3.5" /><span className="hidden sm:inline">Sign out</span></Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => setShowLogin(true)}><Lock className="size-3.5" /><span className="hidden sm:inline">Operator Login</span></Button>
          )}
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => {
            const csv = ["District,Division,MaxScore,Outbreaks,Cases,Deaths,Blindspot",
              ...districts.map(d => `${d.name},${d.division},${d.max_score},${d.outbreak_count},${d.total_cases},${d.total_deaths},${d.has_blindspot}`)
            ].join("\n");
            const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" })); a.download = "pathopulse.csv"; a.click();
          }}><Download className="size-3.5" /><span className="hidden sm:inline">Export</span></Button>
        </div>
      </header>

      {/* ── Mobile Tabs ──────────────────────────────────────────── */}
      <div className="md:hidden flex border-b border-border bg-card shrink-0">
        {(["list","map","detail"] as const).map(tab => (
          <button key={tab} onClick={() => setMobileView(tab)}
            className={cn("flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors",
              mobileView === tab ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {tab === "list" ? "Districts" : tab === "map" ? "Map" : "Detail"}
          </button>
        ))}
      </div>

      {/* ── Stats Bar ────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-4 px-6 py-2.5 bg-muted/40 border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3" /><span><strong className="text-foreground">{districts.length}</strong> Districts</span></div>
        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1.5 text-muted-foreground"><Layers className="size-3" /><span><strong className="text-foreground">{zones.length > 0 ? zones.length : "—"}</strong> Zones loaded</span></div>
        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3" /><span><strong className="text-foreground">{totalReports.toLocaleString()}</strong> Total Cases</span></div>
        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1.5 text-muted-foreground"><AlertCircle className="size-3 text-red-500" /><span><strong className="text-red-600">{critCount}</strong> Critical</span></div>
        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1.5 text-muted-foreground"><Shield className="size-3 text-orange-500" /><span><strong className="text-orange-600">{blindCount}</strong> Blindspot Districts</span></div>
        <div className="ml-auto flex items-center gap-1 text-muted-foreground"><Clock className="size-3" /><span>Live · J&K Public Health Directorate</span></div>
      </div>

      {/* ── Main Body ────────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ─────────────────────────────────────── */}
        <aside className={cn(
          "flex flex-col bg-card border-r border-border shrink-0 transition-all duration-200",
          "hidden md:flex",
          sidebarOpen ? "w-72 lg:w-80" : "w-0 overflow-hidden border-r-0",
          mobileView === "list" ? "!flex w-full md:w-72 lg:w-80" : "hidden md:flex"
        )}>
          {/* Search */}
          <div className="p-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input placeholder="Search district or disease..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted/40 border-muted" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
            </div>
          </div>

          {/* Column header */}
          <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">District</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Score</span>
          </div>

          {/* District List */}
          <ul className="flex-1 overflow-y-auto">
            {filteredDistricts.map(d => {
              const tier = getTier(d.max_score);
              const isActive = selectedDistrict?.id === d.id;
              return (
                <li key={d.id} onClick={() => selectDistrict(d)}
                  className={cn("group relative flex items-center gap-3 px-3 py-3 border-b border-border cursor-pointer transition-colors",
                    isActive ? "bg-foreground text-background" : "hover:bg-muted/50")}>
                  <TierStripe score={d.max_score} />
                  <div className="flex-1 min-w-0">
                    <div className={cn("font-semibold text-sm truncate", isActive ? "text-background" : "")}>{d.name}</div>
                    <div className={cn("text-[10px] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap", isActive ? "text-background/60" : "text-muted-foreground")}>
                      <span>{d.division}</span>
                      {d.outbreak_count > 0 && <span>· {d.outbreak_count} outbreak{d.outbreak_count > 1 ? "s" : ""}</span>}
                      {d.has_blindspot && <span>· BLINDSPOT</span>}
                    </div>
                    {/* Disease tags */}
                    {d.diseases.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {d.diseases.slice(0,2).map(dis => (
                          <span key={dis} className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border",
                            isActive ? "border-background/20 text-background/70" : "border-border text-muted-foreground bg-muted/30"
                          )}>{dis.length > 18 ? dis.slice(0,18) + "…" : dis}</span>
                        ))}
                        {d.diseases.length > 2 && <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", isActive ? "border-background/20 text-background/70" : "border-border text-muted-foreground")}>+{d.diseases.length-2}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("text-sm font-bold tabular-nums", isActive ? "text-background" : tier === "critical" ? "text-red-600" : tier === "warning" ? "text-orange-500" : "text-emerald-600")}>{d.max_score}</span>
                    <TrendIcon curr={d.max_score} prev={d.max_score - 5} />
                  </div>
                  <ChevronRight className={cn("size-3.5 shrink-0 transition-opacity", isActive ? "opacity-60 text-background" : "opacity-0 group-hover:opacity-40")} />
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Center: Map ──────────────────────────────────────── */}
        <section className={cn("flex-1 relative bg-muted/20 overflow-hidden", mobileView === "map" ? "block" : "hidden md:block")}>
          <CommandMap regions={mapRegions} activeRegion={activeMapRegion}
            onSelect={r => { const d = districts.find(x => x.id === r.id); if (d) selectDistrict(d); }} />
          <LiveTicker districts={districts} />
        </section>

        {/* ── Right Panel ──────────────────────────────────────── */}
        {selectedDistrict && (
          <aside className={cn(
            "flex flex-col bg-card border-l border-border shrink-0 w-full md:w-[400px] lg:w-[440px] overflow-hidden animate-slide-in-right",
            mobileView === "detail" ? "flex" : "hidden md:flex"
          )}>
            {/* ── View: Outbreak Detail ──────────────────────── */}
            {selectedOutbreak ? (
              <OutbreakDetailPanel
                outbreak={selectedOutbreak}
                loading={outbreakLoading}
                isOperator={isOperator}
                form={form} setForm={setForm}
                submitting={submitting} submitOk={submitOk}
                onSubmit={handleSubmit}
                onBack={() => setSelectedOutbreak(null)}
                onClose={() => { setSelectedOutbreak(null); setSelectedDistrict(null); setZones([]); setMobileView("list"); }}
              />
            ) : (
              /* ── View: District / Zone Browser ───────────── */
              <DistrictPanel
                district={selectedDistrict}
                zones={zones}
                selectedZone={selectedZone}
                setSelectedZone={setSelectedZone}
                onSelectOutbreak={selectOutbreak}
                onClose={() => { setSelectedDistrict(null); setZones([]); setMobileView("list"); }}
              />
            )}
          </aside>
        )}
      </main>
    </div>
  );
}

// ── Live Intelligence Ticker ──────────────────────────────────────
function LiveTicker({ districts }: { districts: District[] }) {
  const messages = useMemo(() => {
    if (!districts || districts.length === 0) return [];
    const active = districts.filter(d => d.outbreak_count > 0);
    if (active.length === 0) return ["Scanning J&K nodal network... No active critical alerts."];
    // Generate simulated feed items
    return active.slice(0, 15).map((d, i) => {
      const type = getTier(d.max_score);
      const disease = d.diseases[0] || "Unknown Pathogen";
      const times = ["Just now", "2m ago", "5m ago", "12m ago", "18m ago", "34m ago"];
      const time = times[i % times.length];
      return { msg: `${d.name}: ${d.total_cases} active ${disease} cases under surveillance.`, type, time };
    });
  }, [districts]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center z-[500] overflow-hidden text-xs bg-[#0b0f19]">
      <div className="flex items-center px-4 h-full bg-red-600 text-white font-bold tracking-widest uppercase shrink-0 z-20 shadow-[8px_0_16px_rgba(0,0,0,0.8)]">
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse mr-2" />
        Live Feed
      </div>
      <div className="flex-1 overflow-hidden relative h-full flex items-center z-10">
        <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#0b0f19] to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0b0f19] to-transparent z-20 pointer-events-none" />
        
        <div className="flex animate-marquee-loop hover:[animation-play-state:paused] w-max items-center pl-8">
          {messages.map((m: any, i) => (
            <div key={`a-${i}`} className="flex items-center whitespace-nowrap mr-14 text-slate-200">
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mr-2.5">[{m.time || "Scanning"}]</span>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-2.5 shadow-[0_0_6px_rgba(0,0,0,0.5)]",
                m.type === "critical" ? "bg-red-500" : m.type === "warning" ? "bg-orange-500" : "bg-emerald-500"
              )} />
              <span className="font-medium tracking-wide">{m.msg || m}</span>
            </div>
          ))}
          {/* Duplicate set for perfectly seamless infinity loop */}
          {messages.map((m: any, i) => (
            <div key={`b-${i}`} className="flex items-center whitespace-nowrap mr-14 text-slate-200">
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mr-2.5">[{m.time || "Scanning"}]</span>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-2.5 shadow-[0_0_6px_rgba(0,0,0,0.5)]",
                m.type === "critical" ? "bg-red-500" : m.type === "warning" ? "bg-orange-500" : "bg-emerald-500"
              )} />
              <span className="font-medium tracking-wide">{m.msg || m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── District / Zone Browser Panel ─────────────────────────────────
function DistrictPanel({ district, zones, selectedZone, setSelectedZone, onSelectOutbreak, onClose }: {
  district: District; zones: Zone[]; selectedZone: Zone | null;
  setSelectedZone: (z: Zone | null) => void;
  onSelectOutbreak: (o: Outbreak) => void; onClose: () => void;
}) {
  const [zoneSearch, setZoneSearch] = useState("");
  const [limit, setLimit] = useState(50);
  
  const filteredZones = useMemo(() => {
    let list = zones;
    if (zoneSearch) {
      const fuse = new Fuse(zones, {
        keys: ["name", "type"],
        threshold: 0.4, // Typos like "Anatnag"
        distance: 100
      });
      list = fuse.search(zoneSearch).map(res => res.item);
    }
    // Sort so zones with outbreaks are at the top
    list.sort((a, b) => b.outbreaks.length - a.outbreaks.length);
    return list;
  }, [zones, zoneSearch]);

  const displayedZones = filteredZones.slice(0, limit);
  const tier = getTier(district.max_score);
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-bold text-base">{district.name}</h2>
            <TierBadge score={district.max_score} sm />
          </div>
          <p className="text-xs text-muted-foreground">{district.division} Division · Pop. {district.population?.toLocaleString()}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="size-4" /></button>
      </div>

      {/* District Summary */}
      <div className={cn("mx-4 mt-4 p-3 rounded-lg border grid grid-cols-4 gap-2",
        tier === "critical" ? "bg-red-50 border-red-100" : tier === "warning" ? "bg-orange-50 border-orange-100" : "bg-emerald-50 border-emerald-100"
      )}>
        {[
          { label: "Outbreaks", value: district.outbreak_count, icon: <Activity className="size-3" /> },
          { label: "Cases", value: district.total_cases.toLocaleString(), icon: <Users className="size-3" /> },
          { label: "Deaths", value: district.total_deaths, icon: <Skull className="size-3" /> },
          { label: "Threat", value: district.max_score, icon: <AlertCircle className="size-3" /> },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center text-center">
            <div className="text-muted-foreground mb-0.5">{s.icon}</div>
            <div className="text-base font-bold">{s.value}</div>
            <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Zone Search */}
      <div className="px-4 mt-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input placeholder="Search tehsils, blocks, villages, wards..." value={zoneSearch}
            onChange={e => { setZoneSearch(e.target.value); setLimit(50); }}
            className="pl-7 h-8 text-xs bg-muted/30" />
        </div>
      </div>

      {/* Zones List */}
      <div className="flex-1 overflow-y-auto mt-2 pb-6">
        {zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            <span className="text-xs">Loading admin zones…</span>
          </div>
        ) : filteredZones.length === 0 ? (
           <p className="text-center text-xs text-muted-foreground mt-8">No matching locations found.</p>
        ) : (
          <>
            {displayedZones.map(zone => (
          <div key={zone.id} className="border-b border-border">
            {/* Zone header */}
            <button
              onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{zone.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span>{zone.type}</span>
                    {zone.population && <span>· {zone.population.toLocaleString()} pop</span>}
                    {zone.asha_count > 0 && <span>· {zone.asha_count} ASHA</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {zone.outbreaks.length > 0 && (
                  <span className="text-[10px] font-bold text-muted-foreground">{zone.outbreaks.length} outbreak{zone.outbreaks.length > 1 ? "s" : ""}</span>
                )}
                <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", selectedZone?.id === zone.id && "rotate-180")} />
              </div>
            </button>

            {/* Zone outbreaks expanded */}
            {selectedZone?.id === zone.id && (
              <div className="bg-muted/20 border-t border-border">
                {zone.outbreaks.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No active outbreaks in this zone.</p>
                ) : zone.outbreaks.map(ob => (
                  <button key={ob.id} onClick={() => onSelectOutbreak(ob)}
                    className="w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-card transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <StatusDot status={ob.status} />
                          <span className="font-semibold text-xs">{ob.disease}</span>
                          <TierBadge score={ob.priority_score} sm />
                        </div>
                        {ob.variant && ob.variant !== "N/A" && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1.5">
                            <Dna className="size-2.5" />{ob.variant}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span><strong className="text-foreground">{ob.total_cases}</strong> cases</span>
                          {ob.deaths > 0 && <span><strong className="text-red-600">{ob.deaths}</strong> deaths</span>}
                          <span><strong className="text-foreground">{ob.active_cases}</strong> active</span>
                          {ob.lab_name && <span className="text-blue-600 flex items-center gap-0.5"><FlaskConical className="size-2.5" />{ob.lab_code}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {!ob.sequenced && <span className="text-[9px] font-bold border border-dashed border-slate-400 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="size-2.5" />BLINDSPOT</span>}
                          {ob.resistance && ob.resistance !== "N/A" && <span className="text-[9px] font-medium bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-1"><Pill className="size-2.5" />{ob.resistance.split(",")[0]}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn("text-lg font-bold", getTier(ob.priority_score) === "critical" ? "text-red-600" : getTier(ob.priority_score) === "warning" ? "text-orange-500" : "text-emerald-600")}>{ob.priority_score}</div>
                        <ChevronRight className="size-3 text-muted-foreground ml-auto mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
            {limit < filteredZones.length && (
              <div className="p-4 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit(l => l + 50)} className="w-full text-xs">
                  Load More (+50 of {filteredZones.length - limit})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Outbreak Detail Panel ──────────────────────────────────────────
function OutbreakDetailPanel({ outbreak, loading, isOperator, form, setForm, submitting, submitOk, onSubmit, onBack, onClose }: {
  outbreak: OutbreakDetail; loading: boolean; isOperator: boolean;
  form: any; setForm: any; submitting: boolean; submitOk: boolean;
  onSubmit: (e: React.FormEvent) => void; onBack: () => void; onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "history" | "report">("info");
  const tier = getTier(outbreak.priority_score);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button onClick={onBack} className="mt-0.5 p-1 rounded hover:bg-muted text-muted-foreground shrink-0"><ArrowLeft className="size-3.5" /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-sm truncate">{outbreak.disease}</h2>
              <TierBadge score={outbreak.priority_score} sm />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {outbreak.zone?.name} · {fmtDate(outbreak.first_reported)}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0"><X className="size-4" /></button>
      </div>

      {/* Score Card */}
      <div className={cn("mx-4 mt-3 p-3 rounded-lg border grid grid-cols-5 gap-2",
        tier === "critical" ? "bg-red-50 border-red-100" : tier === "warning" ? "bg-orange-50 border-orange-100" : "bg-emerald-50 border-emerald-100"
      )}>
        {[
          { label: "Index", value: outbreak.priority_score, big: true },
          { label: "Total", value: outbreak.total_cases?.toLocaleString() },
          { label: "Active", value: outbreak.active_cases },
          { label: "Deaths", value: outbreak.deaths },
          { label: "Hosp.", value: outbreak.hospitalized },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className={cn("font-bold", s.big ? "text-2xl text-red-700" : "text-base")}>{s.value ?? 0}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-3 border-b border-border shrink-0">
        {(["info","history","report"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
              activeTab === tab ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {tab === "info" ? "Clinical" : tab === "history" ? `History (${outbreak.submissions?.length ?? 0})` : "Submit"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">

        {/* ── Info Tab ──────────────────────────────────────────── */}
        {activeTab === "info" && (
          <div className="space-y-4 animate-fade-in-up">
            {/* Clinical */}
            <div className="space-y-2.5">
              {[
                { icon: <Activity className="size-3.5" />, label: "Disease",        val: outbreak.disease },
                { icon: <Dna className="size-3.5" />,      label: "Variant",        val: outbreak.variant || "N/A" },
                { icon: <Pill className="size-3.5" />,     label: "Drug Resistance", val: outbreak.resistance || "N/A" },
                { icon: <MapPin className="size-3.5" />,   label: "Zone",           val: `${outbreak.zone?.name} (${outbreak.zone?.type})` },
              ].map(r => (
                <div key={r.label} className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground shrink-0">{r.icon}</div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{r.label}</div>
                    <div className="text-sm font-medium">{r.val}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3 space-y-2.5">
              {/* Sequencing status */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-2">
                  <Microscope className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Genomic Sequencing</span>
                </div>
                {outbreak.sequenced ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 border border-emerald-300 rounded px-1.5 py-0.5"><CheckCircle className="size-2.5" />Confirmed</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 border border-dashed border-slate-400 rounded px-1.5 py-0.5"><AlertTriangle className="size-2.5" />BLINDSPOT</span>
                )}
              </div>

              {/* Lab */}
              {outbreak.lab && (
                <div className="py-2 px-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FlaskConical className="size-3 text-blue-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Primary Lab</span>
                  </div>
                  <p className="text-xs font-semibold">{outbreak.lab.name}</p>
                  <p className="text-[10px] text-muted-foreground">{outbreak.lab.code} · {outbreak.lab.type} · {outbreak.lab.address}</p>
                </div>
              )}
            </div>

            <div className="text-[10px] text-muted-foreground border-t border-border pt-3 flex items-center justify-between">
              <span>First reported: {fmtDate(outbreak.first_reported)}</span>
              <span>Updated: {fmtTime(outbreak.last_updated)}</span>
            </div>
          </div>
        )}

        {/* ── History Tab ───────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="space-y-4 animate-fade-in-up">
            {!outbreak.submissions || outbreak.submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <FileText className="size-6 opacity-20" />
                <span className="text-xs">No submissions yet</span>
              </div>
            ) : (
              <>
                {/* Epi Curve Visualization */}
                <div className="bg-muted/10 border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-widest text-foreground">Epidemiological Curve</span>
                  </div>
                  <div className="h-[120px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[...(outbreak.submissions)].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()).map(s => ({
                        time: new Date(s.submitted_at).toLocaleDateString("en-IN", { day:"numeric", month:"short" }),
                        cases: s.new_cases,
                        deaths: s.deaths
                      }))}>
                        <defs>
                          <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: "#888"}} dy={5} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "6px", fontSize: "11px", color: "#fff" }}
                          itemStyle={{ fontSize: "11px", fontWeight: "bold" }}
                          cursor={{ stroke: "#475569", strokeWidth: 1, strokeDasharray: "3 3" }}
                          labelStyle={{ color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}
                        />
                        <Area type="monotone" dataKey="cases" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorCases)" />
                        <Area type="monotone" dataKey="deaths" stroke="#000000" strokeWidth={2} fill="transparent" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Submissions List */}
                <div className="space-y-3">
                {outbreak.submissions.map(sub => (
                  <div key={sub.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="size-3 text-muted-foreground" />
                    <span className="text-xs font-semibold">{sub.worker_name || "Anonymous"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SevBadge sev={sub.severity || "moderate"} />
                    <span className="text-[10px] text-muted-foreground">{fmtTime(sub.submitted_at)}</span>
                  </div>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "New Cases", val: sub.new_cases, red: false },
                      { label: "Deaths",    val: sub.deaths,    red: true  },
                      { label: "Hosp.",     val: sub.hospitalized, red: false },
                      { label: "Recovered", val: sub.recovered, red: false },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <div className={cn("text-sm font-bold", s.red && s.val > 0 ? "text-red-600" : "")}>{s.val ?? 0}</div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {sub.sample_status && <SampleBadge status={sub.sample_status} />}
                  {sub.notes && <p className="text-[11px] text-muted-foreground italic leading-relaxed border-t border-border pt-2">"{sub.notes}"</p>}
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    )}

        {/* ── Report Tab ────────────────────────────────────────── */}
        {activeTab === "report" && (
          <div className="animate-fade-in-up">
            {isOperator ? (
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { key: "new_cases", label: "New Cases *", ph: "e.g. 12", type: "number" },
                    { key: "deaths",    label: "Deaths",      ph: "0",       type: "number" },
                    { key: "hospitalized", label: "Hospitalised", ph: "0",   type: "number" },
                    { key: "recovered", label: "Recovered",   ph: "0",       type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">{f.label}</label>
                      <Input type={f.type} placeholder={f.ph} min="0" value={form[f.key]}
                        onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        className="h-8 text-sm" required={f.key === "new_cases"} />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Your Name (ASHA ID)</label>
                  <Input placeholder="e.g. Ruqaiya Mir · KSH-ASH-00421" value={form.worker_name}
                    onChange={e => setForm((p: any) => ({ ...p, worker_name: e.target.value }))} className="h-8 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Severity</label>
                    <select value={form.severity} onChange={e => setForm((p: any) => ({ ...p, severity: e.target.value }))}
                      className="w-full h-8 text-sm border border-input rounded-md px-2 bg-transparent focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring">
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Sample Status</label>
                    <select value={form.sample_status} onChange={e => setForm((p: any) => ({ ...p, sample_status: e.target.value }))}
                      className="w-full h-8 text-sm border border-input rounded-md px-2 bg-transparent focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring">
                      <option value="pending">Pending</option>
                      <option value="in_lab">In Lab</option>
                      <option value="results_ready">Results Ready</option>
                      <option value="sequenced">Sequenced</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Lab Code (optional)</label>
                  <Input placeholder="e.g. SKIMS-MB" value={form.lab_code}
                    onChange={e => setForm((p: any) => ({ ...p, lab_code: e.target.value }))} className="h-8 text-sm font-mono" />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Field Notes</label>
                  <textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))}
                    placeholder="Clinical observations, access barriers, resource needs..."
                    className="w-full text-sm border border-input rounded-md p-2.5 h-24 resize-none bg-transparent placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring"
                  />
                </div>

                <Button type="submit" disabled={submitting}
                  className={cn("w-full text-xs font-bold tracking-wider uppercase", submitOk && "bg-emerald-700 hover:bg-emerald-700")}>
                  {submitting ? <><div className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />Transmitting…</> :
                   submitOk   ? <><CheckCircle className="size-3.5" />Report Filed</> : "File Clinical Report"}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Lock className="size-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-semibold">Restricted Access</p>
                  <p className="text-xs text-muted-foreground mt-1">Only authorised PHC operators can submit reports.</p>
                </div>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 mt-1" onClick={() => document.dispatchEvent(new CustomEvent("pp:openLogin"))}>
                  <Lock className="size-3" />Operator Login
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
