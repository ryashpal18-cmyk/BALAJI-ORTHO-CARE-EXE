// Patient-facing Hindi bill SMS. Service names come from billing's "name:amount|..." format.
// Never infer a follow-up or cast removal date from a service or an auto-created case.
export function billServiceNames(service: unknown): string[] {
  if (typeof service !== 'string') return [];
  return service.split('|').map(part => part.trim().replace(/:\s*\d+(?:\.\d+)?\s*$/, '').trim()).filter(Boolean);
}

export function isCastRemoval(name: string): boolean {
  const item = /\b(?:cast|plaster|p\.?o\.?p\.?)\b|प्लास्टर|पलस्तर|कास्ट/i;
  const removal = /\b(?:remov(?:e|ed|al|ing)|remve|rmov(?:e|al)?|cut(?:ting)?|off)\b|हटाना|हटाने|हटाया|उतारना|उतारने|उतारा|काटना|काटने|रिमूव/i;
  return item.test(name) && removal.test(name);
}

export function billCareCategory(service: unknown): 'cast' | 'slab' | 'removal' | 'xray' | 'general' {
  const names = billServiceNames(service);
  const active = names.filter(name => !isCastRemoval(name));
  const cast = /(?:\b(?:p\.?u\.?|p\.?o\.?p\.?)\s*(?:cast|plaster)?\b|\b(?:plaster|cast)\b|प्लास्टर|पलस्तर|कास्ट)/i;
  const slab = /\b(?:slab|splint)\b|स्लैब|स्लेब/i;
  // A slab containing "POP" or "plaster" remains a slab.
  if (active.some(name => cast.test(name) && !slab.test(name))) return 'cast';
  if (active.some(name => slab.test(name))) return 'slab';
  if (names.some(isCastRemoval)) return 'removal';
  if (names.some(name => /\bx[ -]?ray\b|एक्स[ -]?रे/i.test(name))) return 'xray';
  return 'general';
}

// WhatsApp uses the welcome alone; text SMS adds the invoice details below.
// Mention the PDF only when this text accompanies an attachment or a fresh PDF link.
export function buildBillWelcomeMessage(patientName?: string, withPdf = false, invoiceDetails: string[] = []): string {
  const name = (patientName || '').replace(/[\r\n]+/g, ' ').trim() || 'मरीज';
  return [
    `नमस्कार ${name} जी,`,
    'BALAJI DIGITAL X-RAY & ORTHO CARE CENTER में आपका हार्दिक स्वागत है।',
    '',
    'अपनी सेहत की देखभाल के लिए हम पर भरोसा करने का धन्यवाद।' +
      (withPdf ? ' आपके बिल का विवरण साथ दी गई PDF में है।' : ''),
    '',
    ...(invoiceDetails.length ? [...invoiceDetails, ''] : []),
    'हम आपके शीघ्र स्वस्थ होने की कामना करते हैं।',
    '',
    'डॉ. एस. एस. राठौड़',
    'संपर्क: 80057 07783',
  ].join('\n');
}

export function buildBillSmsMessage(args: {
  patientName?: string; invoice: string; date: string; service: unknown;
  total: number; discount?: number; paid: number; due: number; followupDate?: string | null;
}): string {
  const services = billServiceNames(args.service);
  const discount = args.discount || 0;
  return buildBillWelcomeMessage(args.patientName, false, [
    'आपके बिल का विवरण:',
    `बिल नं.: ${args.invoice}`,
    `दिनांक: ${args.date}`,
    ...(services.length ? [`सेवा: ${services.join(', ')}`] : []),
    `कुल बिल: ₹${args.total}`,
    `छूट: ₹${discount}`,
    `देय राशि: ₹${Math.max(args.total - discount, 0)}`,
    `जमा: ₹${args.paid}`,
    `बाकी: ₹${args.due}`,
  ]);
}
