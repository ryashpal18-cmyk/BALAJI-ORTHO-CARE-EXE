const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const storage = new Map();
const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) };
function load(file) {
 const exports = {};
 const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,localStorage,crypto:require('node:crypto').webcrypto});
 return exports;
}
const c = load('src/lib/appConfig.ts');
c.upsertServiceProduct('X-Ray','300');c.upsertServiceProduct('Plaster','1300');
assert.equal(c.getServiceCatalog().length,2);
assert.throws(()=>c.upsertServiceProduct('x ray','350'),/पहले से/);
for (const [name,rate] of [['','300'],['X:Ray','300'],['A|B','300'],['Test',''],['Test','NaN'],['Test','-1']]) assert.throws(()=>c.upsertServiceProduct(name,rate));
c.learnServiceItems([{name:'X-Ray',amount:250}]);
assert.equal(c.getServiceCatalog()[0].rate,300);
const id=c.getServiceCatalog()[0].id;c.upsertServiceProduct('X-Ray','350',id);
assert.equal(c.getServiceCatalog()[0].rate,350);
assert.equal(load('src/lib/appConfig.ts').getServiceCatalog()[0].rate,350);
assert.equal(c.serviceSearchKey('X Ray'),c.serviceSearchKey('X-Ray'));
c.saveServiceCatalog(c.getServiceCatalog().filter(p=>p.id!==id));assert.equal(c.getServiceCatalog().length,1);
console.log('PASS saved catalog add/edit/delete, persistence, validation, keyword normalization, stable preset prices');
const sms=load('src/lib/billSmsMessage.ts');
for(const [service,category] of [['PU Cast','cast'],['POP Slab','slab'],['Plaster Slab','slab'],['Cast Removal','removal'],['cast rmove','removal'],['X-Ray','xray']]) assert.equal(sms.billCareCategory(service),category);
console.log('PASS service-specific SMS classifications');
