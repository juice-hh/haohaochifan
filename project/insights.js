// Plain-language observations built from the record book. Each finding needs real
// evidence from at least two days; with too little data nothing is said.
(() => {
  const goodStates = ["light", "spirit"];
  const lowStates = ["sleepy", "puffy"];
  const stateLabel = (id) => Journal.states.find((item) => item.id === id)?.label ?? "";
  const dayLabel = (date) => Journal.dayName(date);

  function refinedLunch(date) {
    return Journal.readMeals(date).some((meal) => Journal.kindKeyOf(meal) === "lunch" &&
      (Array.isArray(meal.foods) && meal.foods.length
        ? meal.foods.some((food) => NutritionVisual.isRefinedCarb(food))
        : NutritionVisual.isRefinedCarb({ name: meal.name })));
  }
  const sleepyAfternoon = (date) => {
    const afternoon = Journal.afternoonOn(date);
    return afternoon ? afternoon !== "clear" : Journal.stateOn(date) === "sleepy";
  };
  const clearAfternoon = (date) => Journal.afternoonOn(date) === "clear";
  const walkedAfterLunch = (date) => Journal.exercisesOn(date).some((item) => item.afterMeal && item.at >= 690 && item.at <= 900);
  const daySugar = (date) => Journal.dayFocusNutrients(Journal.readMeals(date)).find((item) => item.key === "addedSugar")?.value ?? null;
  const dayRefined = (date) => Journal.readMeals(date).reduce((sum, meal) =>
    sum + (Array.isArray(meal.foods) && meal.foods.length
      ? meal.foods.filter((food) => NutritionVisual.isRefinedCarb(food)).length
      : NutritionVisual.isRefinedCarb({ name: meal.name }) ? 1 : 0), 0);

  // The sticker of a real dish on those days, so a finding shows what was actually eaten.
  function dishOn(dates, predicate) {
    for (const date of dates) {
      for (const meal of Journal.readMeals(date)) {
        if (!predicate(meal)) continue;
        const group = FoodStickers.groups([meal], date)[0];
        const food = group.foods.find((item) => item.hasSticker && (predicate.food ? predicate.food(item) : true));
        if (food) return { kind: "sticker", photo: food.photo, cutout: food.cutout, name: food.name };
      }
    }
    return null;
  }
  const lunchMeal = (meal) => Journal.kindKeyOf(meal) === "lunch";
  const refinedLunchMeal = Object.assign((meal) => lunchMeal(meal), { food: (food) => food.refinedCarb });
  const snackMeal = (meal) => Journal.kindKeyOf(meal) === "snack";

  function week(weekStart) {
    const dates = Array.from({ length: 7 }, (_, i) => Journal.addDays(weekStart, i)).filter((date) => date <= Journal.today);
    const findings = [];

    // Refined-carb lunch and a sleepy afternoon.
    const refinedSleepy = dates.filter((date) => refinedLunch(date) && sleepyAfternoon(date) && !walkedAfterLunch(date));
    if (refinedSleepy.length >= 2) {
      findings.push({ id: "refinedSleepy", tone: "low", icons: [dishOn(refinedSleepy, refinedLunchMeal) ?? "grain", "plus", "sleepy"],
        text: "午饭以面或米饭为主的 " + refinedSleepy.length + " 天，下午都说有点困。", dates: refinedSleepy });
    }
    // The same kind of lunch with an after-meal walk.
    const walked = dates.filter((date) => refinedLunch(date) && walkedAfterLunch(date) && clearAfternoon(date));
    if (walked.length >= 1 && refinedSleepy.length >= 1) {
      findings.push({ id: "walkHelps", tone: "good", icons: [dishOn(walked, refinedLunchMeal) ?? "grain", "plus", "walk", "light"],
        text: "同样吃面或米饭，饭后走了一走的那" + (walked.length > 1 ? " " + walked.length + " 天" : "天") + "，下午没犯困。", dates: walked });
    }
    // Good days: what they share.
    const good = dates.filter((date) => goodStates.includes(Journal.stateOn(date)));
    if (good.length >= 2) {
      const moved = good.filter((date) => Journal.movementSummary(date).total > 0);
      const lightLunch = good.filter((date) => !refinedLunch(date) && Journal.readMeals(date).some((meal) => Journal.kindKeyOf(meal) === "lunch"));
      const parts = [];
      if (lightLunch.length === good.length) parts.push("午饭都吃得清淡");
      if (moved.length === good.length) parts.push("也都动了动");
      if (parts.length) {
        findings.push({ id: "goodDays", tone: "good", icons: [dishOn(good, lunchMeal) ?? "lunch", "plus", ...(moved.length === good.length ? ["walk"] : []), Journal.stateOn(good[0]) === "spirit" ? "spirit" : "light"],
          text: "你觉得轻盈或精神的 " + good.length + " 天，" + parts.join("，") + "。", dates: good });
      }
    }
    // A low day with lots of sugar.
    const low = dates.filter((date) => lowStates.includes(Journal.stateOn(date)));
    const sugars = dates.map(daySugar).filter((value) => value !== null);
    if (low.length && sugars.length >= 3) {
      const max = Math.max(...sugars);
      const peak = low.find((date) => daySugar(date) === max && max > 0);
      if (peak) findings.push({ id: "sugarLow", tone: "low", icons: ["sugar", "plus", Journal.stateOn(peak)],
        text: dayLabel(peak) + "添加糖是这周最多的一天，那天你觉得" + stateLabel(Journal.stateOn(peak)) + "。", dates: [peak] });
    }
    // Period and extra snacks.
    const periodDays = dates.filter((date) => Journal.periodEnabled() && Journal.periodOn(date));
    if (periodDays.length >= 2) {
      const snacks = (list) => list.reduce((sum, date) => sum + Journal.readMeals(date).filter((meal) => Journal.kindKeyOf(meal) === "snack").length, 0) / Math.max(1, list.length);
      const others = dates.filter((date) => !periodDays.includes(date) && Journal.readMeals(date).length);
      const more = snacks(periodDays) - (others.length ? snacks(others) : 0);
      if (more >= 0.5) {
        findings.push({ id: "periodSnacks", tone: "period", icons: ["period", "right", dishOn(periodDays, snackMeal) ?? "snack"],
          text: "经期这 " + periodDays.length + " 天，你每天多吃了一次加餐。这是身体在要能量，不用怪自己。", dates: periodDays });
      }
    }
    return findings;
  }

  function movement(weekStart) {
    const dates = Array.from({ length: 7 }, (_, i) => Journal.addDays(weekStart, i));
    const days = dates.map((date) => Journal.movementSummary(date));
    return {
      aerobic: days.reduce((sum, day) => sum + day.aerobic + day.legacy, 0),
      strength: days.reduce((sum, day) => sum + day.strengthCount, 0),
      walks: days.map((day) => day.walks > 0),
      bars: days.map((day) => day.aerobic + day.legacy),
      any: days.some((day) => day.total > 0)
    };
  }

  function sugarWeek(weekStart) {
    const dates = Array.from({ length: 7 }, (_, i) => Journal.addDays(weekStart, i));
    const previous = Array.from({ length: 7 }, (_, i) => Journal.addDays(weekStart, i - 7));
    const avg = (list) => {
      const values = list.map(daySugar).filter((value) => value !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const refined = dates.map(dayRefined);
    const refinedBefore = previous.map(dayRefined).reduce((a, b) => a + b, 0);
    return {
      sugarDays: dates.map((date) => (daySugar(date) ?? 0) >= 10),
      sugarAvg: avg(dates), sugarAvgBefore: avg(previous),
      refinedDays: refined.map((count) => count > 0),
      refinedTotal: refined.reduce((a, b) => a + b, 0), refinedBefore
    };
  }

  // ---- Period review ----
  function review(period) {
    const before = Array.from({ length: 28 }, (_, i) => Journal.addDays(period.start, -28 + i)).filter((date) => date <= Journal.today);
    const days = period.days.map((date, index) => ({
      date, index: index + 1, record: Journal.periodOn(date), state: Journal.stateOn(date),
      meals: Journal.readMeals(date)
    }));
    const has = (id) => days.filter((day) => day.record?.feelings.includes(id) || (id === "sleepy" && day.state === "sleepy"));
    const items = [];
    const sleepyDays = has("sleepy");
    if (sleepyDays.length) {
      const late = before.slice(-14).filter((date) => Journal.readMeals(date).some((meal) => Journal.mealMinutes(meal) >= 22 * 60 + 30));
      items.push({ id: "sleepy", icon: "sleepy", title: sleepyDays.length >= 2 ? "头几天特别困" : "有一天特别困", badge: sleepyDays.length + " 天",
        text: late.length >= 3 ? "前两周有 " + late.length + " 个晚上很晚还在吃东西，睡得晚了些。" : "经期很困时，可以回头看看前几周睡得够不够。",
        dates: late.slice(0, 2).map(Journal.shortDate).concat(late.length > 2 ? ["还有 " + (late.length - 2) + " 天"] : []) });
    }
    const backDays = has("backache");
    if (backDays.length) {
      const strength = before.reduce((sum, date) => sum + Journal.movementSummary(date).strengthCount, 0);
      const sessions = before.reduce((sum, date) => sum + Journal.movementSummary(date).sessions.length, 0);
      items.push({ id: "backache", icon: "back", title: "腰酸", badge: backDays.length + " 天",
        text: strength ? "这个月你运动了 " + sessions + " 次，其中 " + strength + " 次是力量。练腰背会让经期的腰酸轻一些。"
          : "久坐会让经期腰酸更明显。平时练练腰背，下次会轻一些。" });
    }
    const crave = has("craveSweet").concat(has("veryHungry")).filter((day, i, list) => list.indexOf(day) === i);
    if (crave.length) {
      const snacks = days.flatMap((day) => day.meals.filter((meal) => Journal.kindKeyOf(meal) === "snack"));
      items.push({ id: "crave", icon: "heart", title: "想吃甜的", badge: crave.length + " 天",
        text: snacks.length ? "这几天加了 " + snacks.length + " 次餐，一份就满足了。想吃就吃，这很正常。" : "想吃就吃一点，换成温和的选择会舒服很多。",
        snacks: snacks.slice(0, 3) });
    }
    if (has("cramps").length) {
      items.push({ id: "cramps", icon: "period", title: "痛经", badge: has("cramps").length + " 天",
        text: "痛经不用硬扛，按医生建议可以早点吃止痛药。" });
    }
    const previous = Journal.periods().filter((run) => run.ended && run.start < period.start).at(-1) ?? null;
    const count = (run, predicate) => run ? run.days.filter(predicate).length : null;
    const snacksIn = (run) => run ? run.days.reduce((sum, date) => sum + Journal.readMeals(date).filter((meal) => Journal.kindKeyOf(meal) === "snack").length, 0) : null;
    const sleepyIn = (run) => count(run, (date) => Journal.periodOn(date)?.feelings.includes("sleepy") || Journal.stateOn(date) === "sleepy");
    const sugarIn = (run) => {
      if (!run) return null;
      const values = run.days.map((date) => Journal.dayFocusNutrients(Journal.readMeals(date)).find((item) => item.key === "addedSugar")?.value ?? null).filter((value) => value !== null);
      return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    };
    const sugarNow = sugarIn(period), sugarBefore = sugarIn(previous);
    const compare = previous ? [
      { label: "犯困", before: sleepyIn(previous), now: sleepyIn(period), unit: "天" },
      { label: "加餐", before: snacksIn(previous), now: snacksIn(period), unit: "次" },
      sugarNow !== null && sugarBefore !== null
        ? { label: "添加糖", before: sugarBefore, now: sugarNow, unit: "g/天", percent: true }
        : { label: "天数", before: previous.length, now: period.length, unit: "天" }
    ] : [];
    const backBefore = previous ? count(previous, (date) => Journal.periodOn(date)?.feelings.includes("backache")) : null;
    const better = [];
    if (previous && backDays.length < backBefore) better.push("腰酸少了");
    if (previous && sleepyIn(period) < sleepyIn(previous)) better.push("也没那么困");
    else if (previous && sleepyIn(period) === 0 && sleepyIn(previous) === 0) better.push("精神也不错");
    const easier = previous && sleepyIn(period) <= sleepyIn(previous) && backDays.length <= count(previous, (date) => Journal.periodOn(date)?.feelings.includes("backache"));
    const headline = previous ? (easier ? "这次比上次轻松一些" : "这次辛苦了一些") : "这是记下的第一次经期";
    const sub = items.length ? "身体在这几天提醒你的事，都整理在下面了" : "这几天的记录都在下面，记得越多，下次能看出的越多";
    return { days, items, compare, previous, headline, headline2: better.join("，"), sub };
  }

  window.Insights = { week, movement, sugarWeek, review, refinedLunch };
})();
