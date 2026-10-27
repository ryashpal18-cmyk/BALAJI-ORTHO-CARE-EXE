'use strict';
const fs=require('fs'),path=require('path');
async function buildFixture(root){
 const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite',{paths:[root]}))]}));
 const stubs={
  '@/components/DashboardLayout':`export const DashboardLayout=({children})=><main>{children}</main>;`,
  '@/hooks/useDatabase':`const mutation={isPending:false,mutate(){window.fixture.writes++},async mutateAsync(){window.fixture.writes++;return{smsQueued:false}}};export const useBills=()=>({data:window.fixture.bills,isLoading:false});export const usePatients=()=>({data:window.fixture.patients});export const useAddBill=()=>mutation;export const useUpdateBill=()=>mutation;export const useDeleteBill=()=>mutation;`,
  '@/hooks/useDoctors':`const data=[];export const useDoctors=()=>({data});`,
  '@/hooks/useOrtho':`export const useAddFractureCase=()=>({mutateAsync:async()=>{window.fixture.writes++}});`,
  '@/hooks/useIsAdmin':`export const useIsAdmin=()=>({isAdmin:true});`,
  '@/hooks/use-toast':`export const toast=()=>{};`,
  '@/integrations/supabase/client':`export const supabase={};`,
  '@/lib/offlineSync':`export const isOnline=async()=>false;`,
  '@/lib/clientLogger':`export const cLog={error(){},warn(){},info(){}};`,
  '@/pages/WhatsApp':`export const openWhatsAppWeb=()=>{window.fixture.writes++};`,
  'qrcode':`export default {toDataURL:async()=>''};`,
  'html2pdf.js':`export default ()=>{};`,
  'xlsx':`export const utils={json_to_sheet:rows=>{window.fixture.exported=rows;return{}},book_new:()=>({}),book_append_sheet(){}};export const writeFile=()=>{};`,
 };
 const bundle=await esbuild.build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Billing from './src/pages/Billing';import{businessDate}from'./src/lib/businessDate';const time=new Date(businessDate()+'T12:00:00+05:30');const patients=Array.from({length:1501},(_,i)=>({id:'p-'+i,name:'Synthetic Patient '+i,mobile:String(9000000000+i),created_at:new Date(time.getTime()-i*1000).toISOString()}));const bills=patients.map((p,i)=>({id:'bill-'+i,patient_id:p.id,patients:p,created_at:p.created_at,service:'Test:660',amount:660,discount:60,amount_paid:600,status:'Paid'}));window.fixture={patients,bills,writes:0,exported:[],tallies:0};createRoot(document.getElementById('root')).render(<MemoryRouter><Billing/></MemoryRouter>);`},bundle:true,write:false,jsx:'automatic',plugins:[{name:'synthetic-billing',setup(build){
 build.onResolve({filter:/^(@\/|qrcode$|xlsx$|html2pdf\.js$)/},a=>{
  if(stubs[a.path])return{path:a.path,namespace:'fixture'};
  const p=path.join(root,'src',a.path.slice(2));return{path:[p,p+'.ts',p+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())};
 });
 build.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));
 build.onLoad({filter:/collectionReport\.ts$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace('export function cashTallyForPeriod(bills: any[], fromDate: string, toDate: string) {','export function cashTallyForPeriod(bills: any[], fromDate: string, toDate: string) { window.fixture.tallies++;'),loader:'ts'}));
 }}]});return bundle.outputFiles[0].text;
}
async function verifyBillingUI(){
 const check=(v,msg)=>{if(!v)throw Error(msg)},wait=()=>new Promise(r=>setTimeout(r,60)),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const input=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
 for(let i=0;i<100&&!document.querySelector('tbody tr');i++)await wait();
 check(document.querySelectorAll('tbody tr').length===50,'Must render only 50 of 1501 bills');
 check(document.querySelector('[aria-label="Bill list page"]').textContent.includes('1501'),'Total must include every matching bill');
 button('अगला पेज').click();await wait();check(document.querySelector('tbody').textContent.includes('Synthetic Patient 50'),'Next page must reach later bills');
 button('Excel Export').click();await wait();check(window.fixture.exported.length===1501,'Excel export must retain all matching bills, not just visible page');
 button('New Bill').click();await wait();
 const tallyCount=window.fixture.tallies;
 const search=document.querySelector('input[placeholder="🔍 Type name or mobile number..."]');check(search,'Patient search field');
 input(search,'Synthetic Patient 1500');await wait();
 let dialog=document.querySelector('[role="dialog"]');dialog.querySelector('[role="combobox"]').click();await wait();
 check(document.querySelector('[role="listbox"]').textContent.includes('Synthetic Patient 1500'),'Search must find patient outside first 50');
 check(document.querySelectorAll('[role="option"]').length<=51,'Patient options must be bounded');
 [...document.querySelectorAll('[role="option"]')].find(n=>n.textContent.includes('Synthetic Patient 1500')).click();await wait();
 input(document.querySelector('[aria-label="Service 1 name"]'),'Synthetic service');await wait();
 input(document.querySelector('[aria-label="Service 1 rate"]'),'660');await wait();
 check(window.fixture.tallies===tallyCount,'Typing into form must not recalculate whole-clinic cash tally');
 check(window.fixture.writes===0,'Performance checks must not save bills or send messages');
 return {bills:1501,renderedRows:document.querySelectorAll('tbody tr').length,exported:window.fixture.exported.length,tallyRecalculationsWhileTyping:window.fixture.tallies-tallyCount,writes:window.fixture.writes};
}
module.exports={buildFixture,verifyBillingUI};
