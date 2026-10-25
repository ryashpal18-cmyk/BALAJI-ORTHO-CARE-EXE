'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const localRequire = createRequire(require('node:path').resolve('package.json'));
const safeCode = ts.transpileModule(fs.readFileSync('src/lib/safeReportHtml.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const safe = { exports: {} };
vm.runInNewContext(safeCode, { exports: safe.exports, require: localRequire });
const code = ts.transpileModule(fs.readFileSync('src/lib/letterpadPrint.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { exports: mod.exports, require: () => safe.exports });
const { buildLetterpadHtml, normalizeLetterpadLayout, defaultLetterpadLayout, letterpadFields, letterpadFieldInfo } = mod.exports;
const values = { name: '<img src=x onerror=alert(1)> मरीज', age: '0 Y', gender: 'Female', date: '25/10/2026', registration: 'BAOR1108' };
const html = buildLetterpadHtml(values, defaultLetterpadLayout);
assert.equal((html.match(/data-field=/g) || []).length, 5);
assert.ok(html.includes('&lt;img'));
assert.ok(!/<img|<script|<svg|<button|<input|<iframe|<link/i.test(html));
assert.ok(!html.includes('class="label"'));
assert.ok(html.includes('size: A4 portrait; margin: 0;'));
assert.ok(buildLetterpadHtml({...values,name:'Test'},defaultLetterpadLayout).includes('font-size:14.00pt'));
for (const field of letterpadFields) assert.equal(defaultLetterpadLayout.positions[field].y,58.3);
assert.ok(defaultLetterpadLayout.positions.registration.x > defaultLetterpadLayout.positions.name.x);
assert.ok(letterpadFieldInfo.registration.width < 25);
const full=buildLetterpadHtml(values,defaultLetterpadLayout,{background:'data:image/png;base64,AAAA'});assert.ok(full.includes('class="letterpad-design"'));assert.ok(!html.includes('letterpad-design" alt'));
assert.ok(!buildLetterpadHtml(values,defaultLetterpadLayout,{background:'https://invalid.example/image.png'}).includes('src="https:'));
assert.ok(html.includes('height:12mm'));
assert.ok(html.includes('0 Y'));
assert.ok(html.includes('BAOR1108'));
const labeled = buildLetterpadHtml(values, { ...defaultLetterpadLayout, labels: true });
assert.equal((labeled.match(/class="label"/g) || []).length, 5);
const normalized = normalizeLetterpadLayout({ offsetX: 'malicious', offsetY: 999, positions: { name: { x: -999, y: 999 }, age: { x: 'bad', y: null } } });
assert.equal(normalized.offsetX, 0); assert.equal(normalized.offsetY, 20);
for (const field of letterpadFields) {
 const p = normalized.positions[field];
 assert.ok(p.x >= 0 && p.x + letterpadFieldInfo[field].width <= 210);
 assert.ok(p.y >= 0 && p.y + 12 <= 297);
}
const blankReg = buildLetterpadHtml({ ...values, registration: '' }, defaultLetterpadLayout);
assert.match(blankReg, /data-field="registration"[^>]*><\/span>/);
console.log('PASS letterpad prints only five escaped fields, exact fonts/A4/12mm geometry, optional labels, safe positions and blank missing registration');
// Exercise the real Electron print handler with a synthetic window/printer.
const mainAst = ts.createSourceFile('main.js', fs.readFileSync('main.js', 'utf8'), ts.ScriptTarget.Latest, true);
let handler;
function visit(node) {
 if (ts.isCallExpression(node) && node.expression.getText(mainAst) === 'ipcMain.handle' && node.arguments[0]?.text === 'shell:print') handler = node.arguments[1].getText(mainAst);
 ts.forEachChild(node, visit);
}
visit(mainAst); assert.ok(handler);
let windowInstance, printed;
class FakeWindow {
 constructor() { windowInstance = this; this.webContents = { on: (_, callback) => { this.loaded = callback; }, print: (options, callback) => { printed = options; callback(); } }; }
 loadURL(url) { this.url = url; }
 close() { this.closed = true; }
}
const printHandler = vm.runInNewContext(`(${handler})`, { BrowserWindow: FakeWindow, encodeURIComponent });
(async () => {
 await printHandler({}, html, { patientLetterpad: true }); windowInstance.loaded();
 assert.equal(printed.pageSize, 'A4'); assert.equal(printed.landscape, false);
 assert.equal(printed.scaleFactor, 100); assert.equal(printed.margins.marginType, 'none'); assert.equal(printed.printBackground, false);
 assert.equal(windowInstance.closed, true);
 await printHandler({}, html); windowInstance.loaded();
 assert.equal(printed.printBackground, true); assert.equal(printed.pageSize, undefined);
 console.log('PASS native letterpad uses A4 portrait/100%/zero margins and preserves other print jobs');
})().catch(error => { console.error(error); process.exitCode = 1; });
// Registration printing is independent of billing and invoice identifiers.
const component=fs.readFileSync('src/components/LetterpadPatientPrint.tsx','utf8');
assert.ok(!component.includes('invoiceNumber'));
assert.ok(component.includes('registration_number'));
assert.ok(!component.includes('readBranchTable("billing"'));
console.log('PASS BAOR registration prints without loading or requiring a bill');
