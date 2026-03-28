"use client";

import { useState } from "react";
import { BadgeCheck, SendHorizontal, Sparkles } from "lucide-react";

import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

const TRANSFORM_OPTIONS = [
  {
    label: "Summarize",
    icon: Sparkles,
    color: "text-amber-500",
    bg: "bg-amber-100",
  },
  {
    label: "Clinical Tone",
    icon: BadgeCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
] as const;

type PromptSubmitPayload = {
  text: string;
  transform: string | null;
};

interface RuixenPromptBoxProps {
  placeholder?: string;
  onSubmit?: (payload: PromptSubmitPayload) => void;
}

export default function RuixenPromptBox({
  placeholder = "Add report notes...",
  onSubmit,
}: RuixenPromptBoxProps) {
  const [input, setInput] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 180,
  });

  const currentOption = TRANSFORM_OPTIONS.find((o) => o.label === selectedOption);

  const handleSend = () => {
    if (!input.trim() && !selectedOption) return;
    onSubmit?.({
      text: input.trim(),
      transform: selectedOption,
    });
    setInput("");
    setSelectedOption(null);
    adjustHeight(true);
  };

  return (
    <div className="w-full space-y-3">
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {currentOption && (
          <div
            className={cn(
              "absolute -top-3 left-4 rounded-md px-2 py-0.5 text-xs font-medium shadow-sm",
              currentOption.bg,
              currentOption.color,
            )}
          >
            <currentOption.icon className="mr-1 inline-block h-3.5 w-3.5" />
            {currentOption.label}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className={cn(
            "min-h-[60px] max-h-[180px] w-full resize-none border-none bg-transparent px-0 py-0",
            "text-sm text-slate-700 focus:ring-0",
          )}
        />

        <div className="absolute bottom-3 right-4">
          <button
            onClick={handleSend}
            className={cn(
              "rounded-full p-2 transition-all duration-200",
              input || selectedOption
                ? "bg-sky-600 text-white hover:bg-sky-700"
                : "cursor-not-allowed bg-slate-200 text-slate-500",
            )}
            disabled={!input && !selectedOption}
            type="button"
            aria-label="Send note"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRANSFORM_OPTIONS.map(({ label, icon: Icon, color }) => {
          const isSelected = label === selectedOption;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelectedOption(isSelected ? null : label)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                isSelected
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              <Icon className={cn("h-4 w-4", color)} />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
