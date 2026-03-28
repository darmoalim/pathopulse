"use client";

import { useState, useCallback } from "react";
import { Lock, Eye, EyeOff, X, ShieldCheck, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  onSuccess: (role: "operator", name: string) => void;
  onClose: () => void;
}

export default function LoginModal({ onSuccess, onClose }: Props) {
  const [workerId, setWorkerId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Demo hint state
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, string> = { pin };
      if (workerId.trim()) body.worker_id = workerId.trim().toUpperCase();

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        // Store session token (replaces plain role string)
        localStorage.setItem("pp_token", data.token);
        localStorage.setItem("pp_role", "operator");
        localStorage.setItem("pp_name", data.name || "Operator");
        localStorage.setItem("pp_session_ts", Date.now().toString());
        onSuccess("operator", data.name || "Operator");
      } else {
        setError(data.error || "Invalid credentials. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [pin, workerId, onSuccess]);

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl animate-fade-in-up">

        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-foreground flex items-center justify-center shrink-0">
              <Lock className="size-4 text-background" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Operator Access</h2>
              <p className="text-xs text-muted-foreground mt-0.5">J&K Directorate of Public Health</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5">
          <div className="mb-5 p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-2.5">
            <ShieldCheck className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Authorised field officers and PHC operators only. Enter your Worker ID and access code.
              Leave Worker ID blank to use the admin PIN.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Worker ID Field */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                Worker ID <span className="text-muted-foreground/60 font-normal">(optional for admin)</span>
              </label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  value={workerId}
                  onChange={e => { setWorkerId(e.target.value); setError(""); }}
                  placeholder="e.g. KSH-ASH-00421"
                  className="pl-9 font-mono uppercase"
                  autoFocus
                />
              </div>
            </div>

            {/* PIN Field */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                Access Code
              </label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={e => { setPin(e.target.value); setError(""); }}
                  placeholder="Enter access code..."
                  className="pr-10 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPin ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
            </div>

            <Button type="submit" disabled={loading || !pin} className="w-full text-xs font-semibold uppercase tracking-wider">
              {loading ? (
                <><div className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" /> Authenticating...</>
              ) : (
                <><Lock className="size-3.5" /> Authenticate</>
              )}
            </Button>
          </form>

          {/* Demo hint */}
          <div className="mt-3 text-center">
            <button onClick={() => setShowHint(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors">
              {showHint ? "Hide" : "Demo credentials"}
            </button>
            {showHint && (
              <div className="mt-2 p-2.5 rounded-md bg-muted/50 border border-dashed border-border text-left space-y-1">
                <p className="text-[10px] text-muted-foreground font-mono">Admin PIN: <span className="text-foreground font-bold">PP-ADMIN-2025</span></p>
                <p className="text-[10px] text-muted-foreground font-mono">Worker: <span className="text-foreground font-bold">KSH-ASH-00421</span> / <span className="text-foreground font-bold">pathopulse2025</span></p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 pb-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3" />
          <span>PathoPulse Secure Operations · J&K Genomic Surveillance</span>
        </div>
      </div>
    </div>
  );
}
