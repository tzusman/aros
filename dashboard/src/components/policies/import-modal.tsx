import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface ImportItem {
  name: string;
  version: string;
  description: string;
  tags?: string[];
}

interface ImportModalProps {
  title: string;
  items: ImportItem[];
  alreadyAdded: Set<string>;
  onAdd: (name: string) => void;
  onClose: () => void;
}

export function ImportModal({ title, items, alreadyAdded, onAdd, onClose }: ImportModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg w-[520px] max-h-[500px] flex flex-col shadow-lg mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No results</p>
          )}
          {filtered.map((item) => {
            const added = alreadyAdded.has(item.name);
            return (
              <div
                key={item.name}
                className={`flex items-center justify-between px-3 py-2.5 rounded-md mb-0.5 ${
                  added ? "opacity-40" : "hover:bg-muted cursor-pointer"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">v{item.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {item.tags.map((t) => (
                        <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {added ? (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">already added</span>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onAdd(item.name)}
                    className="cursor-pointer text-xs ml-2 shrink-0"
                  >
                    + Add
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
