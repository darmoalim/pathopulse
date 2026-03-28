import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle } from "react-leaflet";
import React, { useEffect } from "react";
import L from "leaflet";
import { forecastThreatRadius } from "@/lib/seir";

interface Region {
  id: number;
  region: string;
  latitude: number;
  longitude: number;
  sequenced: boolean;
  disease: string;
  variant: string;
  priority_score: number;
  symptom_reports: number;
  population?: number;
  active_cases?: number;
  zoomLevel?: number;
  locations_json?: string | null;
}

function MapUpdater({ activeRegion }: { activeRegion: Region | null }) {
  const map = useMap();
  useEffect(() => {
    if (activeRegion?.locations_json) {
      try {
        const parsed = JSON.parse(activeRegion.locations_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const latLngs: [number, number][] = parsed.map((loc: any) => [loc.lat, loc.lng]);
          const bounds = L.latLngBounds(latLngs);
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 1.5 });
          return;
        }
      } catch (e) {
        // Fallback below
      }
    }
    if (activeRegion?.latitude) {
      map.setView([activeRegion.latitude, activeRegion.longitude], activeRegion.zoomLevel || 10, { animate: true, duration: 1.5 });
    }
  }, [activeRegion, map]);
  return null;
}

function getMarkerColor(score: number): string {
  if (score >= 75) return "#dc2626"; // critical red
  if (score >= 50) return "#ea580c"; // warning orange
  return "#059669";                  // stable green
}

interface Props {
  regions: Region[];
  activeRegion: Region | null;
  onSelect?: (r: Region) => void;
}

export default function MapComponent({ regions, activeRegion, onSelect }: Props) {
  if (!regions) return null;

  return (
    <div className="w-full h-full relative">

      {/* Legend */}
      <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-sm border border-gray-200 shadow-sm rounded-lg p-3 text-[10px] text-gray-700 pointer-events-none select-none">
        <div className="font-bold uppercase tracking-widest mb-2 pb-1.5 border-b border-gray-100">Map Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-red-600 bg-red-600/10" />
            <span className="font-medium">Critical · Index &gt;75</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-500/10" />
            <span className="font-medium">Warning · Index &gt;50</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-emerald-600 bg-emerald-600/10" />
            <span className="font-medium">Stable · Index &lt;50</span>
          </div>
          <div className="pt-1.5 border-t border-gray-100 space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4.5" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 2" />
              </svg>
              <span>Genomic blindspot</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4.5" fill="none" stroke="#64748b" strokeWidth="1.5" />
              </svg>
              <span>Genome confirmed</span>
            </div>
          </div>
        </div>
      </div>

      <MapContainer
        center={[33.9, 75.3]}
        zoom={8}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OSM</a> &copy; <a href='https://carto.com/'>CARTO</a>"
        />
        <MapUpdater activeRegion={activeRegion} />

        {/* ── Render Glowing Circles for Multi-location Zones ── */}
        {(() => {
          if (!activeRegion?.locations_json) return null;
          try {
            const parsed = JSON.parse(activeRegion.locations_json);
            return parsed.map((loc: any, i: number) => (
              <Circle
                key={`glow-${i}`}
                center={[loc.lat, loc.lng]}
                radius={400}
                pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.4, weight: 2 }}
              />
            ));
          } catch(e) { return null; }
        })()}

        {regions.map((r) => {
          const isBlindspot = !r.sequenced;
          const color = getMarkerColor(r.priority_score);
          const isActive = activeRegion?.id === r.id;
          const isCritical = r.priority_score >= 75;
          const baseRadius = Math.max(7, Math.min(22, 7 + r.priority_score * 0.17));

          // Calculate Dynamic SEIR Threat Spread Radar
          const threatRadiusKm = isCritical && r.population && r.active_cases 
            ? forecastThreatRadius(r.disease, r.active_cases, r.population, 7) 
            : 0;

          return (
            <React.Fragment key={r.id}>
              {/* ── SEIR Projected Threat Radiuses (7-Day Forecast) ── */}
              {isCritical && threatRadiusKm > 0 && (
                <>
                  <Circle center={[Number(r.latitude), Number(r.longitude)]} radius={threatRadiusKm * 1000 * 0.2} pathOptions={{ color: "transparent", fillColor: "#ef4444", fillOpacity: 0.25, interactive: false }} />
                  <Circle center={[Number(r.latitude), Number(r.longitude)]} radius={threatRadiusKm * 1000 * 0.5} pathOptions={{ color: "transparent", fillColor: "#ef4444", fillOpacity: 0.1, interactive: false }} />
                  <Circle center={[Number(r.latitude), Number(r.longitude)]} radius={threatRadiusKm * 1000} pathOptions={{ color: "#ef4444", weight: 1.5, dashArray: "5 5", fillColor: "#ef4444", fillOpacity: 0.03, interactive: false }} />
                </>
              )}

              <CircleMarker
                center={[Number(r.latitude), Number(r.longitude)]}
                radius={isActive ? baseRadius + 3 : baseRadius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: isActive ? 0.25 : (isCritical ? 0.35 : 0.08),
                  weight: isActive ? 3 : 2,
                  dashArray: isBlindspot ? "5 4" : undefined,
                }}
                eventHandlers={{ click: () => onSelect?.(r) }}
              >
                <Popup>
                  <div className="p-2 min-w-[160px]">
                    <div className="font-bold text-xs uppercase tracking-wider text-gray-900 pb-1.5 mb-1.5 border-b border-gray-100">
                      {r.region}
                    </div>
                    <div className="space-y-1 text-[11px] text-gray-600">
                      <div className="flex justify-between">
                        <span>Threat Index</span>
                        <span className="font-semibold text-gray-900">{r.priority_score}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cases</span>
                        <span className="font-semibold text-gray-900">{r.symptom_reports?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sequenced</span>
                        <span className="font-semibold text-gray-900">{r.sequenced ? "Yes" : "No"}</span>
                      </div>
                      {r.disease && (
                        <div className="flex justify-between">
                          <span>Disease</span>
                          <span className="font-semibold text-gray-900 max-w-[80px] truncate text-right">{r.disease}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
