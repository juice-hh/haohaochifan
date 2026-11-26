// Shared visual grammar for recorded nutrition. Empty amounts are unknown.
(() => {
  const macroKeys = ["carb", "pro", "fat"];
  const macroLabels = ["碳水", "蛋白质", "脂肪"];
  const colors = ["#d8a62b", "#8769d8", "#58a889"];

  const known = (value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
  const format = (value) => known(value) ? Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) : "—";
  const ringFor = (grams) => {
    if (!grams.every(known)) return "#e4e0ec";
    const energy = grams.map((value, index) => Number(value) * [4, 4, 9][index]);
    const total = energy.reduce((sum, amount) => sum + amount, 0);
    if (!total) return "#e4e0ec";
    let start = 0;
    return "conic-gradient(" + energy.map((amount, index) => {
      const end = start + amount / total * 100;
      const stop = colors[index] + " " + start + "% " + end + "%";
      start = end;
      return stop;
    }).join(",") + ")";
  };

  function serving(energy, nutrients) {
    const grams = macroKeys.map((key) => nutrients?.[key]);
    const focused = Journal.readDietFocus().fields.map((key) => ({
      key, label: Journal.focusNutrients[key],
      value: nutrients?.[key]
    }));
    return {
      kcal: known(energy) ? format(energy) + " kcal" : "— kcal",
      ring: "--nutrition-ring:" + ringFor(grams),
      ringLabel: macroLabels.map((label, i) => label + " " + (known(grams[i]) ? format(grams[i]) + " 克" : "未记录")).join("，"),
      focus: focused.map(({ label, value }) => label + " " + (known(value) ? format(value) + " g" : "—")).join(" / "),
      focusChips: focused.map(({ key, label, value }) => ({ key, label, value: known(value) ? format(value) + "g" : "—" }))
    };
  }

  function summary(energy, grams, focusItems) {
    const { kcal, ring, ringLabel } = serving(energy, Object.fromEntries(macroKeys.map((key, i) => [key, grams[i]])));
    return {
      kcal, ring, ringLabel,
      macros: macroLabels.map((label, index) => ({
        label, icon: macroKeys[index], value: known(grams[index]) ? format(grams[index]) + " g" : "—",
        color: "--nutrient-color:" + colors[index]
      })),
      focus: focusItems.map(({ label, value, ...item }) => ({
        ...item, label, value: known(value) ? format(value) + " g" : "未记录"
      }))
    };
  }

  // Recognition marks refined carbs per dish; manual and older records fall back to the dish name.
  const refinedWords = /白米饭|米饭|白饭|白粥|粥|面条|拉面|汤面|牛肉面|拌面|炒面|意面|米粉|米线|河粉|粉丝|面包|吐司|馒头|包子|花卷|饺子|馄饨|烧饼|油条|饼干|蛋糕|甜点|甜品|蛋挞|奶茶|可乐|汽水|果汁|含糖|饭团|炒饭|盖饭|寿司|年糕|汤圆|麻薯/;
  const notRefined = /糙米|杂粮|全麦|燕麦|藜麦|紫米|黑米|荞麦|红薯|紫薯|玉米|无糖|零糖/;
  function isRefinedCarb(food) {
    if (typeof food?.refinedCarb === "boolean") return food.refinedCarb;
    const name = String(food?.name ?? "");
    return refinedWords.test(name) && !notRefined.test(name);
  }

  // A corner mark only for dishes that matter to the chosen focus. Per serving:
  // added sugar 6 g is about a quarter of the 25 g daily guide; 3 g fibre is a labelled "source of fibre".
  function focusMarks(food) {
    const nutrients = food?.nutrients;
    const focus = Journal.readDietFocus().id;
    const amount = (key) => known(nutrients?.[key]) ? Number(nutrients[key]) : null;
    const marks = [];
    if (focus === "sugar" && ((amount("addedSugar") ?? 0) >= 6 || (amount("totalSugar") ?? 0) >= 15)) {
      marks.push({ key: "sugar", label: "糖偏多" });
    }
    if (focus === "sugar" && isRefinedCarb(food)) marks.push({ key: "grain", label: "精制碳水" });
    if (focus === "antiInflammatory" && (amount("fiber") ?? 0) >= 3) marks.push({ key: "fiber", label: "膳食纤维多" });
    return marks;
  }

  window.NutritionVisual = { known, serving, summary, focusMarks, isRefinedCarb };
})();
