import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "@/context/app-context";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const STARTER_PROMPT = `Submit the two SVGs from @.aros/demo to AROS for review`;

export function OnboardingModal() {
  const { state, selectDeliverable } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const show = searchParams.has("onboard");
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevQueueLen = useRef<number | null>(null);
  const initialLoadDone = useRef(false);

  // Auto-close when a NEW review arrives — navigate to it
  useEffect(() => {
    if (!show || dismissed) return;

    if (!initialLoadDone.current) {
      if (!state.loading) {
        prevQueueLen.current = state.queue.length;
        initialLoadDone.current = true;
      }
      return;
    }

    if (prevQueueLen.current !== null && state.queue.length > prevQueueLen.current) {
      handleClose();
      navigate(`/review`);
      selectDeliverable(state.queue[state.queue.length - 1].id);
    }
    prevQueueLen.current = state.queue.length;
  }, [state.queue.length, state.loading, show, dismissed, navigate, selectDeliverable, state.queue]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(STARTER_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleClose = useCallback(() => {
    setDismissed(true);
    // Remove ?onboard from URL
    searchParams.delete("onboard");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!show || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg w-[560px] max-h-[90vh] flex flex-col shadow-lg mx-4">
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-base font-semibold">Paste this into Claude Code</h3>
        </div>

        <div className="px-6 py-3">
          <div className="relative group">
            <pre className="bg-muted border border-border rounded-md px-4 py-3 pr-12 text-sm whitespace-pre-wrap break-words font-mono leading-relaxed">
              {STARTER_PROMPT}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-stage-approved" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stage-human opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-stage-human" />
            </span>
            Waiting for a review to come in...
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleClose} className="cursor-pointer text-muted-foreground">
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
