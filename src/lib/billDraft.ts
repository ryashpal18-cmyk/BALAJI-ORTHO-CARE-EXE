export function draftKey() { return 'bocc_bill_draft:'+encodeURIComponent(localStorage.getItem('userName')||'admin')+':'+(localStorage.getItem('bocc_selected_branch')||'clinic'); }
export function readBillDraft() { try { const x=JSON.parse(localStorage.getItem(draftKey())||'null');return x?.version===1 && Array.isArray(x.services) && x.services.length<=100 ? x : null; } catch { return null; } }
export function saveBillDraft(data:any) { localStorage.setItem(draftKey(),JSON.stringify({version:1,...data,savedAt:new Date().toISOString()})); }
export function clearBillDraft() { localStorage.removeItem(draftKey()); }
