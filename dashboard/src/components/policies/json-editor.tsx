import { useState } from "react";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function JsonEditor({ value, onChange }: JsonEditorProps) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(raw: string) {
    onChange(raw);
    try {
      JSON.parse(raw);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 bg-surface text-text-primary font-mono text-xs p-4 resize-none border-none outline-none"
        spellCheck={false}
      />
      {error && (
        <div className="px-4 py-1.5 bg-stage-rejected/10 text-stage-rejected text-[10px]">
          {error}
        </div>
      )}
    </div>
  );
}
