import { useId } from "react";

type IconKind = "patient" | "patients" | "bill" | "calendar" | "collection";

export function ClinicHologramIcon({ kind }: { kind: IconKind }) {
  const id = useId();
  const glass = `url(#${id}-glass)`;
  const sphere = `url(#${id}-sphere)`;

  return (
    <svg className="clinic-hologram-icon" viewBox="0 0 112 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#d8fbff" stopOpacity=".8" />
          <stop offset=".31" stopColor="currentColor" stopOpacity=".43" />
          <stop offset=".69" stopColor="#09242f" stopOpacity=".92" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".66" />
        </linearGradient>
        <radialGradient id={`${id}-sphere`} cx=".32" cy=".19" r=".86">
          <stop stopColor="#eeffff" />
          <stop offset=".22" stopColor="currentColor" stopOpacity=".76" />
          <stop offset=".69" stopColor="#103344" />
          <stop offset="1" stopColor="currentColor" />
        </radialGradient>
      </defs>
      <ellipse cx="56" cy="83" rx="49" ry="11" fill="currentColor" fillOpacity=".09" stroke="currentColor" strokeOpacity=".4" />
      <ellipse cx="56" cy="83" rx="39" ry="7.5" fill="none" stroke="currentColor" strokeOpacity=".76" />
      <g fill={glass} stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round">
        {(kind === "patient" || kind === "patients") && <>
          {kind === "patients" && <>
            <path d="M14 68q0-20 19-20t19 20q-18 8-38 0M60 68q0-20 19-20t19 20q-18 8-38 0" />
            <circle cx="33" cy="36" r="11" fill={sphere} />
            <circle cx="79" cy="36" r="11" fill={sphere} />
          </>}
          <path d="M30 73q0-25 26-27 25 2 25 26-26 10-51 1Z" />
          <path d="M34 68q4-17 15-18" fill="none" stroke="#d4fcff" strokeOpacity=".64" />
          <circle cx="56" cy="29" r="16" fill={sphere} />
          {kind === "patient" && <>
            <circle cx="80" cy="63" r="15" fill={sphere} />
            <path d="M80 55v16m-8-8h16" fill="none" stroke="#e5feff" strokeWidth="2.7" strokeLinecap="round" />
          </>}
        </>}
        {kind === "bill" && <>
          <path d="M38 16h44q7 0 8 8v14h-13l-6 42-10-6-10 5-10-6-11 4-7-4Z" />
          <path d="m32 25-8 45q-1 7-6 8l10-3 11 5 10-5 10 5 11-6 5 3 9-52q1-7 5-7H43q-9 0-11 7Z" />
          <path d="M39 31h35M37 41h30M42 51h15m-12 0q14 8-4 10l12 10M41 56h15" fill="none" stroke="#dcffff" strokeWidth="2.25" strokeLinecap="round" />
        </>}
        {kind === "calendar" && <>
          <rect x="23" y="24" width="68" height="54" rx="8" fill="#30294f" />
          <rect x="19" y="21" width="67" height="54" rx="8" />
          <path d="M20 36h65" fill="none" />
          <rect x="33" y="13" width="7" height="17" rx="3.5" fill={sphere} />
          <rect x="66" y="13" width="7" height="17" rx="3.5" fill={sphere} />
          {[29, 46, 63].map(x => <g key={x}><rect x={x} y="44" width="10" height="8" rx="1" /><rect x={x} y="57" width="10" height="8" rx="1" /></g>)}
        </>}
        {kind === "collection" && <>
          <path d="M38 30h38v36c0 12-38 12-38 0Z" />
          <ellipse cx="57" cy="29" rx="19" ry="7" />
          <path d="M38 43c0 9 38 9 38 0M38 54c0 9 38 9 38 0" fill="none" />
          <path d="M18 55h34v20c0 9-34 9-34 0Z" />
          <ellipse cx="35" cy="55" rx="17" ry="6" />
          <path d="M18 65c0 9 34 9 34 0" fill="none" />
          <circle cx="77" cy="64" r="19" fill={sphere} />
          <circle cx="77" cy="64" r="15.5" fill="none" strokeOpacity=".55" />
          <path d="M70 56h15m-12 0q13 6-3 10l11 10M70 61h15" stroke="#e4ffff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>}
      </g>
    </svg>
  );
}
