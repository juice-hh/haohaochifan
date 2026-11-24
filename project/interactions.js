// Shared phone interactions; data and camera ownership stay with each page.
(() => {
  let activeSheet = null;
  function openSheet({ title, description, className = "", render }) {
    if (activeSheet) return Promise.resolve(null);
    const trigger = document.activeElement;
    trigger?.blur?.();
    const overlay = document.createElement("div");
    overlay.className = "app-sheet-overlay";
    const sheet = document.createElement("section");
    sheet.className = "app-sheet " + className;
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "app-sheet-title");
    sheet.tabIndex = -1;
    const heading = document.createElement("h2");
    heading.id = "app-sheet-title";
    heading.textContent = title;
    sheet.append(heading);
    if (description) {
      const detail = document.createElement("p");
      detail.id = "app-sheet-description";
      detail.textContent = description;
      sheet.setAttribute("aria-describedby", detail.id);
      sheet.append(detail);
    }
    const app = document.querySelector("x-dc");
    const oldOverflow = document.documentElement.style.overflow;
    return new Promise((resolve) => {
      function finish(result) {
        if (activeSheet !== overlay) return;
        overlay.remove();
        activeSheet = null;
        if (app) app.inert = false;
        document.documentElement.style.overflow = oldOverflow;
        if (trigger?.isConnected && !textEntry(trigger)) trigger.focus({ preventScroll: true });
        resolve(result);
      }
      const focusTarget = render(sheet, finish);
      overlay.append(sheet);
      document.body.append(overlay);
      activeSheet = overlay;
      if (app) app.inert = true;
      document.documentElement.style.overflow = "hidden";
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish(null);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        } else if (event.key === "Tab") {
          const controls = [...sheet.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
          const [first] = controls, last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      });
      (focusTarget || sheet).focus({ preventScroll: true });
    });
  }

  function sheetButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.onclick = onClick;
    return button;
  }

  function confirmAction({ title, description, confirmLabel, cancelLabel = "继续编辑", destructive = false }) {
    return openSheet({ title, description, render(sheet, close) {
      const confirm = sheetButton(confirmLabel, "app-sheet-confirm" + (destructive ? " app-danger" : ""), () => close(true));
      const cancel = sheetButton(cancelLabel, "app-sheet-cancel", () => close(false));
      sheet.append(confirm, cancel);
      return cancel;
    } });
  }

  function chooseOption(title, options, selected) {
    return openSheet({ title, render(sheet, close) {
      let active;
      for (const [value, label] of Object.entries(options)) {
        const button = sheetButton(label, "app-sheet-choice", () => close(value));
        button.setAttribute("aria-pressed", String(value === selected));
        if (value === selected) active = button;
        sheet.append(button);
      }
      sheet.append(sheetButton("取消", "app-sheet-cancel", () => close(null)));
      return active;
    } });
  }

  function chooseDate(selected) {
    let month = selected.slice(0, 7) + "-01";
    return openSheet({ title: "记录日期", className: "app-date-sheet", render(sheet, close) {
      const toolbar = document.createElement("div");
      toolbar.className = "app-date-toolbar";
      const label = document.createElement("strong");
      const previous = sheetButton("‹", "", () => changeMonth(-1));
      const next = sheetButton("›", "", () => changeMonth(1));
      previous.setAttribute("aria-label", "上个月");
      next.setAttribute("aria-label", "下个月");
      toolbar.append(previous, label, next);
      const weekdays = document.createElement("div");
      weekdays.className = "app-date-grid";
      weekdays.setAttribute("aria-hidden", "true");
      for (const day of "一二三四五六日") {
        const cell = document.createElement("span");
        cell.textContent = day;
        weekdays.append(cell);
      }
      const dates = document.createElement("div");
      dates.className = "app-date-grid";
      function changeMonth(offset) {
        month = Journal.addMonths(month, offset);
        drawDates();
      }
      function drawDates() {
        dates.replaceChildren();
        label.textContent = Number(month.slice(0, 4)) + "年" + Number(month.slice(5, 7)) + "月";
        const nextMonth = Journal.addMonths(month, 1);
        next.disabled = nextMonth > Journal.today;
        for (let i = 0; i < (Journal.weekday(month) + 6) % 7; i++) dates.append(document.createElement("span"));
        for (let date = month; date < nextMonth; date = Journal.addDays(date, 1)) {
          const button = sheetButton(String(Number(date.slice(8))), "", () => close(date));
          button.setAttribute("aria-label", Journal.shortDate(date));
          button.setAttribute("aria-pressed", String(date === selected));
          button.disabled = date > Journal.today;
          dates.append(button);
        }
      }
      drawDates();
      sheet.append(toolbar, weekdays, dates, sheetButton("取消", "app-sheet-cancel", () => close(null)));
      return dates.querySelector('[aria-pressed="true"]');
    } });
  }

  function guardNavigation(isDirty, onDiscard) {
    document.addEventListener("click", async (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !isDirty()) return;
      const href = link.href;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (await confirmAction({ title: "还没保存，要离开吗？", description: "这次修改还没有保存。你可以继续编辑，或放弃修改后离开。", confirmLabel: "放弃修改并离开", destructive: true })) {
        await onDiscard?.();
        location.assign(href);
      }
    }, true);
  }
  function focusField(selector) {
    const field = document.querySelector(selector);
    // Validation may target an optional section that is currently collapsed.
    for (let parent = field?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
    field?.focus();
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.defaultPrevented && event.target.matches('input[enterkeyhint="done"]') && !event.target.form) {
      event.preventDefault();
      event.target.blur();
    }
  });
  // Mobile keyboards can shrink only VisualViewport while layout/sticky bounds stay tall.
  // Keep the inset through blur until the viewport expands, so a save tap does not move away.
  const viewport = window.visualViewport;
  const root = document.documentElement;
  let editingSession = false;
  let frame = 0;
  let revealPending = false;
  const textEntry = (element) => element?.matches('textarea, input:not([type="file"]):not([type="date"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])');
  function syncViewport() {
    frame = 0;
    const field = document.activeElement;
    if (textEntry(field)) editingSession = true;
    const inset = viewport && Math.abs(viewport.scale - 1) < 0.05
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    const keyboardOpen = editingSession && inset > 80;
    root.style.setProperty("--keyboard-inset", keyboardOpen ? Math.ceil(inset) + "px" : "0px");
    root.toggleAttribute("data-keyboard-open", keyboardOpen);
    if (!textEntry(field) && inset <= 80) editingSession = false;
    if (revealPending && textEntry(field) && !activeSheet) {
      const top = (viewport?.offsetTop || 0) + 12;
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight);
      const toolbar = document.querySelector(".app-toolbar")?.getBoundingClientRect();
      const actions = document.querySelector(".record-actions")?.getBoundingClientRect();
      const visibleTop = Math.max(top, toolbar && toolbar.bottom < bottom ? toolbar.bottom + 12 : top);
      const visibleBottom = Math.min(bottom - 12, actions && actions.top > visibleTop ? actions.top - 12 : bottom - 12);
      const bounds = field.getBoundingClientRect();
      if (bounds.bottom > visibleBottom) window.scrollBy(0, bounds.bottom - visibleBottom);
      else if (bounds.top < visibleTop) window.scrollBy(0, bounds.top - visibleTop);
    }
    revealPending = false;
  }
  function scheduleViewport(reveal = false) {
    revealPending ||= reveal;
    if (!frame) frame = requestAnimationFrame(syncViewport);
  }
  viewport?.addEventListener("resize", () => scheduleViewport(true));
  viewport?.addEventListener("scroll", () => scheduleViewport());
  window.addEventListener("resize", () => scheduleViewport(true));
  document.addEventListener("focusin", () => scheduleViewport(true));
  document.addEventListener("focusout", () => scheduleViewport());
  window.addEventListener("pageshow", () => scheduleViewport());
  scheduleViewport();
  window.JournalUI = { openSheet, confirmAction, chooseOption, chooseDate, guardNavigation, focusField };
})();
