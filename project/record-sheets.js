// Bottom sheets for the record book: exercise, meal feelings and a note for the day.
(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (name, size = 18) => {
    const node = el("hh-icon");
    node.setAttribute("name", name);
    node.setAttribute("size", String(size));
    return node;
  };
  const button = (text, className, onClick) => {
    const node = el("button", className, text);
    node.type = "button";
    node.onclick = onClick;
    return node;
  };
  const typeIcon = { aerobic: "walk", strength: "dumbbell", stretch: "stretch" };

  function exercise(date) {
    return JournalUI.openSheet({ title: "记一次运动", className: "rb-sheet rb-exercise", render(sheet, close) {
      let type = "aerobic", minutes = 30, picked = new Set(), error = el("p", "rb-error");
      const now = date === Journal.today ? Journal.clock(Journal.nowMinutes()) : Journal.shortDate(date);
      const when = el("span", "rb-when", (date === Journal.today ? "今天 " : "") + now);
      sheet.querySelector("h2").after(when);
      error.setAttribute("role", "alert");
      const save = (entry) => {
        try { Journal.addExercise(date, entry); close(true); }
        catch (failure) { error.textContent = failure.message; }
      };

      sheet.append(el("p", "rb-label", "常用 点一下就记好"));
      const quick = el("div", "rb-quick");
      for (const item of Journal.quickExercises) {
        const tile = button("", "rb-quick-item", () => save(item));
        tile.append(el("span", "rb-quick-icon", ""), el("strong", "", item.label), el("small", "", item.minutes + " 分钟"));
        tile.firstChild.append(icon(typeIcon[item.type], 16));
        tile.firstChild.dataset.type = item.type;
        tile.setAttribute("aria-label", "记一次" + item.label + " " + item.minutes + " 分钟");
        quick.append(tile);
      }
      sheet.append(quick, el("p", "rb-label", "哪一种"));

      const types = el("div", "rb-types");
      const presets = el("div", "rb-presets");
      const drawPresets = () => {
        presets.replaceChildren(...Journal.exerciseTypes.find((item) => item.id === type).presets.map((label) => {
          const chip = button(label, "rb-chip", () => {
            picked.has(label) ? picked.delete(label) : picked.add(label);
            chip.setAttribute("aria-pressed", String(picked.has(label)));
          });
          chip.setAttribute("aria-pressed", String(picked.has(label)));
          return chip;
        }));
      };
      for (const item of Journal.exerciseTypes) {
        const tile = button("", "rb-type", () => {
          type = item.id; picked = new Set();
          types.querySelectorAll(".rb-type").forEach((node) => node.setAttribute("aria-pressed", String(node === tile)));
          drawPresets();
        });
        tile.dataset.type = item.id;
        tile.setAttribute("aria-pressed", String(item.id === type));
        tile.append(icon(typeIcon[item.id], 24), el("strong", "", item.label), el("small", "", item.hint));
        types.append(tile);
      }
      drawPresets();
      sheet.append(types, presets, el("p", "rb-label", "多久"));

      const duration = el("div", "rb-duration");
      const value = el("strong", "", "");
      const chips = el("div", "rb-duration-chips");
      const draw = () => {
        value.replaceChildren(String(minutes), el("small", "", "分钟"));
        chips.querySelectorAll("button").forEach((node) => node.setAttribute("aria-pressed", String(Number(node.dataset.minutes) === minutes)));
      };
      const step = (delta) => { minutes = Math.min(600, Math.max(5, minutes + delta)); draw(); };
      const stepper = el("div", "rb-stepper");
      const less = button("−", "", () => step(-5)); less.setAttribute("aria-label", "少 5 分钟");
      const more = button("+", "", () => step(5)); more.setAttribute("aria-label", "多 5 分钟");
      stepper.append(less, value, more);
      for (const amount of [10, 15, 30]) {
        const chip = button(String(amount), "", () => { minutes = amount; draw(); });
        chip.dataset.minutes = String(amount);
        chip.setAttribute("aria-label", amount + " 分钟");
        chips.append(chip);
      }
      draw();
      duration.append(stepper, chips);
      const hint = el("p", "rb-hint");
      hint.append(icon("bulb", 16), el("span", "", "不用专门找时间。动感单车把阻力调高、爬楼梯、靠墙深蹲，都算力量。"));
      const submit = button("记下来", "app-sheet-confirm", () => save({ type, minutes, label: [...picked].join(" ") }));
      sheet.append(duration, hint, error, submit, button("取消", "app-sheet-cancel", () => close(false)));
      return submit;
    } });
  }

  function feelings(meal) {
    return JournalUI.openSheet({ title: "这顿吃得怎么样", description: "可以多选，之后也能改", className: "rb-sheet", render(sheet, close) {
      const chosen = new Set(Journal.feelingsFor(meal.id));
      const chips = el("div", "rb-presets rb-feelings");
      for (const item of Journal.mealFeelings) {
        const chip = button(item.label, "rb-chip", () => {
          chosen.has(item.id) ? chosen.delete(item.id) : chosen.add(item.id);
          chip.setAttribute("aria-pressed", String(chosen.has(item.id)));
        });
        chip.dataset.tone = item.tone;
        chip.setAttribute("aria-pressed", String(chosen.has(item.id)));
        chips.append(chip);
      }
      const submit = button("好了", "app-sheet-confirm", () => {
        try { Journal.saveFeelings(meal.id, [...chosen]); close(true); } catch { close(false); }
      });
      sheet.append(chips, submit, button("取消", "app-sheet-cancel", () => close(false)));
      return submit;
    } });
  }

  function note(date) {
    return JournalUI.openSheet({ title: "写给今天的一句话", className: "rb-sheet", render(sheet, close) {
      const area = el("textarea", "rb-note");
      area.value = Journal.noteOn(date);
      area.maxLength = 500;
      area.rows = 4;
      area.placeholder = "比如：午饭清淡，下午一点都不困。";
      area.setAttribute("aria-label", "写给今天的一句话");
      const submit = button("保存", "app-sheet-confirm", () => {
        try { Journal.saveNote(date, area.value); close(true); } catch { close(false); }
      });
      sheet.append(area, submit, button("取消", "app-sheet-cancel", () => close(false)));
      return area;
    } });
  }

  window.RecordSheets = { exercise, feelings, note };
})();
