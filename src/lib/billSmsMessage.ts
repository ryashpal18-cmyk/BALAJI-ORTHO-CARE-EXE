// Patient-facing Hindi bill SMS. Service names come from billing's "name:amount|..." format.
// Never infer a follow-up or cast removal date from a service or an auto-created case.
export function billServiceNames(service: unknown): string[] {
  if (typeof service !== 'string') return [];
  return service.split('|').map(part => part.trim().replace(/:\s*\d+(?:\.\d+)?\s*$/, '').trim()).filter(Boolean);
}

function isCastRemoval(name: string): boolean {
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

export function buildBillSmsMessage(args: {
  patientName?: string; invoice: string; date: string; service: unknown;
  total: number; discount?: number; paid: number; due: number; followupDate?: string | null;
}): string {
  const name = (args.patientName || 'मरीज').trim();
  const names = billServiceNames(args.service);
  const category = billCareCategory(args.service);
  const heading = 'बालाजी डिजिटल एक्स-रे एवं ऑर्थो केयर सेंटर';
  const lines = [
    `नमस्ते ${name} जी,`, heading,
    `बिल संख्या: ${args.invoice}`,
    `दिनांक: ${args.date}`,
    ...(names.length ? [`सेवा: ${names.join(', ')}`] : []),
    `कुल राशि: ₹${args.total}`,
    ...(args.discount ? [`छूट: ₹${args.discount}`, `देय राशि: ₹${Math.max(args.total - args.discount, 0)}`] : []),
    `जमा राशि: ₹${args.paid}`,
    `बकाया राशि: ₹${args.due}`,
  ];
  if (category === 'cast' || category === 'slab') {
    lines.push('', category === 'slab' ? 'स्लैब की देखभाल:' : 'प्लास्टर की देखभाल:',
      'इसे सूखा रखें। डॉक्टर की सलाह के बिना प्रभावित अंग पर वजन न डालें।',
      'तेज दर्द, सुन्नपन या उँगलियों का रंग बदलने पर तुरंत चिकित्सा सहायता लें।');
  }
  if (names.some(isCastRemoval)) {
    lines.push('', 'प्लास्टर/कास्ट हटाने की सेवा:',
      'आज आपके प्लास्टर/कास्ट हटाने की सेवा का बिल दर्ज हुआ है।',
      'आगे की देखभाल के लिए अपने डॉक्टर के निर्देशों का पालन करें।');
  }
  // Only an explicitly provided, clinically confirmed follow-up date is included.
  if (args.followupDate?.trim()) lines.push(`डॉक्टर द्वारा निर्धारित फॉलोअप: ${args.followupDate.trim()}`);
  lines.push('', 'आपके शीघ्र स्वस्थ होने की कामना करते हैं।', 'बालाजी ऑर्थो केयर टीम');
  return lines.join('\n');
}
