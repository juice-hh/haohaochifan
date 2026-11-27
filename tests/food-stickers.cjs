const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4176';
const photo=require('node:path').resolve('tests/fixtures/salad-real.jpg');
const foods=Array.from({length:6},(_,i)=>({name:'测试食物'+(i+1),kcal:50+i*10,nutrients:{carb:i+1,pro:i===1?null:4,fat:0},box:{x:100,y:100,width:700,height:700},contour:[{x:100,y:400},{x:400,y:100},{x:800,y:400},{x:400,y:800}]}));
const meal={foodVisible:true,name:'贴纸测试餐',portion:300,kcal:450,carb:40,pro:20,fat:10,notes:'测试数据',foods};
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='chromium'?chromium.launch({channel:'chrome'}):webkit.launch({executablePath:process.env.HOME+'/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'}));
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/recognize',r=>r.fulfill({json:meal}));
  await p.goto(base+'/Record.dc.html?date=2026-11-12');
  await p.evaluate(async () => {
    const original = FoodStickers.segment;
    FoodStickers.generate = async (source, foods) => {
      const points = [[355,315],[535,247],[650,470],[290,615],[580,720],[460,455]];
      const output=[];
      for (const [index,[x,y]] of points.entries()) {
        const [cutout] = await original(source,{points:[{x,y,label:1}]});
        output.push({...foods[index],cutout});
      }
      return output;
    };
  });
  await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);
  await p.locator('.food-result').nth(5).waitFor({state:'attached'});
  await p.waitForFunction(()=>document.querySelector('.record-save')?.getAttribute('aria-disabled')!=='true',{},{timeout:90000});
  const foodNutrition=p.locator('.record-food-nutrition').first();
  await foodNutrition.locator('summary').click();
  await p.locator('[name=food-kcal-0]').fill('123');
  assert.equal(await p.locator('.record-meal-summary .sticker-nutrition-line strong').innerText(),'523 kcal');
  assert.equal(await p.locator('[name=food-carb-0]').inputValue(),'1');
  await p.locator('[name=food-carb-0]').fill('16.5');
  await p.locator('.record-save').click();await p.waitForURL('**/Main.dc.html?**');await p.reload();
  const board=p.locator('.week-board');
  const stickers=board.locator('.week-board-sticker');
  const nutrition=p.locator('.week-nutrition-panel');
  await stickers.nth(5).waitFor();
  assert.equal(await board.getByRole('button',{name:'全量',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await stickers.count(),6);
  assert.equal(await stickers.first().locator('.sticker-kcal-top').innerText(),'123 kcal');
  assert.equal(await nutrition.locator('h3').innerText(),'全天营养');
  const primaryArt=await stickers.first().locator('.week-board-art').boundingBox();
  const secondaryArt=await stickers.nth(1).locator('.week-board-art').boundingBox();
  assert(primaryArt.width > secondaryArt.width && primaryArt.y + 20 < secondaryArt.y);
  const stickerStyle=await stickers.first().getAttribute('style');
  const dish=board.locator('.dish-card');
  await stickers.first().tap();
  assert.equal(await dish.locator('h3').innerText(),'测试食物1');
  assert.deepEqual(await dish.locator('dd').allTextContents(),['16.5 g','4 g','0 g']);
  assert.equal(await stickers.nth(1).getAttribute('data-dim'),'true');
  // The day totals stay put while a dish is open.
  assert.deepEqual(await nutrition.locator('.week-nutrient strong').allTextContents(),['523','37','20','0']);
  await board.getByRole('button',{name:'三餐',exact:true}).click();
  assert.deepEqual(await board.locator('.week-board-meal-heading').getByRole('heading').allTextContents(),['早餐','午餐','晚餐']);
  const emptyBreakfast=board.locator('section[aria-label="早餐"]');
  assert.equal(await emptyBreakfast.locator('.week-board-meal-heading .week-board-empty').innerText(),'未记录');
  assert.equal(await board.locator('section[aria-label="晚餐"] .week-board-sticker').count(),6);
  assert.equal(await stickers.first().getAttribute('aria-pressed'),'true');
  await stickers.nth(1).tap();
  assert.deepEqual(await dish.locator('dd').allTextContents(),['2 g','—','0 g']);
  await dish.getByRole('button',{name:/收起/}).click();
  assert.equal(await dish.count(),0);
  await board.getByRole('button',{name:'全量',exact:true}).click();
  assert.equal(await stickers.first().getAttribute('style'),stickerStyle);
  await stickers.first().tap();
  await p.locator('.week-calendar-day').first().click();
  assert.equal(await board.count(),0);
  await p.getByRole('button',{name:/11月12日 周四/}).click();
  assert.equal(await nutrition.locator('h3').innerText(),'全天营养');
  await p.locator('.week-day-record food-sticker canvas').nth(5).waitFor();
  // The calendar column piles that day's stickers instead of showing the photo.
  await p.locator('.week-calendar-day[aria-pressed="true"] .week-stack food-sticker canvas').first().waitFor();
  assert.equal(await p.locator('.week-calendar-day[aria-pressed="true"] .week-stack-item').count(),4);
  assert.equal(await stickers.first().locator('canvas').evaluate(canvas=>{
   const ctx=canvas.getContext('2d');
   const corner=ctx.getImageData(0,0,1,1).data[3];
   const center=ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data[3];
   return corner===0&&center>0;
  }),true);
  await p.getByRole('link',{name:'11月12日 周四的记录',exact:true}).click();
  // The day timeline shows a meal's stickers; the original photo only appears when there are none.
  await p.locator('.day-meal-card food-sticker canvas').first().waitFor();
  assert.equal(await p.locator('.day-meal-card').count(),1);
  await p.getByRole('link',{name:'编辑这餐',exact:true}).click();
  await p.locator('.record-food-nutrition summary').first().click();
  assert.equal(await p.locator('[name=food-kcal-0]').inputValue(),'123');
  await p.getByRole('button',{name:'单独抠出食物 测试食物1',exact:true}).click();
  const img=await p.locator('.food-crop-stage img').boundingBox();
  await p.mouse.click(img.x+img.width*.52,img.y+img.height*.36);
  await p.getByRole('button',{name:'使用这张贴纸'}).waitFor();
  await p.waitForFunction(()=>!document.querySelector('.app-sheet-confirm')?.disabled,{},{timeout:90000});
  await p.getByRole('button',{name:'使用这张贴纸'}).click();
  assert(JSON.parse(await p.locator('.food-result food-sticker').first().getAttribute('cutout')).mask.startsWith('data:image/png'));
  await p.locator('[name=food-kcal-0]').fill('');
  await p.locator('.record-food-nutrition summary').nth(5).click();
  await p.getByRole('button',{name:'移除食物 测试食物6',exact:true}).click();
  await p.setViewportSize({width:320,height:568});
  await p.getByRole('button',{name:'＋ 添加餐品',exact:true}).click();
  await p.locator('[name=food-name-5]').fill('手动补充');
  await p.locator('[name=food-kcal-5]').fill('88');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('.record-save').click();await p.waitForURL('**/Day.dc.html?**');await p.reload();
  assert.equal(await p.locator('.day-meal-card').count(),1);
  await p.goto(base+'/Main.dc.html?date=2026-11-12');
  assert.equal(await stickers.count(),6);
  assert.equal(await stickers.first().locator('.sticker-kcal-top').count(),0);
  assert.equal(await stickers.last().locator('.sticker-kcal-top').innerText(),'88 kcal');
  await p.goto(base+'/Day.dc.html?date=2026-11-12');
  await p.getByRole('link',{name:'编辑这餐',exact:true}).click();
  await p.getByRole('button',{name:'更换照片',exact:true}).click();
  await p.getByRole('button',{name:'切换本次',exact:true}).click();
  await p.getByRole('dialog').getByRole('button',{name:'手动记录',exact:true}).click();
  await p.getByLabel('从相册选',{exact:true}).setInputFiles(photo);
  await p.waitForFunction(()=>document.querySelector('.meal-photo-preview')?.src.startsWith('blob:') &&
    [...document.querySelectorAll('.food-result food-sticker')].every(sticker=>sticker.getAttribute('cutout')==='null'));
  assert.equal(await p.locator('.food-result').count(),6);
  await p.locator('.record-save').click();await p.waitForURL('**/Day.dc.html?**');
  await p.locator('.day-meal-card .tl-photo img').waitFor();
  assert.equal(await p.locator('.day-meal-card').count(),1);
  await p.goto(base+'/Main.dc.html?date=2026-11-12');
  await stickers.nth(5).waitFor();
  assert.equal(await stickers.locator('canvas').count(),0);
  // With no stickers left, the column falls back to the original photo.
  await p.locator('.week-original-photo').waitFor();
  assert.equal(await p.locator('.week-original-photo').count(),1);
  assert.equal(await p.locator('.week-calendar-day[aria-pressed="true"]').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS',engine,'recognition → individual edits → persist → all six stickers → crop → unknown calories → manual item → replacement clears old masks and keeps journal data');
  await browser.close();
 }
 // Exercise endpoint with isolated fake credentials and responses; no external request.
 process.env.OPENAI_API_KEY='unit-test-placeholder';
 const handler=require('../api/recognize.js');
 let responseMeal=structuredClone(meal),sent;
 global.fetch=async(_url,args)=>{sent=JSON.parse(args.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(responseMeal)}]}]})}};
 async function request(){const res={setHeader(){},status(s){this.code=s;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{host:'localhost'},body:{photo:'data:image/jpeg;base64,AAAA'}},res);return res}
 let r=await request();assert.equal(r.code,200);assert.equal(r.body.kcal,450);assert(sent.text.format.schema.required.includes('foods'));
 assert.deepEqual(sent.text.format.schema.properties.foods.items.properties.nutrients.required,['carb','pro','fat']);
 assert.deepEqual(r.body.foods[1].nutrients,{carb:2,pro:null,fat:0});
 responseMeal.foods[0].box.width=1000;r=await request();assert.equal(r.code,502);
 responseMeal=structuredClone(meal);responseMeal.foods[0].kcal=null;responseMeal.kcal=null;responseMeal.portion=null;
 r=await request();assert.equal(r.code,200);assert.equal(r.body.kcal,null);assert.equal(r.body.portion,null);assert.equal(r.body.foods[0].kcal,null);
 responseMeal={...meal,foodVisible:false,foods:[]};r=await request();assert.equal(r.code,200);
 responseMeal={...meal,foods:[]};r=await request();assert.equal(r.code,502);
 console.log('PASS endpoint food schema, per-item total, invalid geometry and empty-food validation');
})().catch(e=>{console.error(e);process.exit(1)});
