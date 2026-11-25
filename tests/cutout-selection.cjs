// Real local segmentation with no nutrition API, using one whole serving.
const {chromium, webkit} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4176';
async function check(browser, engine) {
  const context = await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2});
  await context.addInitScript(() => localStorage.setItem('hhcf-record-mode','manual'));
  const page = await context.newPage();
  await page.goto(base + '/Record.dc.html');
  await page.locator('#meal-library').setInputFiles(path.resolve('tests/fixtures/salad-real.jpg'));
  await page.getByRole('button',{name:'＋ 添加餐品',exact:true}).click();
  await page.getByRole('button',{name:'单独抠出食物 1',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'调整贴纸'});
  const stage = dialog.locator('.food-crop-stage');
  await stage.scrollIntoViewIfNeeded();
  await stage.locator('img').evaluate(img=>img.decode());
  const image = await stage.boundingBox();
  const move = ([x,y]) => page.mouse.move(image.x+image.width*x, image.y+image.height*y);
  const click = async (pos) => {await move(pos); await page.mouse.down(); await page.mouse.up();};
  const select = async (tool, points) => {
    await dialog.getByRole('button',{name:tool,exact:true}).click();
    await stage.scrollIntoViewIfNeeded();
    Object.assign(image,await stage.boundingBox());
    if (tool === '点选') {
      for (const point of points) await click(point);
    } else {
      await move(points[0]); await page.mouse.down();
      for(const point of points.slice(1)) await move(point);
      await page.mouse.up();
      assert.match(await dialog.locator('.cutout-guide path').getAttribute('d'), /Z$/);
    }
    const confirm = dialog.getByRole('button',{name:'使用这张贴纸',exact:true});
    await page.waitForFunction(() => document.querySelector('.food-crop-sheet .app-sheet-confirm')?.disabled === false,{}, {timeout:42000});
    await dialog.locator('.cutout-result canvas').waitFor();
    const cutout = JSON.parse(await dialog.locator('.cutout-result food-sticker').getAttribute('cutout'));
    assert(cutout.box.width > 500 && cutout.box.height > 500, JSON.stringify({tool,box:cutout.box}));
    const alpha = await dialog.locator('.cutout-result canvas').evaluate(canvas => {
      const ctx=canvas.getContext('2d'), a=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let blank=0, white=0, opaque=0;
      for(let i=0;i<a.length;i+=4){
        if(a[i+3]===0) blank++;
        if(a[i+3]>240){opaque++;if(a[i]===255&&a[i+1]===255&&a[i+2]===255)white++;}
      }
      return {blank,opaque,white};
    });
    assert(alpha.blank > 50 && alpha.opaque > 50 && alpha.white > 50, JSON.stringify(alpha));
    console.log('PASS', engine, tool, cutout.box);
    return confirm;
  };
  await select('点选',[[.37,.32],[.66,.58]]);
  await select('框选',[[.13,.12],[.88,.88]]);
  const confirm = await select('圈画',[[.42,.12],[.69,.12],[.85,.30],[.87,.66],[.72,.85],[.39,.88],[.20,.78],[.13,.46],[.22,.22],[.42,.12]]);
  await confirm.click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.food-result canvas').waitFor();
  await context.close();
}
(async()=>{
 for(const [engine,e,options] of [['Chromium',chromium,{channel:'chrome'}],['WebKit',webkit,{executablePath:process.env.HOME+'/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'}]]){
  const browser = await e.launch(options);
  try {await check(browser,engine)} finally {await browser.close()}
 }
})().catch(error=>{console.error(error);process.exit(1)});
