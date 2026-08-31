import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthTitle } from "@/lib/money";
import { addMonthsKey } from "@/lib/utils";
import { Button } from "./ui/button";

export function MonthHeader({
  month,
  onChange,
  kicker,
}: {
  month: string;
  onChange: (next: string) => void;
  kicker?: string;
}) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-6 pb-2">
      <div>
        {kicker ? (
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{kicker}</p>
        ) : null}
        <h1 className="font-display text-3xl leading-tight tracking-tight text-fg">{formatMonthTitle(month)}</h1>
      </div>
      <div className="flex gap-1">
        <Button
          variant="secondary"
          size="icon"
          className="size-10"
          aria-label="Mês anterior"
          onClick={() => onChange(addMonthsKey(month, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="size-10"
          aria-label="Próximo mês"
          onClick={() => onChange(addMonthsKey(month, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
