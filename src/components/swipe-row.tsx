import { useRef, useState, type ReactNode } from "react";

const THRESHOLD = 72;

export function SwipeRow({
  children,
  onDelete,
}: {
  children: ReactNode;
  onDelete: () => void;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dxRef = useRef(0);
  const moved = useRef(false);
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState(false);

  function finish() {
    const gone = dxRef.current < -THRESHOLD;
    axis.current = null;
    dxRef.current = 0;
    setDx(0);
    setArmed(false);
    if (gone) onDelete();
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-end bg-danger px-4 text-xs font-medium text-primary-fg"
        aria-hidden
      >
        Apagar
      </div>
      <div
        className="relative bg-elevated"
        style={{
          transform: `translateX(${dx}px)`,
          transition: armed ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          startX.current = e.clientX;
          startY.current = e.clientY;
          axis.current = null;
          moved.current = false;
          setArmed(true);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!armed) return;
          const mx = e.clientX - startX.current;
          const my = e.clientY - startY.current;
          if (!axis.current) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            axis.current = Math.abs(mx) > Math.abs(my) ? "h" : "v";
          }
          if (axis.current !== "h") return;
          moved.current = true;
          const next = Math.min(0, Math.max(mx, -112));
          dxRef.current = next;
          setDx(next);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
