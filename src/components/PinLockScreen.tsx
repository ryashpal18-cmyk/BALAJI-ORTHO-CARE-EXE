import { useState, useEffect, useRef } from "react";
import { Lock, Delete } from "lucide-react";
import { verifyPin, markActive } from "@/lib/pinLock";
import logo from "@/assets/logo.png";

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const attemptingRef = useRef(false);

  useEffect(() => {
    if (pin.length >= 4 && !attemptingRef.current) {
      attemptingRef.current = true;
      verifyPin(pin).then((ok) => {
        if (ok) {
          markActive();
          onUnlock();
        } else {
          setError(true);
          setShake(true);
          setTimeout(() => { setPin(""); setShake(false); attemptingRef.current = false; }, 500);
        }
      });
    }
  }, [pin, onUnlock]);

  const press = (digit: string) => {
    setError(false);
    if (pin.length < 6) setPin((p) => p + digit);
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(160deg, #0f2748 0%, #16395f 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "24px", color: "white",
    }}>
      <img src={logo} alt="Balaji" style={{ height: "56px", width: "56px", borderRadius: "14px" }} />
      <div style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 700, fontSize: "16px" }}>Balaji Ortho Care — Locked</p>
        <p style={{ fontSize: "12px", opacity: 0.6, marginTop: "4px" }}>
          <Lock style={{ display: "inline", width: 12, height: 12, marginRight: 4 }} />
          PIN dalkar unlock karo
        </p>
      </div>

      <div
        style={{
          display: "flex", gap: "12px",
          animation: shake ? "shake 0.4s" : undefined,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.4)",
            background: i < pin.length ? (error ? "#ef4444" : "white") : "transparent",
          }} />
        ))}
      </div>
      {error && <p style={{ fontSize: "12px", color: "#ef4444" }}>Galat PIN, dobara try karo</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: "14px", marginTop: "8px" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} style={numBtnStyle}>{d}</button>
        ))}
        <div />
        <button onClick={() => press("0")} style={numBtnStyle}>0</button>
        <button onClick={backspace} style={numBtnStyle}><Delete style={{ width: 20, height: 20, margin: "0 auto" }} /></button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}

const numBtnStyle: React.CSSProperties = {
  width: 64, height: 64, borderRadius: "50%",
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  color: "white", fontSize: "20px", fontWeight: 600, cursor: "pointer",
};
