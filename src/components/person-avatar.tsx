import type { Person, PersonColor } from "@/lib/types";
import { cn } from "@/lib/utils";

const colorClass: Record<PersonColor, string> = {
  p1: "bg-p1",
  p2: "bg-p2",
  p3: "bg-p3",
  p4: "bg-p4",
  p5: "bg-p5",
};

export function PersonAvatar({
  person,
  size = "md",
}: {
  person: Person;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-12 text-lg" : "size-9 text-sm";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium text-primary-fg",
        colorClass[person.color],
        dim,
      )}
      aria-hidden
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function personColorClass(color: PersonColor) {
  return colorClass[color];
}
