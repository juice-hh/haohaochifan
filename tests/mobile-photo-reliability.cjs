const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4176';
const photo = path.resolve('tests/fixtures/salad-real.jpg');
const box = { x: 200, y: 200, width: 600, height: 600 };
const meal = {
  foodVisible: true, name: '沙拉', portion: null, kcal: null, carb: null, pro: null, fat: null, notes: '',
  foods: [{ name: '沙拉', kcal: null, box, regions: [box] }]
};

(async () => {
  for (const [engine, service] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await service.launch(engine === 'chromium' ? { channel: 'chrome' } : {
      executablePath: process.env.HOME + '/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'
    });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('crash', () => errors.push('page crashed'));
      page.on('dialog', dialog => { errors.push('native dialog: ' + dialog.type()); dialog.dismiss(); });
      await page.goto(base + '/Main.dc.html');
      await page.getByRole('link', { name: '贴计划', exact: true }).tap({ position: { x: 5, y: 5 } });
      await page.waitForURL('**/Album.dc.html?**');
      await page.getByRole('button', { name: '锻炼', exact: true }).waitFor();
      await page.getByRole('button', { name: '散步', exact: true }).tap();
      await page.locator('.calendar-cell[data-selected="true"] button').tap();
      assert.equal(await page.locator('.calendar-cell[data-selected="true"] .plan-icon[data-plan=walk]').count(), 1);
      assert.equal(/\p{Extended_Pictographic}/u.test(await page.locator('.plan-picker').innerText()), false);
      await page.goto(base + '/Main.dc.html');
      await page.getByRole('link', { name: '称重', exact: true }).tap();
      await page.waitForURL('**/Weigh.dc.html?**');

      const record = base + '/Record.dc.html?date=2026-11-12';
      await page.route('**/api/recognize', route => route.fulfill({ json: meal }));
      let matchingCalls = 0;
      await page.route('**/api/match-foods', route => {
        matchingCalls++;
        return route.abort();
      });
      await page.goto(record);
      await page.getByRole('button', { name: '记录日期', exact: true }).tap();
      const dateSheet = page.getByRole('dialog', { name: '记录日期' });
      await dateSheet.getByRole('button', { name: '11月11日', exact: true }).tap();
      assert.match(await page.locator('.record-date').innerText(), /11月11日/);

      // Simulate a worker stall, reload the tab, then regenerate with actual local pixel segmentation.
      await page.evaluate(() => {
        FoodStickers.generate = () => new Promise(() => {});
      });
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '从相册选', exact: true }).tap();
      await (await chooser).setFiles(photo);
      await page.getByRole('button', { name: '停止生成贴纸', exact: true }).waitFor();
      assert.equal(await page.evaluate(async () => (await Journal.readPhotoDraft(history.state.photoDraft))?.fields.foods.length), 1);
      await page.reload();
      await page.getByText('已恢复上次的照片草稿。', { exact: true }).waitFor();
      await page.locator('.meal-photo-preview').waitFor();
      assert.match(await page.locator('.record-date').innerText(), /11月11日/);
      await page.getByRole('button', { name: '重试生成贴纸', exact: true }).tap();
      await page.locator('.food-editor-row food-sticker canvas').waitFor({ timeout: 45000 });
      assert.equal(matchingCalls, 0);
      assert.equal(await page.locator('[name=food-kcal-0]').inputValue(), '');

      // Open a fresh journal entry so its empty state cannot include the recovered draft.
      await page.goto(base + '/Record.dc.html?date=2026-11-13');
      await page.getByRole('button', { name: '从相册选', exact: true }).waitFor();
      await page.getByLabel('从相册选', { exact: true }).setInputFiles(photo);
      const sticker = page.locator('.food-editor-row food-sticker[cutout^="{"]');
      await sticker.locator('canvas').waitFor({ timeout: 45000 });
      assert.equal(matchingCalls, 0);
      const mask = JSON.parse(await sticker.getAttribute('cutout')).mask;
      assert(mask.startsWith('data:image/png'));
      const journalDraft = await page.evaluate(() => history.state.photoDraft);
      await page.locator('.record-save').tap();
      await page.waitForURL('**/Main.dc.html?**');
      await page.reload();
      await page.locator('.week-board-sticker canvas').waitFor();
      assert.equal(await page.evaluate(key => Journal.readPhotoDraft(key), journalDraft), undefined);
      assert.deepEqual(errors, []);
      console.log('PASS', engine, 'top touch targets, plan icons, in-app calendar, reloaded photo draft, automatic alpha sticker, saved journal');
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exit(1); });
