'use strict';
const fs=require('fs'),ts=require('typescript'),path=require('path');
const root=__dirname;
const result=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/invoiceTemplate.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
fs.writeFileSync(path.join(root,'invoice-template.cjs'),result.outputText);
fs.writeFileSync(path.join(root,'village-names.cjs'),ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/villageNames.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);

fs.writeFileSync(path.join(root,'backup-shape.cjs'),ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/backupShape.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
