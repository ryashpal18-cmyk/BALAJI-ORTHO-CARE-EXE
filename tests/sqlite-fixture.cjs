'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),{DatabaseSync}=require('node:sqlite');
class Adapter{constructor(file){this.db=new DatabaseSync(file);this.depth=0;}pragma(s){this.db.exec('PRAGMA '+s);}exec(s){this.db.exec(s);}close(){this.db.close();}prepare(s){const q=this.db.prepare(s);return{all:(...a)=>q.all(...a),get:(...a)=>q.get(...a),run:(...a)=>q.run(...a)};}transaction(fn){return(...args)=>{const id='fixture'+(++this.depth);this.db.exec('SAVEPOINT '+id);try{const r=fn(...args);this.db.exec('RELEASE '+id);return r;}catch(e){this.db.exec('ROLLBACK TO '+id);this.db.exec('RELEASE '+id);throw e;}finally{--this.depth;}};}}
function createStore(){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sqlite-store.cjs'),'utf8'),{module,require:n=>n==='better-sqlite3'?Adapter:n==='./logger.cjs'?{logInfo(){},logError(){}}:require(n)});return module.exports;}
module.exports={Adapter,createStore};
