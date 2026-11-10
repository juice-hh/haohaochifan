// Shared demo dates and browser-local journal records.
const Journal = (() => {
  const params = new URLSearchParams(location.search);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts();
  const part = (type) => dateParts.find((entry) => entry.type === type).value;
  const today = [part("year"), part("month"), part("day")].join("-");
  const demoDate = "2026-11-06";
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const kinds = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
  const factors = [4, 4, 9];
  const legacyPrefix = "hhcf-meals-v1:";
  const mealPrefix = "hhcf-meal-v2:";
  const weightPrefix = "hhcf-weight-v1:";
  const weightLimits = { min: 1, max: 5000 };
  const undoKey = "hhcf-last-meal-deletion";
  let mealsByDate;
  const seeds = [
    [55.6, 1520, [45, 30, 25], ["三明治", "鸡肉饭", "青菜牛肉面"]],
    [55.4, 2050, [56, 20, 24], ["贝果", "三文鱼饭", "麻辣烫", "奶茶"]],
    [55.9, 1480, [40, 35, 25], ["蓝莓酸奶", "鸡肉沙拉", "海苔饭团"]],
    [55.6, 1560, [42, 33, 25], ["煎蛋吐司", "番茄牛腩饭", "豆腐青菜"]],
    [55.4, 2480, [52, 20, 28], ["贝果", "麻辣烫", "蛋糕", "烤串", "啤酒"]],
    [55.8, 1610, [44, 31, 25], ["燕麦碗", "三文鱼饭"]],
    [55.4, 520, [50, 22, 28], ["番茄牛腩饭"]]
  ];

  const asDate = (date) => new Date(date + "T00:00:00Z");
  const key = (date) => date.toISOString().slice(0, 10);
  function addDays(date, days) {
    const value = asDate(date);
    value.setUTCDate(value.getUTCDate() + days);
    return key(value);
  }
  const weekday = (date) => asDate(date).getUTCDay();
  const weekStart = (date) => addDays(date, -((weekday(date) + 6) % 7));
  const monthStart = (date) => date.slice(0, 7) + "-01";
  function addMonths(date, months) {
    const value = asDate(monthStart(date));
    value.setUTCMonth(value.getUTCMonth() + months);
    return key(value);
  }
  const shortDate = (date) => Number(date.slice(5, 7)) + "月" + Number(date.slice(8)) + "日";
  const dayName = (date) => "周" + weekdays[weekday(date)];
  const fixture = new Map(seeds.map((day, i) => [addDays("2026-11-02", i), day]));
  const validWeight = (value) =>
    Number.isInteger(value) && value >= weightLimits.min && value <= weightLimits.max;
  function savedWeight(date) {
    try {
      const value = Number(localStorage.getItem(weightPrefix + date));
      return validWeight(value) ? value / 10 : null;
    } catch {
      return null;
    }
  }
  function weight(date) {
    return savedWeight(date) ?? fixture.get(date)?.[0] ?? null;
  }
  function previousWeight(date) {
    const dates = Object.keys(localStorage)
      .filter((key) => key.startsWith(weightPrefix))
      .map((key) => key.slice(weightPrefix.length))
      .filter((key) => key < date && isDate(key) && savedWeight(key) !== null);
    if (fixture.has(date)) dates.push(...[...fixture.keys()].filter((key) => key < date));
    const previous = dates.sort().at(-1);
    return previous ? { date: previous, kg: weight(previous), example: savedWeight(previous) === null } : null;
  }
  function saveWeight(date, tenths) {
    if (!isDate(date) || date > today) throw new Error("请选择今天或过去的日期。");
    if (!validWeight(tenths)) throw new Error("请输入有效的体重。");
    localStorage.setItem(weightPrefix + date, String(tenths));
  }
  function isDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return false;
    const parsed = asDate(date);
    return Number.isFinite(parsed.valueOf()) && key(parsed) === date;
  }
  function selected(fallback = demoDate) {
    const date = params.get("date");
    return isDate(date) ? date : fallback;
  }
  function link(page, date, extra = {}) {
    return page + ".dc.html?" + new URLSearchParams({ date, ...extra });
  }

  function readJSON(storage, name) {
    try {
      return JSON.parse(storage.getItem(name));
    } catch {
      return null;
    }
  }

  function legacyMeals(date) {
    const records = readJSON(localStorage, legacyPrefix + date);
    return Array.isArray(records) ? records : [];
  }

  function legacyMeal(id) {
    const match = /^legacy:(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(id);
    if (!match) return null;
    const [, date, index] = match;
    const record = legacyMeals(date)[index];
    return record ? { ...record, id, date, revision: "legacy" } : null;
  }

  function mergeMeal(id, legacy, stored) {
    if (stored?.deleted || (!legacy && !stored)) return null;
    return { ...legacy, ...stored, id };
  }

  function getMeal(id) {
    return mergeMeal(id, legacyMeal(id), readJSON(localStorage, mealPrefix + id));
  }

  function readMeals(date) {
    if (!mealsByDate) {
      const records = new Map();
      const keys = Object.keys(localStorage);
      for (const name of keys.filter((name) => name.startsWith(legacyPrefix))) {
        const date = name.slice(legacyPrefix.length);
        legacyMeals(date).forEach((record, index) => {
          const id = "legacy:" + date + ":" + index;
          records.set(id, { ...record, id, date, revision: "legacy" });
        });
      }
      for (const name of keys.filter((name) => name.startsWith(mealPrefix))) {
        const id = name.slice(mealPrefix.length);
        const record = mergeMeal(id, records.get(id), readJSON(localStorage, name));
        if (record) records.set(id, record);
        else records.delete(id);
      }
      mealsByDate = new Map();
      const ordered = [...records.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      for (const record of ordered) {
        const day = mealsByDate.get(record.date) ?? [];
        day.push(record);
        mealsByDate.set(record.date, day);
      }
    }
    return mealsByDate.get(date) ?? [];
  }

  function assertCurrent(original) {
    if (getMeal(original.id)?.revision !== original.revision) {
      throw new Error("这餐在另一处被修改了，请返回当天详情后重新打开。");
    }
  }

  function recentMealDays(days) {
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(today, -i);
      return { date, meals: readMeals(date) };
    }).filter(({ meals }) => meals.length);
  }

  function saveMeal(date, meal, original) {
    if (!isDate(date) || date > today) throw new Error("请选择今天或过去的日期。");
    const id = original?.id ?? crypto.randomUUID();
    if (original) assertCurrent(original);
    const record = {
      ...meal, date, revision: crypto.randomUUID(),
      createdAt: original ? original.createdAt ?? 0 : Date.now()
    };
    // Legacy records remain readable. An unchanged photo can stay in its original record.
    if (legacyMeal(id)?.photo === record.photo && id.startsWith("legacy:")) delete record.photo;
    localStorage.setItem(mealPrefix + id, JSON.stringify(record));
    mealsByDate = undefined;
  }

  function deleteMeal(original) {
    assertCurrent(original);
    const id = original.id;
    const name = mealPrefix + id;
    const token = crypto.randomUUID();
    const previous = localStorage.getItem(name);
    const marker = legacyMeal(id) ? JSON.stringify({ deleted: token }) : null;
    const lastUndo = sessionStorage.getItem(undoKey);
    const undo = { id, token, previous, marker, date: original.date, name: original.name };
    sessionStorage.setItem(undoKey, JSON.stringify(undo));
    try {
      if (marker) localStorage.setItem(name, marker);
      else localStorage.removeItem(name);
    } catch (error) {
      if (lastUndo === null) sessionStorage.removeItem(undoKey);
      else sessionStorage.setItem(undoKey, lastUndo);
      throw error;
    }
    mealsByDate = undefined;
    return token;
  }

  function pendingUndo(token, date) {
    if (!token) return null;
    const undo = readJSON(sessionStorage, undoKey);
    if (undo?.token !== token || undo.date !== date) return null;
    return localStorage.getItem(mealPrefix + undo.id) === undo.marker ? undo : null;
  }

  function undoDelete(token, date) {
    const undo = pendingUndo(token, date);
    if (!undo) return false;
    const name = mealPrefix + undo.id;
    if (undo.previous === null) localStorage.removeItem(name);
    else localStorage.setItem(name, undo.previous);
    mealsByDate = undefined;
    sessionStorage.removeItem(undoKey);
    return true;
  }

  window.addEventListener("storage", () => { mealsByDate = undefined; });

  function nutrition(energy) {
    const total = energy.reduce((sum, value) => sum + value, 0);
    const percentages = total
      ? energy.map((value) => Math.round(value * 100 / total))
      : [0, 0, 0];
    if (total) {
      const largest = energy.indexOf(Math.max(...energy));
      percentages[largest] += 100 - percentages.reduce((sum, value) => sum + value, 0);
    }
    return {
      kcal: Math.round(total),
      percentages,
      grams: energy.map((value, i) => Math.round(value / factors[i]))
    };
  }

  const estimate = (grams) => nutrition(grams.map((value, i) => value * factors[i]));
  function day(date) {
    const seed = fixture.get(date);
    const examples = (seed?.[3] ?? []).map((name) => ({ name, example: true }));
    const records = readMeals(date);
    const energy = factors.map((factor, i) =>
      (seed ? seed[1] * seed[2][i] / 100 : 0)
      + records.reduce((sum, meal) => sum + (meal.grams?.[i] ?? 0) * factor, 0)
    );
    return {
      date,
      meals: [...examples, ...records],
      weight: weight(date),
      ...nutrition(energy)
    };
  }

  return {
    params, today, demoDate, kinds, asDate, addDays, weekday, weekStart, monthStart, addMonths,
    shortDate, dayName, isDate, selected, link, day, weight, estimate,
    getMeal, saveMeal, deleteMeal, pendingUndo, undoDelete, recentMealDays,
    savedWeight, previousWeight, saveWeight, weightLimits
  };
})();

// A restored history entry can otherwise keep pre-save totals in its DOM.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
