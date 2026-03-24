import { useRef, useState, useCallback, useEffect } from "react";
import type { DeliverableFile } from "@/lib/api/types";

interface CompareViewProps {
  files: [DeliverableFile, DeliverableFile];
}

export function CompareView({ files }: CompareViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updatePosition = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      setPosition((x / rect.width) * 100);
    },
    []
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      updatePosition(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      updatePosition(e.touches[0].clientX);
    };
    const onUp = () => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, updatePosition]);

  const [left, right] = files;

  const renderImage = (file: DeliverableFile) =>
    file.preview_url ? (
      <img
        src={file.preview_url}
        alt={file.filename}
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    ) : (
      <span className="text-3xl font-bold text-muted-foreground">
        {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
      </span>
    );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-center px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">{left.filename}</span>
          <span>vs</span>
          <span className="font-medium text-foreground">{right.filename}</span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-col-resize select-none min-h-0"
        onMouseDown={(e) => {
          setDragging(true);
          updatePosition(e.clientX);
        }}
        onTouchStart={(e) => {
          setDragging(true);
          updatePosition(e.touches[0].clientX);
        }}
      >
        {/* Right image (full, behind) */}
        <div className="absolute inset-0 flex items-center justify-center bg-surface p-4">
          {renderImage(right)}
        </div>

        {/* Left image (clipped) */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-surface p-4"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {renderImage(left)}
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 z-10"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        >
          <div className="w-0.5 h-full bg-primary" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <svg
              className="w-4 h-4 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 9l-3 3 3 3M16 9l3 3-3 3"
              />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-3 left-3 bg-black/50 text-white text-[9px] px-2 py-0.5 rounded">
          {left.filename}
        </div>
        <div className="absolute top-3 right-3 bg-black/50 text-white text-[9px] px-2 py-0.5 rounded">
          {right.filename}
        </div>
      </div>
    </div>
  );
}
