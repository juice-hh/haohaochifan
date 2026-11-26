// Record book: daily state, meal feelings, exercise types, period record and review, settings toggles.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4176';
const shanghai=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const addDays=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='chromium'?chromium.launch({channel:'chrome'}):webkit.launch({executablePath:process.env.HOME+'/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'}));
  for(const width of [390,320]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
   const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   const today=shanghai(),yesterday=addDays(today,-1);
   await p.goto(base+'/Main.dc.html');
   await p.evaluate(({today,yesterday})=>{
    const S=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
    S('hhcf-diet-focus','sugar');
    const meal=(id,date,kind,name,foods,hour)=>S('hhcf-meal-v2:'+id,{date,kind,name,kcal:foods.reduce((a,f)=>a+f.kcal,0),grams:[60,20,10],nutritionFields:true,
      focusNutrients:{totalSugar:8,addedSugar:foods.reduce((a,f)=>a+(f.nutrients.addedSugar||0),0)},foods,revision:id,createdAt:new Date(date+'T'+hour+':00+08:00').getTime()});
    meal('t1',today,'lunch','牛肉面',[{name:'番茄牛肉面',kcal:560,nutrients:{carb:78,pro:26,fat:14,totalSugar:6,addedSugar:2}}],'12:30');
    meal('t2',today,'breakfast','早饭',[{name:'拿铁',kcal:120,nutrients:{carb:12,pro:6,fat:5,totalSugar:12,addedSugar:9}}],'08:10');
    meal('t3',yesterday,'lunch','米饭套餐',[{name:'米饭',kcal:230,nutrients:{carb:50,pro:4,fat:1,totalSugar:0,addedSugar:0}}],'12:20');
    S('hhcf-afternoon-v1:'+yesterday,'sleepy');
   },{today,yesterday});

   // 本周: state, refined-carb and sugar marks, dish tip, exercise sheet, feelings.
   await p.reload();
   const card=p.locator('.week-day-record');
   await card.getByRole('button',{name:'轻盈',exact:true}).click();
   assert.equal(await p.locator('.state-row').getAttribute('data-state'),'light');
   assert.equal(await p.locator('.week-calendar-day[aria-pressed="true"]').getAttribute('data-state'),'light');
   assert.equal(await p.locator('.sticker-focus-mark[data-mark="grain"]').count(),1,'noodles carry the refined-carb mark');
   assert.equal(await p.locator('.sticker-focus-mark[data-mark="sugar"]').count(),1,'latte carries the sugar mark');
   await p.locator('.week-board-sticker').filter({hasText:'番茄牛肉面'}).click();
   await p.locator('.dish-card-tip').getByText('先吃菜和肉，再吃主食').waitFor();
   await p.locator('.day-chip[data-kind="move"]').click();
   const sheet=p.getByRole('dialog');
   await sheet.getByRole('button',{name:/力量/}).click();
   await sheet.getByRole('button',{name:'深蹲',exact:true}).click();
   await sheet.getByRole('button',{name:'15 分钟',exact:true}).click();
   await sheet.getByRole('button',{name:'记下来',exact:true}).click();
   await p.locator('.day-chip[data-kind="move"]').filter({hasText:'15'}).waitFor();
   await p.locator('.move-week').getByText('1').first().waitFor();
   assert.match(await p.locator('.move-card[data-type="strength"]').innerText(),/1\s*\/ 2 次/);
   await p.locator('.feeling-bubble').first().click();
   await p.getByRole('dialog').getByRole('button',{name:'有点撑',exact:true}).click();
   await p.getByRole('dialog').getByRole('button',{name:'好了',exact:true}).click();
   await p.locator('.feeling-bubble[data-tone="warn"]').waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'week page fits '+width);

   // 一天一页: timeline order, afternoon check, quick exercise removal, note.
   await p.goto(base+'/Day.dc.html?date='+yesterday);
   await p.locator('.tl-row[data-type="meal"]').first().waitFor();
   await p.locator('.tl-ask').getByRole('button',{name:'有点困',exact:true}).waitFor();
   assert.equal(await p.locator('.tl-ask button[aria-pressed="true"]').innerText(),'有点困');
   await p.locator('.tl-ask').getByRole('button',{name:'清醒',exact:true}).click();
   assert.equal(await p.evaluate(d=>JSON.parse(localStorage.getItem('hhcf-afternoon-v1:'+d)),yesterday),'clear');
   await p.getByRole('button',{name:'写给今天的一句话'}).click();
   await p.getByRole('dialog').locator('textarea').fill('午饭吃米饭，下午有点困。');
   await p.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
   await p.locator('.tl-note').filter({hasText:'午饭吃米饭'}).waitFor();
   await p.goto(base+'/Day.dc.html?date='+today);
   const times=await p.locator('.tl-row[data-type="meal"] .tl-time').allTextContents();
   assert.deepEqual(times,['8:10','12:30']);
   await p.locator('.tl-row[data-type="move"]').getByRole('button',{name:/删除这次/}).click();
   assert.equal(await p.locator('.tl-row[data-type="move"]').count(),0);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'day page fits '+width);

   // Settings and period: off by default, enable, record, end, review.
   await p.goto(base+'/Settings.dc.html');
   const periodSwitch=p.getByRole('switch',{name:'记录经期'});
   assert.equal(await periodSwitch.getAttribute('aria-checked'),'false');
   await periodSwitch.click();
   assert.equal(await periodSwitch.getAttribute('aria-checked'),'true');
   await p.evaluate(()=>{
    const S=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
    ['2026-10-01','2026-10-02','2026-10-03','2026-10-04'].forEach((d,i)=>S('hhcf-period-v1:'+d,{flow:'medium',feelings:['sleepy'],end:i===3}));
   });
   await p.getByRole('link',{name:'经期记录和复盘'}).click();
   await p.getByRole('button',{name:'今天来了',exact:true}).click();
   await p.getByRole('button',{name:/少/}).click();
   await p.getByRole('button',{name:'想吃甜的',exact:true}).click();
   assert.deepEqual(await p.evaluate(d=>JSON.parse(localStorage.getItem('hhcf-period-v1:'+d)),today),{flow:'light',feelings:['craveSweet'],end:false});
   await p.goto(base+'/Main.dc.html');
   await p.locator('.period-pill').getByText('经期第 1 天').waitFor();
   await p.locator('.week-period-band').waitFor();
   await p.goto(base+'/Period.dc.html');
   await p.getByRole('button',{name:'经期结束了',exact:true}).click();
   await p.locator('.rv-hero h2').waitFor();
   assert.match(await p.locator('.rv-hero h2').innerText(),/这次比上次轻松一些|这次辛苦了一些/);
   await p.locator('.mirror-row').filter({hasText:'想吃甜的'}).waitFor();
   await p.locator('.period-compare').waitFor();
   await p.getByRole('button',{name:'加入计划'}).first().click();
   assert.equal(await p.locator('.period-habit button[aria-pressed="true"]').count(),1);
   await p.locator('.period-care').getByText('请去看医生').waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'period page fits '+width);
   await p.goto(base+'/Main.dc.html');
   await p.locator('.review-entry').waitFor();

   // Period data never goes to recognition.
   const sent=[];
   await p.route('**/api/recognize',async r=>{sent.push(r.request().postData()||'');await r.fulfill({json:{foodVisible:false,name:'',portion:null,kcal:null,carb:null,pro:null,fat:null,notes:'',foods:[]}});});
   await p.goto(base+'/Record.dc.html?date='+today);
   await p.evaluate(()=>localStorage.setItem('hhcf-record-mode','ai'));
   await p.reload();
   await p.getByLabel('从相册选',{exact:true}).setInputFiles(require('node:path').resolve('tests/fixtures/salad-real.jpg'));
   await p.waitForTimeout(1500);
   assert(sent.length===0||sent.every(body=>!/period|经期|craveSweet/.test(body)),'recognition request carries no period data');

   assert.deepEqual(errors,[],engine+' '+width+' page errors');
   console.log('PASS',engine,width+'px','state, feelings, exercise types, refined-carb mark, afternoon check, note, period record, review, settings, no period data in recognition');
   await context.close();
  }
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1);});
