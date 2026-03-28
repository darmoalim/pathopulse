"use client";

import { useState, useCallback } from "react";
import { Lock, Eye, EyeOff, X, ShieldCheck, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  onSuccess: (role: "operator") => void;
  onClose: () => void;
}

export default function LoginModal({ onSuccess, onClose }: Props) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.role === "operator") {
        // Store session in localStorage
        localStorage.setItem("pp_role", "operator");
        localStorage.setItem("pp_session_ts", Date.now().toString());
        onSuccess("operator");
      } else {
        setError(data.error || "Invalid operator code. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [pin, onSuccess]);

  return (
    /* Backdrop */
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
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5">
          <div className="mb-5 p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-2.5">
            <ShieldCheck className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This section is restricted to authorised field officers and PHC operators. Enter your operator access code to submit clinical reports.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                Operator Access Code
              </label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={e => { setPin(e.target.value); setError(""); }}
                  placeholder="Enter access code..."
                  className="pr-10 font-mono"
                  autoFocus
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
              {error && (
                <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || !pin}
              className="w-full text-xs font-semibold uppercase tracking-wider"
            >
              {loading ? (
                <><div className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" /> Authenticating...</>
              ) : (
                <><Lock className="size-3.5" /> Authenticate</>
              )}
            </Button>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-5 pb-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Activity className="size-3" />
          <span>PathoPulse Secure Operations · J&K Genomic Surveillance</span>
        </div>
      </div>
    </div>
  );
}
