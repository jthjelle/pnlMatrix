const {Visual} = require('./test-grouped-rows.cjs');
const assert = require('node:assert/strict');
// Synthetic statement fixture: no Desktop report or real financial data required.
const formulas = {
 'Margin':'-(Omsetning + Varekostnad)',
 'Margin%':'Margin / (Omsetning * -1)',
 'Personal%':'Personal / (Omsetning * -1)',
 'Husleie%':'Husleie / (Omsetning * -1)',
 'Markedsføring%':'Markedsføring / (Omsetning * -1)',
 'OPEX':'Personal + Husleie + Markedsføring + ADK',
 'OPEX%':'OPEX / Omsetning',
 'EBITDA':'Margin - OPEX - Andre driftsinntekter',
 'EBITDA%':'EBITDA / (Omsetning * -1)',
 'EBIT':'EBITDA - Avskrivninger',
};
const configs = Object.entries(formulas).map(([name,formula],i)=>({id:'calc_'+i,name,formula,format:{percentage:name.includes('%')}}));
const order = ['Omsetning','Varekostnad','Margin','Margin%','Andre driftsinntekter','Personal','Personal%','Husleie','Husleie%','Markedsføring','Markedsføring%','ADK','OPEX','OPEX%','EBITDA','EBITDA%','Avskrivninger','EBIT'];
const rowOrder = {root:order.map(name=>configs.find(c=>c.name===name)?.id||name)};
const ids = new Set(configs.map(c=>c.id));
const definitions = rowOrder.root.filter(id=>!ids.has(id)).map(id=>({id,label:id}));
function make({data=true,keep=true,zero=true,emptyZero=false}={}) {
 const v=Object.create(Visual.prototype);
 v.currentRows=data?[{id:'ADK',label:'ADK',level:0,children:[{id:'ADK.1',label:'Account',children:[]}],actualCY:12000,groupedValues:{Jan:{actualCY:1000},Feb:{actualCY:1000}}}]:[];
 v.calculatedRows=structuredClone(configs).reverse(); // Dependencies must not rely on configuration order.
 v.rowOrder=rowOrder;
 v.formattingSettings={layoutSettings:{statementRows:{value:JSON.stringify(definitions)},preserveEmptyRows:{value:keep},missingAsZero:{value:zero},emptyCalculationAsZero:{value:emptyZero}}};
 v.host={persistProperties(){}};
 v.restoreStatementRows();v.injectCalculatedRows();
 return v;
}
const row=(v,name)=>v.currentRows.find(r=>r.label===name);
let v=make();
assert.equal(v.currentRows.length,18);
assert.equal(row(v,'OPEX').actualCY,12000);
assert.equal(row(v,'OPEX').groupedValues.Jan.actualCY,1000);
assert.equal(row(v,'EBITDA').actualCY,-12000);
assert.equal(row(v,'EBIT').actualCY,-12000);
assert.equal(row(v,'EBIT').groupedValues.Jan.actualCY,-1000);
assert.equal(row(v,'EBITDA%').actualCY,undefined);
assert.equal(row(v,'Omsetning').actualCY,undefined);
assert.equal(row(v,'Omsetning').children.length,0);
assert.equal(row(v,'EBIT').children.length,0);
assert.equal(row(v,'ADK').children.length,1);
assert.equal(row(v,'OPEX').partialCalculation,true);
v=make({zero:false});assert.equal(row(v,'OPEX').actualCY,undefined);
v=make({keep:false});assert.equal(row(v,'Omsetning'),undefined);assert.equal(row(v,'OPEX').actualCY,12000);
v=make({data:false});assert.equal(v.currentRows.length,18);assert.equal(row(v,'OPEX').actualCY,undefined);
v=make({data:false,emptyZero:true});assert.equal(row(v,'OPEX').actualCY,0);assert.equal(row(v,'EBITDA%').actualCY,undefined);
v=make({data:false});
v.currentRows=[{id:'ADK',label:'ADK',level:0,children:[],actualCY:0}];v.injectCalculatedRows();assert.equal(row(v,'OPEX').actualCY,0);
v=make();v.currentRows=v.currentRows.filter(r=>!ids.has(r.id));
v.calculatedRows=[{id:'bad',name:'Bad',formula:'[ADKK]+[ADK]'}, {id:'cascade',name:'Cascade',formula:'[Bad]+[ADK]'}, {id:'a',name:'A',formula:'[B]+[ADK]'}, {id:'b',name:'B',formula:'[A]'}];
v.injectCalculatedRows();
for(const name of ['Bad','Cascade','A','B']){assert.equal(row(v,name).actualCY,undefined);assert.ok(row(v,name).calculationError);}
// Metadata capture must include definitions only, with no values or account children.
v=make();v.currentRows.push({id:'New',label:'New',level:0,children:[{id:'New.1',label:'Account',children:[]}],actualCY:5});
let persisted;v.host.persistProperties=p=>persisted=p;v.restoreStatementRows();
assert.deepEqual(JSON.parse(persisted.merge[0].properties.statementRows).at(-1),{id:'New',label:'New'});
console.log('PASS: partial budget, fixed/hidden empty rows, strict/zero modes, empty basis, real zero, dependency order, unknown/circular references, monthly totals and drillable leaves.');
