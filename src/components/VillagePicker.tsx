import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { canonicalVillage, resolveVillage, similarVillages, villageKey } from '@/lib/villageNames';
export function VillagePicker({value,onChange,options,allowNew,onAdd,disabled=false}:{value:string;onChange:(v:string)=>void;options:string[];allowNew:boolean;onAdd:(v:string)=>void;disabled?:boolean}) {
 const [focused,setFocused]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
 const match=resolveVillage(value,options),suggestions=useMemo(()=>similarVillages(value,options),[value,options]);
 return <div className="space-y-2"><Input disabled={disabled} aria-label="गाँव चुनें" placeholder="गाँव लिखकर सूची से चुनें" value={value} onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),120)} onChange={e=>{onChange(e.target.value);setFocused(true);setConfirm(false);setError('')}} onKeyDown={e=>{if(e.key==='Escape'){setFocused(false);setConfirm(false)}if(e.key==='Enter'){e.preventDefault();if(match!==null){onChange(match);setFocused(false)}else setFocused(true)}}}/>
 {focused && suggestions.length>0 && <div className="max-h-40 overflow-y-auto rounded border bg-card" role="listbox" aria-label="गाँव के सुझाव">{suggestions.map(v=><button key={villageKey(v)} type="button" role="option" aria-selected={match===v} className="block w-full px-3 py-2 text-left hover:bg-muted" onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(v);setFocused(false);setConfirm(false)}}>{v}</button>)}</div>}
 {villageKey(value) && match===null && <div className="text-sm text-amber-700"><p>यह नाम सूची में नहीं है। पहले मिलते-जुलते नाम जाँचें।</p>{allowNew && (!confirm?<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>setConfirm(true)}>नया गाँव जोड़ें</Button>:<div className="rounded border p-2"><p>नया गाँव: <b>{canonicalVillage(value)}</b></p><p className="text-xs">इसे अलग गाँव के रूप में जोड़ना है?</p><Button type="button" size="sm" disabled={disabled} onClick={()=>{try{const v=canonicalVillage(value);onAdd(v);onChange(v);setError('');setConfirm(false);setFocused(false)}catch{setError('गाँव सेव नहीं हुआ। फिर कोशिश करें।')}}}>हाँ, यह नया गाँव है</Button></div>)}</div>}
 {error && <p role="alert">{error}</p>}
 </div>;
}
