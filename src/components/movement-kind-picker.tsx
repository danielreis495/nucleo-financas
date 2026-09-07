import { NATURE_LABEL, natureOf } from "@/lib/movement-nature";
import type { TxNature, TxType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MovementKindPicker({
  type,
  nature,
  onChange,
}: {
  type: TxType;
  nature?: TxNature;
  onChange: (next: { type: TxType; nature: TxNature }) => void;
}) {
  const currentNature = natureOf({ nature });
  const options: { label: string; type: TxType; nature: TxNature }[] = [
    { label: "Gasto", type: "expense", nature: "budget" },
    { label: "Entrada", type: "income", nature: "budget" },
    { label: NATURE_LABEL.transfer, type, nature: "transfer" },
    { label: "Investimento", type, nature: "investment" },
    { label: "Pgto. de fatura", type: "expense", nature: "card_payment" },
    { label: "Crédito / financiamento", type, nature: "financing" },
    { label: "Fora do orçamento", type, nature: "neutral" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active =
          option.nature === "budget"
            ? currentNature === "budget" && type === option.type
            : currentNature === option.nature;
        return (
          <button
            key={`${option.nature}-${option.type}-${option.label}`}
            type="button"
            onClick={() => onChange({ type: option.type, nature: option.nature })}
            className={cn(
              "min-h-9 rounded-full px-3 py-1.5 text-xs font-medium",
              active ? "bg-primary text-primary-fg" : "bg-line text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
