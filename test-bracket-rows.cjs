const {Visual}=require('./test-grouped-rows.cjs');
const assert=require('node:assert/strict');
const visual=Object.create(Visual.prototype);
visual.rowOrder={};
visual.currentRows=[
 {label:'Salgsinntekter',actualCY:0,actualPY:-1000,budget:-1200},
 {label:'Varekostnad',actualCY:0,actualPY:400,budget:500},
 {label:'Lønnskostnader',actualCY:0,actualPY:100,budget:120},
 {label:'Husleie',actualCY:0,actualPY:50,budget:60},
 {label:'Andre kostnader',actualCY:0,actualPY:25,budget:30},
 {label:'Markedsføring',actualCY:0,actualPY:10,budget:20},
 {label:'Adm fee',actualCY:0,actualPY:5,budget:7},
 {label:'Av- og nedskrivninger',actualCY:0,actualPY:20,budget:22},
].map(r=>({...r,id:r.label,children:[]}));
visual.calculatedRows=[
 {name:'Gross Profit',formula:'"Salgsinntekter" + "Varekostnad"'},
 {name:'Gross Margin (%)',formula:'"Gross Profit" / "Salgsinntekter"'},
 {name:'Personal %',formula:'[Lønnskostnader] / [Salgsinntekter]'},
 {name:'OPEX',formula:'[Lønnskostnader]+[Husleie]+[Andre kostnader]+[Markedsføring]+[Adm fee]'},
 {name:'EBITDA',formula:'[Gross Profit]+[OPEX]'},
 {name:'EBIT',formula:'[EBITDA]+[Av- og nedskrivninger]'},
].map((r,i)=>({...r,id:'calc'+i}));
visual.injectCalculatedRows();
const get=name=>visual.currentRows.find(r=>r.label===name);
assert.equal(get('OPEX').actualPY,190);
assert.equal(get('OPEX').budget,237);
assert.equal(get('EBITDA').actualPY,-410);
assert.equal(get('EBIT').actualPY,-390);
assert.equal(get('Personal %').actualPY,-0.1);
assert.equal(get('Gross Margin (%)').actualCY,undefined);
assert.equal(get('Gross Margin (%)').varCYPYPct,undefined);
assert.equal(visual.renderCell(get('EBIT'),'actualCY',NaN,()=>{throw Error('must not format NaN');}),'-');
assert.equal(visual.renderCell(get('EBIT'),'actualCY',Infinity,()=>{throw Error('must not format infinity');}),'-');
console.log('PASS: bracket/quoted references, Norwegian labels, dependent flat CY/PY/BUD formulas and undefined percentage handling.');
