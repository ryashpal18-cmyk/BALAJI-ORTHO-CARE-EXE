import { useState } from "react";

interface CrashScreenProps {
  title: string;
  message: string;
  stack?: string;
  onReload?: () => void;
}

/**
 * Full-screen crash/error display — white-screen ki jagah ye dikhega.
 * Error message + stack trace seedha screen par dikhta hai, copy bhi kar sakte ho.
 */
export function CrashScreen({ title, message, stack, onReload }: CrashScreenProps) {
  const [copied, setCopied] = useState(false);

  const fullText = `${title}\n\n${message}\n\n${stack || ""}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available — ignore */
    }
  };

  const handleReload = () => {
    if (onReload) {
      onReload();
    } else {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#1a0000",
        color: "#ffdddd",
        fontFamily: "monospace",
        padding: "16px",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#ff6b6b", marginBottom: "12px" }}>
        ⚠ App Crash Hua
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          onClick={handleReload}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: "6px",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          🔄 Reload App
        </button>
        <button
          onClick={handleCopy}
          style={{
            background: "#374151",
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: "6px",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          {copied ? "✓ Copied" : "📋 Copy Error"}
        </button>
      </div>

      <div style={{ fontSize: "14px", fontWeight: "bold", color: "#ffa5a5", marginBottom: "6px" }}>
        {title}
      </div>

      <div
        style={{
          background: "#000",
          padding: "10px",
          borderRadius: "6px",
          fontSize: "13px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          marginBottom: "12px",
          border: "1px solid #4d1a1a",
        }}
      >
        {message}
      </div>

      {stack && (
        <>
          <div style={{ fontSize: "12px", color: "#ff9999", marginBottom: "6px" }}>Stack trace:</div>
          <div
            style={{
              background: "#000",
              padding: "10px",
              borderRadius: "6px",
              fontSize: "11px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#ffbbbb",
              border: "1px solid #4d1a1a",
            }}
          >
            {stack}
          </div>
        </>
      )}

      <div style={{ marginTop: "16px", fontSize: "11px", color: "#888" }}>
        Ye message Claude ko bhej do (Copy Error button se), isi se exact fix mil jayega.
      </div>
    </div>
  );
}
