import {useState,useMemo} from 'react';
import {villageCatalog,canonicalVillage,villageKey} from './villageNames';
const KEY='bocc_village_catalog_v1';
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch{return[]}}
export function useVillageCatalog(patients:{address?:string|null}[]){
 const [extra,setExtra]=useState<string[]>(read);
 const options=useMemo(()=>villageCatalog(patients,extra),[patients,extra]);
 const add=(value:string)=>{const clean=canonicalVillage(value);if(!villageKey(clean)||clean.length>200)throw Error('गाँव का सही नाम भरें');const next=Array.from(new Map([...extra,clean].map(v=>[villageKey(v),v])).values());localStorage.setItem(KEY,JSON.stringify(next));setExtra(next)};
 return {options,add};
}
