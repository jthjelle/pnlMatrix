const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleStub = {exports:{}};
const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'src/visual.ts'),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
vm.runInNewContext(source, {
    exports:moduleStub.exports, module:moduleStub,
    require:()=>({default:{ViewMode:{Edit:1,View:0}}}), console:{log(){}},
});
const visual = Object.create(moduleStub.exports.Visual.prototype);
assert.equal(visual.evaluateArithmeticExpression('2 + 3 * 4'),14);
assert.equal(visual.evaluateArithmeticExpression('-2 * -3'),6);
assert.equal(visual.evaluateArithmeticExpression('10 / -2'),-5);
assert.equal(visual.evaluateArithmeticExpression('-(3 + 4)'),-7);
assert.equal(visual.evaluateArithmeticExpression('1 / 0'),undefined);
visual.rowOrder = {};
visual.currentRows = [
    {id:'Revenue',label:'Revenue',children:[{id:'Account',label:'Account',children:[]}],actualCY:-400,groupedValues:{Jan:{actualCY:-100},Feb:{actualCY:-300}}},
    {id:'Cost',label:'Cost',children:[{id:'Cost.child',label:'Cost',children:[],actualCY:5,groupedValues:{Jan:{actualCY:2},Feb:{actualCY:3}}}],actualCY:250,groupedValues:{Jan:{actualCY:50},Feb:{actualCY:200}}},
];
visual.calculatedRows = [
    {id:'margin',name:'Margin',formula:'-(Revenue + Cost)'},
    {id:'marginPct',name:'Margin%',formula:'Margin / (Revenue * -1)',format:{percentage:true}},
    {id:'missing',name:'Undefined%',formula:'Cost / (Revenue - Revenue)',format:{percentage:true}},
];
visual.injectCalculatedRows();
const margin = visual.currentRows.find(r=>r.id==='margin');
const pct = visual.currentRows.find(r=>r.id==='marginPct');
assert.equal(margin.groupedValues.Jan.actualCY,50);
assert.equal(margin.groupedValues.Feb.actualCY,100);
assert.equal(margin.actualCY,150);
assert.equal(pct.groupedValues.Jan.actualCY,0.5);
assert.equal(pct.groupedValues.Feb.actualCY,1/3);
assert.equal(pct.actualCY,0.375);
assert.equal(visual.currentRows.find(r=>r.id==='missing').actualCY,undefined);
assert.equal(margin.children.length,0);
assert.equal(pct.children.length,0);
assert.equal(visual.currentRows[0].children.length,1);
const handlers={}; let rendered=0;
const icon={getAttribute:()=> 'Revenue',addEventListener:(type,fn)=>{handlers[type]=fn;}};
visual.container={querySelectorAll:selector=>selector==='.pnl-expand-icon'?[icon]:[],querySelector:()=>null,addEventListener(){}};
visual.collapsedRows=new Set(['Revenue']);
visual.formattingSettings={layoutSettings:{enableSorting:{value:false}}};
visual.render=()=>{rendered++;};
visual.attachEvents(false);
handlers.click({stopPropagation(){}});
assert.equal(visual.collapsedRows.has('Revenue'),false);
handlers.click({stopPropagation(){}});
assert.equal(visual.collapsedRows.has('Revenue'),true);
assert.equal(rendered,2);
console.log('PASS: monthly formulas, dependent formulas, weighted total percentage, zero division, duplicate child labels, and leaf calculated rows.');
module.exports = {Visual:moduleStub.exports.Visual};
