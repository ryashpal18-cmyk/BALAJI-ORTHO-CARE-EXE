import { useState, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VoiceInputButtonProps {
  /** Jab bhi naya text bole, ye callback fire hota hai (append karna ya replace karna caller decide kare) */
  onResult: (text: string) => void;
  lang?: string; // default "hi-IN" — Hindi/Hinglish ke liye best
  className?: string;
}

/**
 * Mic button — kahin bhi drop karo (Prescription.tsx, Billing notes, Ortho notes, etc).
 * Example:
 *   <VoiceInputButton onResult={(text) => setNotes(prev => prev + " " + text)} />
 *
 * Browser support: Chrome/Edge (Web Speech API). Electron Chromium me bhi kaam karta hai.
 * Agar browser support nahi karta to button disabled dikhega.
 */
export function VoiceInputButton({ onResult, lang = "hi-IN", className }: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      if (event.error === "not-allowed") {
        toast({ title: "Microphone permission do", variant: "destructive" });
      } else if (event.error !== "no-speech") {
        toast({ title: "Voice input fail hua, dobara try karo", variant: "destructive" });
      }
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      try { recognition.stop(); } catch { /* ignore */ }
    };
  }, [lang, onResult, toast]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        /* already started — ignore */
      }
    }
  };

  if (!supported) return null; // gracefully hide on unsupported browsers

  return (
    <Button
      type="button"
      size="sm"
      variant={listening ? "default" : "outline"}
      onClick={toggleListening}
      className={className}
      title={listening ? "Bol rahe ho... rokne ke liye click karo" : "Bol kar likho (voice input)"}
    >
      {listening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
