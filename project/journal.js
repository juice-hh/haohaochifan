// Shared dates and browser-local journal records.
const Journal = (() => {
  const params = new URLSearchParams(location.search);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts();
  const part = (type) => dateParts.find((entry) => entry.type === type).value;
  const today = [part("year"), part("month"), part("day")].join("-");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const kinds = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
  const factors = [4, 4, 9];
  const legacyPrefix = "hhcf-meals-v1:";
  const mealPrefix = "hhcf-meal-v2:";
  const weightPrefix = "hhcf-weight-v1:";
  const planPrefix = "hhcf-plan-v1:";
  const planStickers = [
    { id: "workout", icon: "🏋️", label: "锻炼" },
    { id: "walk", icon: "🚶", label: "散步" },
    { id: "cook", icon: "🍳", label: "做饭" }
  ];
  const weightLimits = { min: 1, max: 5000 };
  const undoKey = "hhcf-last-meal-deletion";
  let mealsByDate;

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
  const validWeight = (value) =>
    Number.isInteger(value) && value >= weightLimits.min && value <= weightLimits.max;
  function parseWeight(text) {
    const value = text.trim().normalize("NFKC").replace(/[,。]/g, ".");
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
    const tenths = Number(value) * 10;
    return tenths >= weightLimits.min && tenths <= weightLimits.max ? Math.round(tenths) : null;
  }

  function savedWeight(date) {
    try {
      const value = Number(localStorage.getItem(weightPrefix + date));
      return validWeight(value) ? value / 10 : null;
    } catch {
      return null;
    }
  }
  function previousWeight(date) {
    const dates = Object.keys(localStorage)
      .filter((key) => key.startsWith(weightPrefix))
      .map((key) => key.slice(weightPrefix.length))
      .filter((key) => key < date && isDate(key) && savedWeight(key) !== null);
    const previous = dates.sort().at(-1);
    return previous ? { date: previous, kg: savedWeight(previous) } : null;
  }

  function latestWeight() {
    const kg = savedWeight(today);
    return kg === null ? previousWeight(today) : { date: today, kg };
  }

  function readGoal() {
    const goal = readJSON(localStorage, "hhcf-goal-v1");
    return {
      habit: typeof goal?.habit === "string" ? goal.habit : "",
      weight: validWeight(goal?.weight) ? goal.weight : null
    };
  }

  function saveGoal(goal) {
    localStorage.setItem("hhcf-goal-v1", JSON.stringify(goal));
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
  function selected(fallback = today) {
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

  const planKey = (date, id) => planPrefix + date + ":" + id;

  function plansOn(date) {
    try {
      return planStickers.filter(({ id }) => localStorage.getItem(planKey(date, id)) === "1");
    } catch {
      return [];
    }
  }

  function togglePlan(date, id) {
    if (!isDate(date) || !planStickers.some((sticker) => sticker.id === id)) {
      throw new Error("请选择有效的日期和计划。");
    }
    const key = planKey(date, id);
    if (localStorage.getItem(key) === "1") {
      localStorage.removeItem(key);
      return false;
    }
    localStorage.setItem(key, "1");
    return true;
  }

  let photoDatabase;
  const photoURLs = new Map();
  let photoUpdateScheduled = false;

  function openPhotoDatabase() {
    if (!photoDatabase) {
      photoDatabase = new Promise((resolve, reject) => {
        const request = indexedDB.open("hhcf-photos", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("photos");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((error) => {
        photoDatabase = undefined;
        throw error;
      });
    }
    return photoDatabase;
  }

  async function accessPhotos(mode, operation) {
    const database = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("photos", mode);
      const request = operation(transaction.objectStore("photos"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error);
    });
  }

  function photoFor(meal) {
    if (!meal?.photoKey) return meal?.photo ?? "";
    const { photoKey } = meal;
    if (!photoURLs.has(photoKey)) {
      photoURLs.set(photoKey, "");
      accessPhotos("readonly", (store) => store.get(photoKey))
        .then((photo) => {
          if (!photo) return;
          photoURLs.set(photoKey, URL.createObjectURL(new Blob([photo], { type: "image/jpeg" })));
          if (!photoUpdateScheduled) {
            photoUpdateScheduled = true;
            requestAnimationFrame(() => {
              photoUpdateScheduled = false;
              window.dispatchEvent(new Event("journalphotos"));
            });
          }
        })
        .catch(() => {});
    }
    return photoURLs.get(photoKey);
  }

  function discardPhoto(photoKey) {
    if (photoKey) {
      accessPhotos("readwrite", (store) => store.delete(photoKey)).catch(() => {});
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

  async function saveMeal(date, meal, original, replacementPhoto) {
    if (!isDate(date) || date > today) throw new Error("请选择今天或过去的日期。");
    const id = original?.id ?? crypto.randomUUID();
    if (original) assertCurrent(original);
    const record = {
      ...meal, date, revision: crypto.randomUUID(),
      createdAt: original ? original.createdAt ?? 0 : Date.now()
    };
    const legacyPhoto = original ? legacyMeal(id)?.photo : undefined;
    let addedPhotoKey;
    if (replacementPhoto !== null && legacyPhoto) record.photo = "";
    if (replacementPhoto) {
      addedPhotoKey = record.revision;
      const jpeg = await (await fetch(replacementPhoto)).arrayBuffer();
      await accessPhotos("readwrite", (store) => store.put(jpeg, addedPhotoKey));
      record.photoKey = addedPhotoKey;
    } else if (replacementPhoto === null && original) {
      if (original.photoKey) record.photoKey = original.photoKey;
      else if (original.photo !== undefined && original.photo !== legacyPhoto) record.photo = original.photo;
    }
    try {
      if (original) assertCurrent(original);
      localStorage.setItem(mealPrefix + id, JSON.stringify(record));
    } catch (error) {
      discardPhoto(addedPhotoKey);
      throw error;
    }
    if (replacementPhoto !== null) discardPhoto(original?.photoKey);
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
  function mealMacros(meal) {
    // Old photo-only records stored zeroes before unknown values were distinguished.
    const values = meal?.grams ?? [];
    if (!meal?.nutritionFields && !Number.isFinite(meal?.kcal) && !values.some((value) => Number(value) > 0)) {
      return [null, null, null];
    }
    return [0, 1, 2].map((i) => Number.isFinite(values[i]) ? values[i] : null);
  }

  function day(date) {
    const meals = readMeals(date);
    const energy = factors.map((factor, i) =>
      meals.reduce((sum, meal) => sum + (meal.grams?.[i] ?? 0) * factor, 0)
    );
    return {
      date, meals,
      macroKnown: factors.map((_, i) => meals.some((meal) => mealMacros(meal)[i] !== null)),
      weight: savedWeight(date),
      ...nutrition(energy),
      kcal: Math.round(meals.reduce((sum, meal) => sum + (Number.isFinite(meal.kcal)
        ? meal.kcal : estimate(meal.grams ?? [0, 0, 0]).kcal), 0))
    };
  }

  return {
    params, today, kinds, asDate, addDays, weekday, weekStart, monthStart, addMonths,
    shortDate, dayName, isDate, selected, link, day, estimate,
    getMeal, mealMacros, photoFor, saveMeal, deleteMeal, pendingUndo, undoDelete, recentMealDays,
    savedWeight, previousWeight, latestWeight, saveWeight, weightLimits, parseWeight, readGoal, saveGoal, planStickers, plansOn, togglePlan
  };
})();

// A restored history entry can otherwise keep pre-save totals in its DOM.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
