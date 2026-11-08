import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function FamilyDeepLinks(){
  const navigate=useNavigate();
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      if(document.hidden)return;
      try{
        const bridge=(window as any).electron;
        if(!bridge?.whatsapp)return;
        const auth=await bridge.checkAuth();
        if(!auth.valid||auth.principal?.role!=='admin')return;
        const id=await bridge.whatsapp.pendingFamily();
        if(active&&id&&/^[a-zA-Z0-9_-]{1,100}$/.test(id))navigate('/family-profile/'+id);
      }catch{}
    };
    const visible=()=>{if(!document.hidden)void check();};
    void check();
    const timer=setInterval(check,10000);
    document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[navigate]);
  return null;
}
