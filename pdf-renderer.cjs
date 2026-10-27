'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
/** Avoid Chromium's data-URL length limit for branded, multi-page reports. */
async function loadPdfDocument(win,html,tempRoot=os.tmpdir()){
 const dir=fs.mkdtempSync(path.join(tempRoot,'balaji-pdf-render-'));
 try {
  const file=path.join(dir,'document.html');fs.writeFileSync(file,html,{encoding:'utf8',mode:0o600});
  await win.loadFile(file);
  await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode())).then(()=>document.fonts.ready).then(()=>true)');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={loadPdfDocument};
