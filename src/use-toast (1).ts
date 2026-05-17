import { useState } from "react";

export type BodySelection = { body_part: string; side: string };

interface Props {
  value?: BodySelection | null;
  onSelect: (s: BodySelection) => void;
}

const partClass = (active: boolean, hovered: boolean) =>
  `cursor-pointer transition-all duration-200 stroke-foreground/40 ${
    active
      ? "fill-destructive/80"
      : hovered
      ? "fill-primary/40"
      : "fill-muted"
  }`;

export function BodyDiagram({ value, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const isSel = (part: string, side: string) =>
    value?.body_part === part && value?.side === side;

  const mk = (part: string, side: string) => ({
    onClick: () => onSelect({ body_part: part, side }),
    onMouseEnter: () => setHover(`${part}-${side}`),
    onMouseLeave: () => setHover(null),
    className: partClass(isSel(part, side), hover === `${part}-${side}`),
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 400"
        className="w-48 h-auto select-none"
        aria-label="Body diagram"
      >
        {/* Head */}
        <circle cx="100" cy="35" r="22" className="fill-muted stroke-foreground/40" strokeWidth="1.5" />
        {/* Neck */}
        <rect x="92" y="55" width="16" height="12" rx="3" className="fill-muted stroke-foreground/40" strokeWidth="1.5" />
        {/* Torso */}
        <path d="M70 70 Q100 65 130 70 L138 170 Q100 180 62 170 Z" className="fill-muted stroke-foreground/40" strokeWidth="1.5" />
        {/* Pelvis */}
        <path d="M64 170 Q100 178 136 170 L130 210 Q100 218 70 210 Z" className="fill-muted stroke-foreground/40" strokeWidth="1.5" />

        {/* Arms - clickable */}
        <path
          d="M70 75 Q50 90 45 140 Q42 175 50 200 L60 200 Q58 170 62 140 Q65 105 78 95 Z"
          strokeWidth="1.5"
          {...mk("Arm", "Right")}
        />
        <path
          d="M130 75 Q150 90 155 140 Q158 175 150 200 L140 200 Q142 170 138 140 Q135 105 122 95 Z"
          strokeWidth="1.5"
          {...mk("Arm", "Left")}
        />

        {/* Legs - clickable */}
        <path
          d="M72 210 Q70 280 68 380 L88 380 Q92 290 92 215 Z"
          strokeWidth="1.5"
          {...mk("Leg", "Right")}
        />
        <path
          d="M128 210 Q130 280 132 380 L112 380 Q108 290 108 215 Z"
          strokeWidth="1.5"
          {...mk("Leg", "Left")}
        />

        {/* Labels (only when not selected) */}
        <text x="40" y="135" fontSize="8" className="fill-muted-foreground pointer-events-none">R-Arm</text>
        <text x="158" y="135" fontSize="8" className="fill-muted-foreground pointer-events-none">L-Arm</text>
        <text x="62" y="290" fontSize="8" className="fill-muted-foreground pointer-events-none">R-Leg</text>
        <text x="118" y="290" fontSize="8" className="fill-muted-foreground pointer-events-none">L-Leg</text>
      </svg>
      <div className="text-xs text-muted-foreground">
        {value ? (
          <span className="font-medium text-foreground">
            Selected: {value.side} {value.body_part}
          </span>
        ) : (
          "Click a body part to select"
        )}
      </div>
    </div>
  );
}
