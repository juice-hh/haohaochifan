// Run with NODE_PATH pointing to the workspace node_modules containing Playwright.
// Camera uses Chromium's fake media device; keyboard cases model VisualViewport geometry.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4176';
const out = process.env.TEST_OUTPUT_DIR || '/tmp/hhcf-recording-check';
fs.mkdirSync(out, {recursive:true});
const photo = path.resolve('project/icons/app-180.png');
const results = [];
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function fixture(browser, {keyboard=false, camera=false}={}) {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(camera) await context.grantPermissions(['camera']);
 if(keyboard) await context.addInitScript(()=>{
  const vv=new EventTarget();let geometry=null;
  for(const [key,fallback] of Object.entries({height:()=>innerHeight,width:()=>innerWidth,offsetTop:()=>0,offsetLeft:()=>0,scale:()=>1})) Object.defineProperty(vv,key,{get:()=>geometry?.[key]??fallback()});
  Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
  window.setTestViewport=(value)=>{geometry=value;vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};
 });
 await context.addInitScript(()=>localStorage.setItem('hhcf-record-mode','manual'));
 const page=await context.newPage();
 await page.route('**/api/recognize',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试：识别暂不可用'})}));
 await page.goto(base+'/Record.dc.html?date=2026-11-12');
 await page.locator('.record-save').waitFor();
 return {context,page};
}
async function check(engine,name,fn){let f;try{f=await fn();results.push({engine,name,status:'PASS'});console.log('PASS',engine,name)}catch(e){results.push({engine,name,status:'FAIL',error:e.message});console.log('FAIL',engine,name,e.message)}finally{if(f?.context)await f.context.close();}}
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}):webkit.launch({executablePath:process.env.HOME+'/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'}));
  await check(engine,'photo → input macros → save → reload',async()=>{
   const f=await fixture(browser);const p=f.page;
   await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);
   await p.locator('.meal-photo-preview').waitFor();
   await p.getByPlaceholder('给这一餐起个名字').fill('测试照片餐');
   for(const [key,value] of Object.entries({portion:'280',calories:'420',carb:'50',pro:'25',fat:'13'})) await p.locator('input[name="'+key+'"]').fill(value);
   await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');await p.reload();
   await p.getByRole('link',{name:/查看当天/}).click();
   await p.locator('.meal-row').filter({hasText:'测试照片餐'}).click();
   assert.equal(await p.getByPlaceholder('给这一餐起个名字').inputValue(),'测试照片餐');
   assert.equal(await p.locator('input[name=pro]').inputValue(),'25');
   await p.locator('.meal-photo-preview').waitFor();assert(await p.locator('.meal-photo-preview').evaluate(i=>i.complete&&i.naturalWidth>0));
   return f;
  });
  await check(engine,'same photo reselect + unreadable file recovery',async()=>{
   const f=await fixture(browser);const p=f.page, input=p.getByLabel('从相册选',{exact:true});
   await input.setInputFiles(photo);await p.locator('.meal-photo-preview').waitFor();
   const previous=await p.locator('.meal-photo-preview').getAttribute('src');
   await input.setInputFiles([]);assert.equal(await p.locator('.meal-photo-preview').getAttribute('src'),previous);
   await p.getByRole('button',{name:'移除照片'}).click();await input.setInputFiles(photo);await p.locator('.meal-photo-preview').waitFor();
   await input.setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')});
   await p.getByRole('alert').filter({hasText:'无法读取'}).waitFor();
   assert(await p.locator('.meal-photo-preview').isVisible());
   await p.getByPlaceholder('给这一餐起个名字').fill('保留照片');await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await check(engine,'denied camera → native camera fallback → save',async()=>{
   const f=await fixture(browser);const p=f.page;
   await p.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'));});
   await p.getByRole('button',{name:'拍照',exact:true}).click();
   await p.getByLabel('用系统相机拍',{exact:true}).waitFor();
   assert.equal(await p.getByLabel('用系统相机拍',{exact:true}).getAttribute('capture'),'environment');
   await p.getByLabel('用系统相机拍',{exact:true}).setInputFiles(photo);await p.locator('.meal-photo-preview').waitFor();
   await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await check(engine,'AI failure preserves photo and manual save',async()=>{
   const f=await fixture(browser);const p=f.page;
   await p.getByRole('button',{name:'AI 辅助',exact:true}).click();await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);
   await p.locator('.nutrition-status').filter({hasText:'测试：识别暂不可用'}).waitFor();
   await p.getByPlaceholder('给这一餐起个名字').fill('手动补充');await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await check(engine,'keyboard visual-only shrink keeps save visible',async()=>{
   const f=await fixture(browser,{keyboard:true});const p=f.page;
   await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);await p.locator('.meal-photo-preview').waitFor();
   await p.getByPlaceholder('给这一餐起个名字').fill('键盘保存');
   await p.evaluate(()=>window.setTestViewport({height:514,offsetTop:0}));await delay(150);
   const b=await p.locator('.record-save').boundingBox();assert(b.y>=0&&b.y+b.height<=514,'save bottom '+(b.y+b.height)+' exceeds visual viewport 514');
   await p.screenshot({path:path.join(out,engine+'-keyboard.png')});
   await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await check(engine,'keyboard pan, blur, dismissal, zoom and tap stability',async()=>{
   const f=await fixture(browser,{keyboard:true});const p=f.page;
   await p.getByPlaceholder('给这一餐起个名字').fill('键盘移动测试');
   await p.locator('input[name=fat]').fill('15');
   await p.evaluate(()=>window.setTestViewport({height:400,offsetTop:80}));await delay(150);
   const footer=await p.locator('.record-save').boundingBox(),field=await p.locator('input[name=fat]').boundingBox();
   assert(footer.y>=80&&footer.y+footer.height<=480,'panned save is visible');
   assert(field.y>=80&&field.y+field.height<footer.y,'focused input stays above save');
   await p.locator('input[name=fat]').press('Enter');await delay(100);
   assert.equal(await p.locator('input[name=fat]').inputValue(),'15');
   const blurred=await p.locator('.record-save').boundingBox();assert(Math.abs(blurred.y-footer.y)<2,'blur must not move save before keyboard closes');
   await p.evaluate(()=>window.setTestViewport(null));await delay(100);
   assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--keyboard-inset')),'0px');
   await p.locator('input[name=fat]').focus();
   await p.evaluate(()=>window.setTestViewport({height:422,offsetTop:0,scale:2}));await delay(100);
   assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--keyboard-inset')),'0px','zoom is not keyboard');
   await p.evaluate(()=>window.setTestViewport({height:514,offsetTop:0,scale:1}));await delay(100);
   const button=await p.locator('.record-save').boundingBox();
   await p.mouse.move(button.x+button.width/2,button.y+button.height/2);await p.mouse.down();await delay(100);
   const down=await p.locator('.record-save').boundingBox();assert(Math.abs(button.y-down.y)<2,'pointer-down blur must not move save');
   await p.mouse.up();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await check(engine,'AI result editable before save',async()=>{
   const f=await fixture(browser);const p=f.page;
   await p.route('**/api/recognize',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({foodVisible:true,name:'测试识别结果',portion:200,kcal:300,carb:40,pro:20,fat:7,notes:'测试响应'})}));
   await p.getByRole('button',{name:'AI 辅助',exact:true}).click();await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);
   await p.locator('.nutrition-status').filter({hasText:'AI 估算'}).waitFor();
   assert.equal(await p.locator('input[name=pro]').inputValue(),'20');
   await p.getByPlaceholder('给这一餐起个名字').fill('已修改餐名');await p.locator('input[name=pro]').fill('22');
   await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');
   await p.getByRole('link',{name:/查看当天/}).click();await p.locator('.meal-row').filter({hasText:'已修改餐名'}).click();
   assert.equal(await p.locator('input[name=pro]').inputValue(),'22');return f;
  });
  await check(engine,'resized layout keyboard keeps focused input + save reachable',async()=>{
   const f=await fixture(browser);const p=f.page;
   await p.getByPlaceholder('给这一餐起个名字').fill('小屏键盘');await p.setViewportSize({width:320,height:390});
   await p.locator('input[name=fat]').fill('12');await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  if(engine==='chromium')await check(engine,'camera preview → capture → save; releases camera',async()=>{
   const f=await fixture(browser,{camera:true});const p=f.page;
   await p.getByRole('button',{name:'拍照',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
   await p.evaluate(()=>window.testStream=document.querySelector('video').srcObject);
   await p.locator('.meal-photo-actions').getByRole('button',{name:'拍照',exact:true}).last().click();await p.locator('.meal-photo-preview').waitFor();
   assert(await p.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')));
   await p.getByPlaceholder('给这一餐起个名字').fill('拍照测试');await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');return f;
  });
  await browser.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,report:out}));
 process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
