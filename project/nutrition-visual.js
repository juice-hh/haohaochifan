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

  window.NutritionVisual = { known, serving, summary };
})();
