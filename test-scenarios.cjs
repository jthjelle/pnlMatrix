const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
// Exercise the actual update/parser/render pipeline. Only host/DOM and formatting inputs are stubbed.
class Input {constructor(config){Object.assign(this,config);}}
const formattingSettings=new Proxy({}, {get:()=>Input});
function load(file,requireFn){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:requireFn,console,document:{createElement:()=>({style:{}})}});return exports;}
const {VisualFormattingSettingsModel}=load('src/settings.ts',()=>({formattingSettings}));
const {Visual}=load('src/visual.ts',name=>name==='./settings'?{VisualFormattingSettingsModel}:{default:{ViewMode:{Edit:1,View:0}}});
function hydrate(model,metadata){
 for(const card of model.cards){const props=metadata.objects?.[card.name]||{};const visited=new Set();const walk=obj=>{if(!obj||typeof obj!=='object'||visited.has(obj))return;visited.add(obj);if(obj.name&&Object.hasOwn(props,obj.name)&&Object.hasOwn(obj,'value'))obj.value=props[obj.name];Object.values(obj).forEach(walk);};walk(card);}
 return model;
}
const fields=['actualCY','actualPY','budget','forecast'];
const config=[{id:'sum',name:'Sum',formula:'[A]+[B]'},{id:'ratio',name:'Ratio',formula:'[Sum]/[A]',format:{percentage:true}}];
function matrix(rows,grouped=false){
 const groups=grouped?['Jan','Feb']:[''];
 const values=node=>{
  const result={value:node.name};if(node.child)result.children=[values({...node,child:false,name:node.name+' account'})];
  else {result.values={};groups.forEach((g,gi)=>fields.forEach((f,fi)=>{const val=grouped?node.groups?.[g]?.[f]:node[f];if(val!=null)result.values[gi*4+fi]={value:val};}));}
  return result;
 };
 return {valueSources:fields.map(f=>({roles:{[f]:true}})),rows:{levels:[{sources:[{displayName:'Statement'}]}],root:{children:rows.map(values)}},columns:{root:{children:grouped?groups.map(g=>({value:g,children:fields.map((f,i)=>({value:i}))})):fields.map((f,i)=>({value:i}))}}};
}
function run({rows=[],grouped=false,keep=false,zero=false,empty=false,calcRows=false,calcCols=false,extra={},instance}={}){
 const v=instance||Object.create(Visual.prototype);
 if(!instance){Object.assign(v,{currentRows:[],statementDefinitions:[],calculatedRows:[],calculatedColumns:[],rowOrder:{},collapsedRows:new Set(),invertedRows:new Set(),sortDirection:'none',columnFormatting:{},columnTotals:{},container:{style:{},children:[],appendChild(table){this.children.push(table);}},events:{renderingStarted(){},renderingFinished(){}},host:{persistProperties(p){v.persisted=p;},createSelectionIdBuilder(){return {withMatrixNode(){return this;},createSelectionId(){return {};}};}}});
  v.updateContextMenuAuthoringState=()=>{};v.clearNode=n=>{n.children=[];};v.setNodeHtml=(n,html)=>{n.html=html;};v.attachEvents=()=>{};v.handleLandingPage=()=>{v.landing=true;v.container.children=[];};
  v.formattingSettingsService={populateFormattingSettingsModel:(_type,d)=>hydrate(new VisualFormattingSettingsModel(),d.metadata)};
 }
 v.landing=false;
 const objects={layoutSettings:{preserveEmptyRows:keep,missingAsZero:zero,emptyCalculationAsZero:empty,statementRows:JSON.stringify([{id:'A',label:'A'},{id:'B',label:'B'}]),calculatedRows:JSON.stringify(calcRows?config:[]),calculatedColumns:JSON.stringify(calcCols?[{id:'delta',name:'Delta test',formula:'[actualCY]-[budget]'}]:[]),rowOrder:JSON.stringify({root:['A','B','sum','ratio']}),showColumnTotal:true,...extra}};
 const metadata={columns:[{roles:{category:true}},...(grouped?[{roles:{columns:true}}]:[]),...fields.map(f=>({roles:{[f]:true}}))],objects};
 v.update({dataViews:[{matrix:matrix(rows,grouped),metadata}],viewMode:1});
 v.html=v.container.children.at(-1)?.html||'';return v;
}
const failures=[];let checks=0;
function test(name,fn){checks++;try{fn();}catch(e){failures.push({name,error:e.message});}}
const eq=(actual,expected)=>{if(expected==null)assert.equal(actual,undefined);else assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);};
const find=(v,id)=>v.currentRows.find(r=>r.id===id);
const scenarios={complete:[{name:'A',actualCY:100,actualPY:80,budget:120,forecast:110},{name:'B',actualCY:20,actualPY:10,budget:30,forecast:25}],partial:[{name:'A',actualCY:100}],zero:[{name:'A',actualCY:0},{name:'B',actualCY:0}],blank:[{name:'A'},{name:'B'}],empty:[],hierarchy:[{name:'A',child:true,actualCY:100},{name:'B',child:true,budget:30}]};
const expectedSum=(a,b,zero,empty)=>{if((a==null||b==null)&&!zero)return undefined;if(a==null&&b==null&&!empty)return undefined;return(a??0)+(b??0);};
for(const keep of [false,true])for(const zero of [false,true])for(const empty of [false,true])for(const calcRows of [false,true])for(const calcCols of [false,true])for(const grouped of [false,true])for(const [scenario,source]of Object.entries(scenarios)){
 const rows=source.map(r=>({...r,groups:{Jan:Object.fromEntries(fields.filter(f=>r[f]!=null).map(f=>[f,r[f]/4])),Feb:Object.fromEntries(fields.filter(f=>r[f]!=null).map(f=>[f,r[f]*3/4]))}}));
 const name=JSON.stringify({scenario,keep,zero,empty,calcRows,calcCols,grouped});
 test(name,()=>{
  const v=run({rows,grouped,keep,zero,empty,calcRows,calcCols});
  if(!source.length&&!keep){assert.equal(v.landing,true);return;}
  assert.equal(v.landing,false);assert.equal(v.currentRows.length,(keep?2:source.length)+(calcRows?2:0));
  assert.ok(!/NaN|Infinity/.test(v.html));
  assert.equal(v.html.includes('Delta test'),calcCols);
  for(const id of ['A','B']){
   const original=source.find(r=>r.name===id),row=find(v,id);
   if(!original&&!keep){assert.equal(row,undefined);continue;}
   for(const f of fields)eq(row[f],original?.[f]);
   assert.equal(row.children.length,original?.child?1:0);
   if(grouped)for(const group of ['Jan','Feb'])for(const f of fields)eq(row.groupedValues?.[group]?.[f],original?.[f]==null?undefined:original[f]*(group==='Jan'?.25:.75));
  }
  if(calcRows){
   for(const f of fields){const a=source.find(r=>r.name==='A')?.[f],b=source.find(r=>r.name==='B')?.[f];const sum=expectedSum(a,b,zero,empty);eq(find(v,'sum')[f],sum);eq(find(v,'ratio')[f],a && sum!=null?sum/a:undefined);}
   for(const id of ['sum','ratio'])assert.equal(find(v,id).children.length,0);
  }
  if(calcCols)for(const row of v.currentRows){const expected=expectedSum(row.actualCY,row.budget==null?undefined:-row.budget,zero,empty);eq(v.evaluateColumnFormula('[actualCY]-[budget]',row),expected);}
 });
}
test('Malformed formula is isolated and does not crash render',()=>{const v=run({rows:scenarios.complete});v.calculatedRows=[{id:'bad',name:'Bad',formula:'[A]+('}];assert.doesNotThrow(()=>v.injectCalculatedRows());assert.ok(find(v,'bad').calculationError);});
test('Scientific notation and small real amounts',()=>{const v=run({rows:[{name:'A',actualCY:1e-7},{name:'B',actualCY:2e-7}],calcRows:true});eq(find(v,'sum').actualCY,3e-7);});
test('Forecast references in calculated columns',()=>{const v=run({rows:scenarios.complete});eq(v.evaluateColumnFormula('[forecast]-[budget]',find(v,'A')),-10);});
test('Malformed statement JSON cannot reuse a stale catalogue',()=>{const v=run({rows:scenarios.complete,keep:true});run({instance:v,rows:[{name:'A',actualCY:1}],calcRows:true,zero:true,extra:{statementRows:'broken'}});assert.equal(find(v,'sum').actualCY,undefined);assert.ok(find(v,'sum').calculationError);});
test('Missing month can be displayed as zero when all-empty setting is on',()=>{const v=run({rows:[{name:'A',actualCY:1,groups:{Jan:{actualCY:1}}}],grouped:true,keep:true,zero:true,empty:true,calcRows:true});eq(find(v,'sum').groupedValues?.Feb?.actualCY,0);});
test('Global inversion is consistent between monthly amounts and totals',()=>{const rows=scenarios.complete.map(r=>({...r,groups:{Jan:{actualCY:r.actualCY/4},Feb:{actualCY:r.actualCY*3/4}}}));const v=run({rows,grouped:true,extra:{invertAllValues:true}});eq(find(v,'A').actualCY,-100);eq(find(v,'A').groupedValues.Jan.actualCY,-25);});
test('Calculated row monthly variance is computed',()=>{const rows=scenarios.complete.map(r=>({...r,groups:{Jan:{actualCY:r.actualCY/4,budget:r.budget/4},Feb:{actualCY:r.actualCY*3/4,budget:r.budget*3/4}}}));const v=run({rows,grouped:true,calcRows:true});eq(find(v,'sum').groupedValues.Jan.varCYBud,-7.5);});
test('Unknown column row reference must not turn into zero',()=>{const v=run({rows:scenarios.complete,zero:true});eq(v.evaluateColumnFormula('{Typo}[actualCY]+[actualCY]',find(v,'A')),undefined);});
test('Expand/collapse enabled and disabled',()=>{const v=run({rows:scenarios.hierarchy});assert.ok(!v.html.includes('A account'));v.collapsedRows.clear();v.render();assert.ok(v.container.children.at(-1).html.includes('A account'));run({instance:v,rows:scenarios.hierarchy,extra:{disableExpandCollapse:true}});assert.ok(!v.html.includes('A account'));});
test('Empty-data update refreshes formatting settings as well',()=>{const v=run({rows:scenarios.complete,keep:true});run({instance:v,keep:false});assert.equal(v.formattingSettings.layoutSettings.preserveEmptyRows.value,false);});
test('Blank grand total stays blank without any calculation features',()=>{const v=run({rows:scenarios.blank,extra:{showGrandTotal:true}});for(const f of fields)eq(find(v,'grand_total')[f],undefined);});
test('Grand total adds real source rows once, with grouped variances',()=>{const rows=scenarios.complete.map(r=>({...r,groups:{Jan:{actualCY:r.actualCY/4,budget:r.budget/4},Feb:{actualCY:r.actualCY*3/4,budget:r.budget*3/4}}}));for(const calcRows of [false,true]){const v=run({rows,grouped:true,calcRows,extra:{showGrandTotal:true}});eq(find(v,'grand_total').actualCY,120);eq(find(v,'grand_total').groupedValues?.Jan?.actualCY,30);eq(find(v,'grand_total').groupedValues?.Jan?.varCYBud,-7.5);}});
test('Top-level data row wins over another parent account label',()=>{const v=run({rows:scenarios.complete});find(v,'A').children=[{id:'A.B',label:'B',children:[],actualCY:1}];v.calculatedRows=[{id:'bcopy',name:'B copy',formula:'[B]'}];v.injectCalculatedRows();eq(find(v,'bcopy').actualCY,20);eq(v.evaluateColumnFormula('{B}[actualCY]',find(v,'A')),20);});
test('Duplicate fixed row definitions do not duplicate output',()=>{const v=run({rows:[{name:'A',actualCY:5}],keep:true,extra:{statementRows:JSON.stringify([{id:'B',label:'B'},{id:'B',label:'B'}])}});assert.equal(v.currentRows.filter(r=>r.id==='B').length,1);});
test('Grand total top/bottom placement',()=>{for(const position of ['top','bottom']){const v=run({rows:scenarios.complete,extra:{showGrandTotal:true,grandTotalPosition:{value:position}}});const ids=[...v.html.matchAll(/data-row-id="([^"]+)"/g)].map(m=>m[1]);assert.equal(position==='top'?ids[0]:ids.at(-1),'grand_total');}});
test('Numeric sorting and saved manual row order',()=>{const v=run({rows:scenarios.complete});v.isManualSort=false;v.sortColumn='actualCY';v.sortDirection='asc';assert.equal(v.sortRows(v.currentRows)[0].id,'B');v.sortDirection='desc';assert.equal(v.sortRows(v.currentRows)[0].id,'A');v.isManualSort=true;v.rowOrder={root:['B','A']};assert.equal(v.sortRows(v.currentRows)[0].id,'B');});
test('Top N on a plain matrix retains highest values',()=>{const v=run({rows:scenarios.complete});v.formattingSettings.topNSettings.enabled.value=true;v.formattingSettings.topNSettings.topN.value=1;assert.equal(v.applyTopN(v.currentRows)[0].id,'A');});
test('Repeated year/settings changes do not retain synthetic values',()=>{const v=run({rows:scenarios.complete,keep:true,zero:true,calcRows:true});run({instance:v,keep:true,zero:true,calcRows:true});eq(find(v,'A').actualCY,undefined);eq(find(v,'sum').actualCY,undefined);run({instance:v,rows:scenarios.partial,keep:false,zero:true,calcRows:false});assert.equal(v.currentRows.length,1);eq(find(v,'A').actualCY,100);});
test('Grouped data bar scale uses the grouped measure values',()=>{const rows=scenarios.complete.map(r=>({...r,groups:{Jan:{actualCY:r.actualCY/4}}}));const v=run({rows,grouped:true});eq(v.columnTotals.Jan_actualCY,25);});
test('Top N Others keeps absent measures blank and aggregates each month',()=>{const rows=[{name:'A',actualCY:100,groups:{Jan:{actualCY:100}}},{name:'B',actualCY:50,groups:{Jan:{actualCY:50}}},{name:'C',actualCY:10,groups:{Jan:{actualCY:10}}}];const v=run({rows,grouped:true});v.formattingSettings.topNSettings.enabled.value=true;v.formattingSettings.topNSettings.topN.value=1;const result=v.applyTopN(v.currentRows);eq(result[1].actualCY,60);eq(result[1].actualPY,undefined);eq(result[1].groupedValues.Jan.actualCY,60);eq(result[1].varCYPYPct,undefined);});
test('Provided parent subtotal is inverted once',()=>{const v=run({rows:[] ,keep:true});v.invertedRows=new Set(['A']);const m=matrix([{name:'A',actualCY:100,child:true}]);m.rows.root.children[0].values={0:{value:100}};const r=v.parseRows(m)[0];eq(r.actualCY,-100);eq(Object.values(r.groupedValues).find(g=>g.actualCY!=null).actualCY,-100);});
test('Blank spacer rows occur exactly once',()=>{const v=run({rows:scenarios.complete});v.calculatedRows=[{id:'spacer',name:'',formula:'',isBlank:true}];v.injectCalculatedRows();assert.equal(v.currentRows.filter(r=>r.id==='spacer').length,1);});
test('Special characters in row labels are literal references',()=>{const v=run({rows:[{name:'A+B (ø)',actualCY:10},{name:'B',actualCY:5}]});v.calculatedRows=[{id:'special',name:'Special',formula:'[A+B (ø)] + B'}];v.injectCalculatedRows();eq(find(v,'special').actualCY,15);});
for(const [expression,expected] of [['2+3*4',14],['(2+3)*4',20],['10/-2',-5],['1--2',3],['-(3+4)',-7],['.5 + 1.',1.5],['1e-7 * 2',2e-7],['+(-2)*-3',6],['1/0',undefined],['0/0',undefined],['1+',undefined],['(1',undefined],['1)',undefined],['2(3)',undefined],['1 2',undefined],['2..3',undefined],['Math.random()',undefined],['',undefined]])test('Arithmetic '+expression,()=>{const v=Object.create(Visual.prototype);assert.doesNotThrow(()=>v.evaluateArithmeticExpression(expression));eq(v.evaluateArithmeticExpression(expression),expected);});
for(const type of ['text','font','background','databar','waterfall','lollipop','bullet'])for(const calcRows of [false,true])for(const calcCols of [false,true])test(`Formatting ${type}; rows=${calcRows}; columns=${calcCols}`,()=>{const v=run({rows:scenarios.complete,calcRows,calcCols});v.columnFormatting={actualCY:{type,showSentiment:true},varCYBud:{type,showSentiment:true},delta:{type}};v.render();const html=v.container.children.at(-1).html;assert.ok(!/NaN|Infinity/.test(html));assert.ok(html.includes('data-column-key="actualCY"'));eq(find(v,'A').actualCY,100);if(calcRows)eq(find(v,'sum').actualCY,120);});
for(const units of [1,1000,1000000,'auto'])test('Number display units '+units,()=>{const v=run({rows:[{name:'A',actualCY:1234567.89},{name:'B',actualCY:-500}]});v.formattingSettings.numberFormatting.displayUnits.value=units;v.formattingSettings.numberFormatting.decimalPlaces.value=2;v.render();assert.ok(!/NaN|Infinity/.test(v.container.children.at(-1).html));eq(find(v,'A').actualCY,1234567.89);});
test('Per-measure visibility without calculation features',()=>{const v=run({rows:scenarios.complete});v.formattingSettings.columnsSettings.columnVisibility.showBudget.value=false;v.formattingSettings.columnsSettings.columnVisibility.showVarCYBud.value=false;v.render();const html=v.container.children.at(-1).html;assert.ok(!html.includes('data-column-key="budget"'));assert.ok(!html.includes('data-column-key="varCYBud"'));assert.ok(html.includes('data-column-key="actualCY"'));});
test('Expanded hierarchy remains expanded across updates',()=>{const v=run({rows:scenarios.hierarchy});v.collapsedRows.clear();run({instance:v,rows:scenarios.hierarchy});assert.ok(v.html.includes('A account'));});
fs.writeFileSync(path.join(__dirname,'scenario-test-results.json'),JSON.stringify({checks,passed:checks-failures.length,failures},null,2));
console.log(JSON.stringify({checks,passed:checks-failures.length,failed:failures.length,examples:failures.slice(0,12)},null,2));
if(failures.length)process.exitCode=1;
module.exports={Visual,run,matrix,scenarios,find,eq};
