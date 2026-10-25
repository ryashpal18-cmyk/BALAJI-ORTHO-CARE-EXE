import { writeReportDocument } from "./safeReportHtml";
export async function printPatientLetterpad(html: string) {
  const native = (window as any).electron;
  if (native?.print) {
    const result = await native.print(html, { patientLetterpad: true });
    if (result?.success === false) throw new Error(result.error || "प्रिंट नहीं खुला।");
    return;
  }
  const win = window.open("", "_blank");
  if (!win) throw new Error("Print window blocked. Pop-up allow करें।");
  writeReportDocument(win, html);
  await win.document.fonts.ready;
  const images = Array.from(win.document.images);
  await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("लेटरपैड image लोड नहीं हुई।")); })));
  win.focus(); win.print();
}
