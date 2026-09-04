import { useState } from "react";
import { categoriesFor } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import type { CategoryGroup, CategoryId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryPicker({
  value,
  group = "gasto",
  onChange,
}: {
  value: CategoryId;
  group?: CategoryGroup;
  onChange: (id: CategoryId) => void;
}) {
  const custom = useFinanceStore((s) => s.customCategories);
  const addCategory = useFinanceStore((s) => s.addCustomCategory);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const cats = categoriesFor(group, custom);

  function save() {
    const label = name.trim();
    if (!label) return;
    const id = addCategory({ label, group });
    onChange(id);
    setName("");
    setCreating(false);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {cats.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "h-9 rounded-full px-3 text-xs font-medium",
            value === c.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
          )}
        >
          {c.label}
        </button>
      ))}
      {creating ? (
        <span className="flex h-9 items-center gap-1 rounded-full bg-line pl-3 pr-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setCreating(false);
                setName("");
              }
            }}
            placeholder="Nome"
            className="w-24 bg-transparent text-xs outline-none"
          />
          <button
            type="button"
            className="h-7 rounded-full bg-primary px-2 text-[11px] font-medium text-primary-fg"
            onClick={save}
          >
            Ok
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-9 rounded-full bg-primary-soft px-3 text-xs font-medium text-primary"
        >
          + Categoria
        </button>
      )}
    </div>
  );
}
