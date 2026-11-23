const{chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const photo=path.resolve('tests/fixtures/salad-real.jpg');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4176';
(async()=>{const b=await chromium.launch({channel:'chrome'});const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();
const foods=[{name:'鸡蛋',kcal:140,box:null},{name:'番茄',kcal:20,box:null}];
await p.route('**/api/recognize',r=>r.fulfill({json:{foodVisible:true,name:'测试餐',portion:150,kcal:160,carb:8,pro:14,fat:8,foods,notes:'测试'}}));
await p.route('**/api/match-foods',r=>r.fulfill({status:502,json:{error:'测试匹配失败'}}));
await p.goto(base+'/Record.dc.html?date=2026-11-17');
// Isolate matching failure from heavy segmentation, which is covered separately.
await p.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(6,6,20,20);window.testCandidate={id:1,mask:canvas.toDataURL(),score:.9,box:{x:180,y:180,width:640,height:640}};FoodStickers.segment=async()=>[window.testCandidate];});
await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);await p.getByText('食物和营养已保留。测试匹配失败').waitFor();
assert.equal(await p.locator('[name=calories]').inputValue(),'160');assert.equal(await p.locator('.food-editor-row').count(),2);assert.equal(await p.locator('.food-editor-row canvas').count(),0);
const checks=await p.evaluate(async()=>{const c=window.testCandidate,foods=[{name:'鸡蛋',kcal:140},{name:'番茄',kcal:20}];const matches=[{foodIndex:1,status:'matched',maskIds:[1]},{foodIndex:0,status:'uncertain',maskIds:[],reason:'看不清'}];const out=await FoodStickers.applyMatches(foods,[c],matches);let rejected=0;for(const bad of [[{foodIndex:0,status:'matched',maskIds:[1]},{foodIndex:1,status:'matched',maskIds:[1]}],[{foodIndex:0,status:'matched',maskIds:[9]},{foodIndex:1,status:'missing',maskIds:[]}]]){try{await FoodStickers.applyMatches(foods,[c],bad)}catch{rejected++}}return{names:out.map(f=>f.name),masks:out.map(f=>!!f.cutout),reason:out[0].reviewReason,rejected};});
assert.deepEqual(checks.names,['鸡蛋','番茄']);assert.deepEqual(checks.masks,[false,true]);assert.equal(checks.rejected,2);assert(checks.reason.includes('看不清'));
await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');await p.reload();assert.equal(await p.locator('.week-board-sticker').count(),2);assert.equal(await p.locator('.week-board-sticker canvas').count(),0);assert.equal(await p.locator('.week-board-caption small').first().innerText(),'约 140 kcal');
console.log('PASS matching failure keeps food/nutrition and allows saving; out-of-order matches retain names; duplicate/unknown IDs rejected');await b.close();})().catch(e=>{console.error(e);process.exit(1)});
