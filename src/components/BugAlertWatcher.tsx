import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// ✅ main.js background mein log files check karta rehta hai — agar koi
// error 50+ baar repeat ho jaaye, ye component wahi "Bill Saved" jaisa
// in-app toast dikhata hai, "View More" button ke saath. Click karne pe
// poori detail (source file, root cause, fix, raw log) ek .txt file mein
// khul jaati hai.
export function BugAlertWatcher() {
  useEffect(() => {
    const w = window as any;
    if (!w.electron?.on) return; // browser mode — skip

    const handler = (payload: { title: string; body: string; detailPath: string }) => {
      toast({
        title: payload.title,
        description: payload.body,
        variant: "destructive",
        action: (
          <ToastAction
            altText="View More"
            onClick={() => w.electron?.openBugDetail?.(payload.detailPath)}
          >
            View More
          </ToastAction>
        ),
      });
    };

    w.electron.on("bug-detected", handler);
    return () => { w.electron?.removeAllListeners?.("bug-detected"); };
  }, []);

  return null;
}
