/** Exact owner-approved corrections. Word order is significant. No fuzzy auto merge. */
export const VILLAGE_REVISION = 'approved-2026-10-27-v2';
export const villageKey = (v: unknown) => String(v ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-IN');
export const APPROVED_VILLAGES: { name: string; aliases: string[] }[] = [
 {name:'KHINWARA',aliases:['KHINWAR','KHINAEAR','KHIWADA']},
 {name:'GHENARI',aliases:['GHENRAI','GHEANRI','GHEARI','GHENAR','GHENRI']},
 {name:'DAYALANA KALA',aliases:['DAYLANA KALA','DAYLANA KL A']},
 {name:'DAYALANA KHURD',aliases:['DAYLANA KHURD','DAYALALA KHURD']},
 {name:'GURA JAITAWATAN',aliases:['GUDA JAITAWATAN','GUDA JAITAWAT']},
 {name:'GURA DEOWARA',aliases:['GURA DEWARA','GUDA DEWARA']},
 {name:'RAMA JI GURA',aliases:['RAMAJI GURA','RAMJI GURA','GUDA RAMAJI','RAMAJIGUDA']},
 {name:'AHUWA DEWALI',aliases:['AHUWA DEOLI']},
 {name:'RAIPURIYA',aliases:['RAYPURIYA']},
 {name:'MAGARTALAB',aliases:['MAGARTLAB','MAGRTALAB']},
 {name:'BHIMALIYA',aliases:['BIMALIYA']},
 {name:'BASNI',aliases:['BASANI']},
 {name:'JANUDA',aliases:['JANUDHA','JONUNDA']},
 {name:'KOT SOLANKIYA',aliases:['KOT SOLNKIYA']},
 {name:'SASRI',aliases:['SASRAI']},
 {name:'ISHALI',aliases:['ISALI']},
 {name:'GURA MATA JI',aliases:['MATA JI GURA']},
 {name:'GURA HINDU',aliases:['HINDU JI GURA','GUDA HINDU']},
 {name:'MAMAWAS',aliases:['MAMA WAS','MOMAWAS']},
 {name:'VARDIYA',aliases:['VADIYA']},
 {name:'DHANLA',aliases:['DHARLA']},
 {name:'DHAMALI',aliases:['DHAMLI','DHAML']},
 {name:'RUNGADI',aliases:['RUGARI']},
 {name:'BORDI',aliases:['BOLDI']},
 {name:'BHARI',aliases:['BHAR']},
 {name:'SHAMBHARIYA',aliases:['SAMBHARIYA','SAMRIYA']},
 // DEWALI before AHUWA is a different village from AHUWA before DEWALI.
 {name:'DEWALI AHUWA',aliases:['DEWALI AHUA','AHUA DEOWALI','DEWALI','DEOLI','EWALI']},
 {name:'PANOTA',aliases:['PANTA']},
];
const approved = new Map<string,string>();
// These existing labels differ only by case/spacing, not geography.
for(const label of ['VANDAR','KOLPURA','MEVI KLA','NIPAL','GUDA THAKURJI','GUDA KESARSINGH'])approved.set(label,label);
for (const group of APPROVED_VILLAGES) for (const value of [group.name,...group.aliases]) {
 const key=villageKey(value), old=approved.get(key);
 if(old && old!==group.name) throw Error('Conflicting village alias: '+key);
 approved.set(key,group.name);
}
export const canonicalVillage = (value: unknown): string => approved.get(villageKey(value)) || String(value ?? '').normalize('NFKC').trim().replace(/\s+/g,' ');
export function villageCatalog(patients: {address?:string|null}[], extra: string[] = []) {
 const byKey = new Map<string,string>();
 for (const name of [...APPROVED_VILLAGES.map(x=>x.name),...patients.map(x=>canonicalVillage(x.address)),...extra]) if(villageKey(name)) {
   if(!byKey.has(villageKey(name)))byKey.set(villageKey(name),name);
 }
 return [...byKey.values()].sort((a,b)=>a.localeCompare(b,'hi'));
}
export function resolveVillage(value: string, options: string[]): string | null {
 if(!villageKey(value))return '';
 const canonical=canonicalVillage(value);
 return options.find(v=>villageKey(v)===villageKey(canonical)) ?? null;
}
/** Suggestions only; these never change or merge a saved village. */
export function similarVillages(value: string, options: string[]) {
 const q=villageKey(value);if(!q)return options.slice(0,8);
 const distance=(a:string,b:string)=>{const x=Array.from(a),y=Array.from(b);let prev=Array.from({length:y.length+1},(_,i)=>i);for(let i=0;i<x.length;i++){const next=[i+1];for(let j=0;j<y.length;j++)next.push(Math.min(next[j]+1,prev[j+1]+1,prev[j]+Number(x[i]!==y[j])));prev=next;}return prev[y.length];};
 return options.map(name=>({name,key:villageKey(name)})).map(v=>({...v,score:v.key.includes(q)?0:distance(q,v.key)})).filter(v=>v.score<=(q.length<5?1:2)).sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).slice(0,8).map(v=>v.name);
}
