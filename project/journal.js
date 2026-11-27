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
  const weightPrefix = "hhcf-weight-v2:";
  const legacyWeightPrefix = "hhcf-weight-v1:";
  const planPrefix = "hhcf-plan-v1:";
  const planStickers = [
    { id: "workout", label: "锻炼" },
    { id: "walk", label: "散步" },
    { id: "cook", label: "做饭" }
  ];
  // Store weights in hundredths of a kilogram for exact input and comparisons.
  const weightLimits = { min: 10, max: 50000 };
  const undoKey = "hhcf-last-meal-deletion";
  const dietFocusKey = "hhcf-diet-focus";
  const dietFocuses = [
    { id: "basic", label: "基础记录", fields: [], hint: "记录热量、碳水、蛋白质和脂肪。" },
    { id: "sugar", label: "抗糖饮食", fields: ["totalSugar", "addedSugar"], hint: "额外记录总糖和添加糖。总糖也包括水果、牛奶里天然存在的糖。" },
    { id: "antiInflammatory", label: "抗炎饮食", fields: ["fiber"], hint: "额外记录膳食纤维，回看蔬果、全谷物和豆类等食物的摄入。" }
  ];
  const focusNutrients = { totalSugar: "总糖", addedSugar: "添加糖", fiber: "膳食纤维" };
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
  const legacyWeight = (tenths) =>
    Number.isInteger(tenths) && validWeight(tenths * 10) ? tenths * 10 : null;
  const formatWeight = (hundredths) => (hundredths / 100).toFixed(2);

  function parseWeight(text) {
    const value = text.trim().normalize("NFKC").replace(/[,。]/g, ".");
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    const hundredths = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
    return validWeight(hundredths) && Number(value) <= weightLimits.max / 100 ? hundredths : null;
  }

  function savedWeight(date) {
    try {
      const value = Number(localStorage.getItem(weightPrefix + date));
      return validWeight(value) ? value : legacyWeight(Number(localStorage.getItem(legacyWeightPrefix + date)));
    } catch {
      return null;
    }
  }
  function previousWeight(date) {
    const dates = Object.keys(localStorage)
      .filter((key) => key.startsWith(weightPrefix) || key.startsWith(legacyWeightPrefix))
      .map((key) => key.slice(key.indexOf(":") + 1))
      .filter((key) => key < date && isDate(key) && savedWeight(key) !== null);
    const previous = dates.sort().at(-1);
    return previous ? { date: previous, weight: savedWeight(previous) } : null;
  }

  function latestWeight() {
    const weight = savedWeight(today);
    return weight === null ? previousWeight(today) : { date: today, weight };
  }

  function readGoal() {
    const goal = readJSON(localStorage, "hhcf-goal-v1");
    const weight = goal?.weightHundredths ?? legacyWeight(goal?.weight);
    return {
      habit: typeof goal?.habit === "string" ? goal.habit : "",
      weight: validWeight(weight) ? weight : null,
      movement: Number.isInteger(goal?.movement) && goal.movement >= 1 && goal.movement <= 10080 ? goal.movement : null,
      kcal: Number.isInteger(goal?.kcal) && goal.kcal >= 500 && goal.kcal <= 6000 ? goal.kcal : null
    };
  }

  function saveGoal({ habit, weight, movement, kcal = null }) {
    localStorage.setItem("hhcf-goal-v1", JSON.stringify({ habit, weightHundredths: weight, movement, kcal }));
  }

  function movementOn(date) {
    const minutes = readJSON(localStorage, "hhcf-movement-v1:" + date);
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null;
  }

  function saveMovement(date, minutes) {
    if (!isDate(date) || date > today || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      throw new Error("请填写 0 到 1440 之间的运动分钟数。");
    }
    localStorage.setItem("hhcf-movement-v1:" + date, JSON.stringify(minutes));
  }

  function readDietFocus() {
    const id = readJSON(localStorage, dietFocusKey);
    return dietFocuses.find((focus) => focus.id === id) ?? dietFocuses[0];
  }

  function saveDietFocus(id) {
    localStorage.setItem(dietFocusKey, JSON.stringify(id));
  }

  function saveWeight(date, hundredths) {
    if (!isDate(date) || date > today) throw new Error("请选择今天或过去的日期。");
    if (!validWeight(hundredths)) throw new Error("请输入有效的体重。");
    localStorage.setItem(weightPrefix + date, String(hundredths));
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

  function mealFocusNutrient(meal, key) {
    const amount = meal?.focusNutrients?.[key];
    return Number.isFinite(amount) && amount >= 0 && amount <= 10000 ? amount : null;
  }

  function dayFocusNutrients(meals) {
    if (!meals.length) return [];
    const activeFields = readDietFocus().fields;
    return Object.entries(focusNutrients).flatMap(([key, label]) => {
      const amounts = meals.map((meal) => mealFocusNutrient(meal, key)).filter((value) => value !== null);
      if (!amounts.length && !activeFields.includes(key)) return [];
      const total = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 10) / 10;
      return [{
        key, label, value: amounts.length ? total : null,
        amount: amounts.length ? total + " g" : "未记录",
        coverage: amounts.length && amounts.length < meals.length ? amounts.length + "/" + meals.length + " 餐有记录" : ""
      }];
    });
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

  // ---- Record book: how the day felt, movement, notes and the optional period log ----
  const states = [
    { id: "light", label: "轻盈", tone: "good" },
    { id: "spirit", label: "精神", tone: "good" },
    { id: "ok", label: "一般", tone: "plain" },
    { id: "sleepy", label: "犯困", tone: "low" },
    { id: "puffy", label: "浮肿", tone: "low" }
  ];
  const afternoonOptions = [
    { id: "clear", label: "清醒" }, { id: "sleepy", label: "有点困" }, { id: "verySleepy", label: "很困" }
  ];
  const mealFeelings = [
    { id: "comfy", label: "舒服", tone: "good" }, { id: "fresh", label: "清爽", tone: "good" },
    { id: "justFull", label: "刚好饱", tone: "good" }, { id: "stuffed", label: "有点撑", tone: "warn" },
    { id: "hungry", label: "还饿", tone: "warn" }, { id: "greasy", label: "有点腻", tone: "warn" },
    { id: "sleepyAfter", label: "饭后犯困", tone: "warn" }
  ];
  const exerciseTypes = [
    { id: "aerobic", label: "有氧", hint: "走路 跑步 骑车 游泳", presets: ["饭后走走", "快走", "跑步", "骑车", "游泳", "跳绳"] },
    { id: "strength", label: "力量", hint: "深蹲 俯卧撑 器械", presets: ["深蹲", "靠桌俯卧撑", "哑铃", "平板支撑", "弹力带", "器械"] },
    { id: "stretch", label: "舒展", hint: "瑜伽 拉伸 普拉提", presets: ["瑜伽", "拉伸", "普拉提"] }
  ];
  const quickExercises = [
    { label: "饭后走走", type: "aerobic", minutes: 15, afterMeal: true },
    { label: "快走", type: "aerobic", minutes: 30 },
    { label: "深蹲", type: "strength", minutes: 10 }
  ];
  const periodFlows = [{ id: "light", label: "少", dots: 1 }, { id: "medium", label: "中", dots: 2 }, { id: "heavy", label: "多", dots: 3 }];
  // The order and wording follow the design. "肚子疼" keeps the stored id "cramps".
  const periodFeelings = [
    { id: "backache", label: "腰酸" }, { id: "cramps", label: "肚子疼" }, { id: "craveSweet", label: "想吃甜的" },
    { id: "veryHungry", label: "特别饿" }, { id: "noAppetite", label: "没胃口" }, { id: "bloated", label: "浮肿" },
    { id: "low", label: "情绪低" }, { id: "sleepy", label: "很困", extra: true }
  ];
  const habitOptions = [
    { id: "earlyLastBite", label: "23 点前吃完最后一口", hint: "让经期前的觉睡得更好", icon: "bed" },
    { id: "strengthTwice", label: "每周 2 次力量", hint: "深蹲 靠桌俯卧撑都算", icon: "dumbbell" },
    { id: "walkAfterDinner", label: "晚饭后走 15 分钟", hint: "下午和晚上都会更清爽", icon: "walk" }
  ];
  const stateKey = (date) => "hhcf-state-v1:" + date;
  const afternoonKey = (date) => "hhcf-afternoon-v1:" + date;
  const feelingKey = (mealId) => "hhcf-feel-v1:" + mealId;
  const exerciseKey = (date) => "hhcf-exercise-v1:" + date;
  const noteKey = (date) => "hhcf-note-v1:" + date;
  const periodKey = (date) => "hhcf-period-v1:" + date;
  const periodPrefix = "hhcf-period-v1:";

  const pickId = (list, id) => list.some((item) => item.id === id) ? id : null;
  const stateOn = (date) => pickId(states, readJSON(localStorage, stateKey(date)));
  function saveState(date, id) {
    if (!isDate(date) || date > today) throw new Error("只能记录今天或过去的状态。");
    if (id === null) localStorage.removeItem(stateKey(date));
    else if (pickId(states, id)) localStorage.setItem(stateKey(date), JSON.stringify(id));
  }
  const afternoonOn = (date) => pickId(afternoonOptions, readJSON(localStorage, afternoonKey(date)));
  function saveAfternoon(date, id) {
    if (!isDate(date) || date > today) throw new Error("只能记录今天或过去的状态。");
    if (id === null) localStorage.removeItem(afternoonKey(date));
    else if (pickId(afternoonOptions, id)) localStorage.setItem(afternoonKey(date), JSON.stringify(id));
  }
  function feelingsFor(mealId) {
    const value = readJSON(localStorage, feelingKey(mealId));
    return Array.isArray(value) ? value.filter((id) => pickId(mealFeelings, id)) : [];
  }
  function saveFeelings(mealId, ids) {
    const clean = [...new Set(ids)].filter((id) => pickId(mealFeelings, id));
    if (clean.length) localStorage.setItem(feelingKey(mealId), JSON.stringify(clean));
    else localStorage.removeItem(feelingKey(mealId));
  }

  // Shanghai clock time, used to place records on the day timeline.
  const clockParts = (ms) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const get = (type) => parts.find((entry) => entry.type === type).value;
    return { date: [get("year"), get("month"), get("day")].join("-"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
  };
  const nowMinutes = () => clockParts(Date.now()).minutes;
  const clock = (minutes) => Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
  const nominalMeal = { breakfast: 480, lunch: 750, snack: 930, dinner: 1110 };
  function mealMinutes(meal) {
    const kind = kindKeyOf(meal);
    const nominal = nominalMeal[kind] ?? 720;
    // Trust the saved time only when it fits the meal; a breakfast logged at night stays in the morning.
    if (Number.isFinite(meal?.createdAt) && meal.createdAt > 0) {
      const at = clockParts(meal.createdAt);
      if (at.date === meal.date && (!kind || Math.abs(at.minutes - nominal) <= 180)) return at.minutes;
    }
    return nominal;
  }
  const kindKeyOf = (meal) => Object.hasOwn(kinds, meal?.kind) ? meal.kind : Object.keys(kinds).find((key) => kinds[key] === meal?.kind) ?? "";

  function exercisesOn(date) {
    const value = readJSON(localStorage, exerciseKey(date));
    return (Array.isArray(value) ? value : []).filter((item) =>
      item && pickId(exerciseTypes, item.type) && Number.isInteger(item.minutes) && item.minutes > 0 && item.minutes <= 1440)
      .map((item) => ({ ...item, label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 30) : exerciseTypes.find((type) => type.id === item.type).label }));
  }
  function addExercise(date, { type, minutes, label, afterMeal = false, at = null }) {
    if (!isDate(date) || date > today) throw new Error("只能记录今天或过去的运动。");
    if (!pickId(exerciseTypes, type) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("请选择运动类型并填写 1 到 1440 分钟。");
    const list = readJSON(localStorage, exerciseKey(date));
    const time = Number.isInteger(at) ? at : date === today ? nowMinutes() : 1140;
    const item = { id: crypto.randomUUID(), type, minutes, label: (label || "").trim().slice(0, 30), afterMeal: Boolean(afterMeal), at: time };
    localStorage.setItem(exerciseKey(date), JSON.stringify([...(Array.isArray(list) ? list : []), item]));
    return item;
  }
  function removeExercise(date, id) {
    const list = exercisesOn(date).filter((item) => item.id !== id);
    if (list.length) localStorage.setItem(exerciseKey(date), JSON.stringify(list));
    else localStorage.removeItem(exerciseKey(date));
  }
  // Older records only kept a single number of minutes per day; count it as unclassified.
  function movementSummary(date) {
    const sessions = exercisesOn(date);
    const legacy = movementOn(date) ?? 0;
    const by = (type) => sessions.filter((item) => item.type === type).reduce((sum, item) => sum + item.minutes, 0);
    return {
      sessions, total: legacy + sessions.reduce((sum, item) => sum + item.minutes, 0),
      aerobic: by("aerobic"), strength: by("strength"), stretch: by("stretch"), legacy,
      strengthCount: sessions.filter((item) => item.type === "strength").length,
      walks: sessions.filter((item) => item.afterMeal).length
    };
  }

  // Older notes were plain strings; newer ones also keep the minute they were written.
  function readNote(date) {
    const value = readJSON(localStorage, noteKey(date));
    if (typeof value === "string") return { text: value, at: null };
    return value && typeof value.text === "string" ? { text: value.text, at: Number.isInteger(value.at) ? value.at : null } : { text: "", at: null };
  }
  const noteOn = (date) => readNote(date).text;
  const noteTime = (date) => readNote(date).at;
  function saveNote(date, text) {
    const value = String(text ?? "").slice(0, 500);
    const at = date === today ? nowMinutes() : readNote(date).at;
    if (value.trim()) localStorage.setItem(noteKey(date), JSON.stringify({ text: value, at }));
    else localStorage.removeItem(noteKey(date));
  }

  // Reminders on the day page. They are inline cards, never notifications.
  function readPrompts() {
    const value = readJSON(localStorage, "hhcf-prompts-v1");
    return { walk: value?.walk !== false, afternoon: value?.afternoon !== false };
  }
  const savePrompts = (prompts) => localStorage.setItem("hhcf-prompts-v1", JSON.stringify(prompts));

  // Period records stay on this device and are never sent with recognition requests.
  const periodEnabled = () => readJSON(localStorage, "hhcf-period-enabled") === true;
  function setPeriodEnabled(enabled) {
    if (enabled) localStorage.setItem("hhcf-period-enabled", "true");
    else localStorage.removeItem("hhcf-period-enabled");
  }
  function periodOn(date) {
    const value = readJSON(localStorage, periodKey(date));
    if (!value || typeof value !== "object") return null;
    return {
      flow: pickId(periodFlows, value.flow) ?? "medium",
      feelings: Array.isArray(value.feelings) ? value.feelings.filter((id) => pickId(periodFeelings, id)) : [],
      end: value.end === true
    };
  }
  function savePeriodDay(date, changes) {
    if (!isDate(date) || date > today) throw new Error("只能记录今天或过去的经期。");
    const next = { ...(periodOn(date) ?? { flow: "medium", feelings: [], end: false }), ...changes };
    localStorage.setItem(periodKey(date), JSON.stringify(next));
  }
  const removePeriodDay = (date) => localStorage.removeItem(periodKey(date));
  // A period is a run of recorded days with gaps of at most one unrecorded day.
  function periods() {
    const dates = Object.keys(localStorage).filter((name) => name.startsWith(periodPrefix))
      .map((name) => name.slice(periodPrefix.length)).filter((date) => isDate(date) && periodOn(date)).sort();
    const runs = [];
    for (const date of dates) {
      const last = runs.at(-1);
      if (last && !periodOn(last.at(-1)).end && addDays(last.at(-1), 2) >= date) last.push(date);
      else runs.push([date]);
    }
    return runs.map((days) => {
      const start = days[0], last = days.at(-1);
      const ended = periodOn(last).end || addDays(last, 2) < today;
      const all = [];
      for (let date = start; date <= last; date = addDays(date, 1)) all.push(date);
      return { start, end: last, days: all, recorded: days, ended, length: all.length };
    });
  }
  function periodFor(date) {
    return periods().find((run) => run.start <= date && (run.ended ? run.end >= date : date <= today)) ?? null;
  }
  const readHabits = () => { const value = readJSON(localStorage, "hhcf-habits-v1"); return Array.isArray(value) ? value.filter((id) => pickId(habitOptions, id)) : []; };
  function toggleHabit(id) {
    const list = readHabits();
    const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
    localStorage.setItem("hhcf-habits-v1", JSON.stringify(next));
    return next.includes(id);
  }

  return {
    states, afternoonOptions, mealFeelings, exerciseTypes, quickExercises, periodFlows, periodFeelings, habitOptions,
    stateOn, saveState, afternoonOn, saveAfternoon, feelingsFor, saveFeelings,
    clock, nowMinutes, mealMinutes, kindKeyOf, readMeals,
    exercisesOn, addExercise, removeExercise, movementSummary, noteOn, noteTime, saveNote, readPrompts, savePrompts,
    periodEnabled, setPeriodEnabled, periodOn, savePeriodDay, removePeriodDay, periods, periodFor, readHabits, toggleHabit,
    params, today, kinds, asDate, addDays, weekday, weekStart, monthStart, addMonths,
    shortDate, dayName, isDate, selected, link, day, estimate,
    readPhotoDraft: (id) => accessPhotos("readonly", (store) => store.get("draft:" + id)),
    writePhotoDraft: (id, draft) => accessPhotos("readwrite", (store) => store.put(draft, "draft:" + id)),
    clearPhotoDraft: (id) => accessPhotos("readwrite", (store) => store.delete("draft:" + id)),
    getMeal, mealMacros, mealFocusNutrient, dayFocusNutrients, photoFor, saveMeal, deleteMeal, pendingUndo, undoDelete, recentMealDays,
    dietFocuses, focusNutrients, readDietFocus, saveDietFocus,
    savedWeight, previousWeight, latestWeight, saveWeight, weightLimits, parseWeight, formatWeight,
    readGoal, saveGoal, movementOn, saveMovement, planStickers, plansOn, togglePlan
  };
})();

// A restored history entry can otherwise keep pre-save totals in its DOM.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
