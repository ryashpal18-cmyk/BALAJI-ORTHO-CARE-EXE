import { useEffect, useState } from 'react';
import { businessDate } from '@/lib/businessDate';
export function useBusinessToday() {
 const [today,setToday]=useState(businessDate());
 useEffect(()=>{const update=()=>setToday(businessDate());const timer=setInterval(update,15000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
 return today;
}
