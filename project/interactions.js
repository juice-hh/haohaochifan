// Shared phone interactions; data and camera ownership stay with each page.
(() => {
  let activeSheet = null;
  function confirmAction({ title, description, confirmLabel, cancelLabel = "继续编辑", destructive = false }) {
    if (activeSheet) return Promise.resolve(false);
    const trigger = document.activeElement;
    trigger?.blur?.();
    const sheet = document.createElement("dialog");
    sheet.className = "app-sheet";
    sheet.setAttribute("aria-labelledby", "app-sheet-title");
    sheet.setAttribute("aria-describedby", "app-sheet-description");
    const heading = document.createElement("h2");
    heading.id = "app-sheet-title";
    heading.textContent = title;
    const detail = document.createElement("p");
    detail.id = "app-sheet-description";
    detail.textContent = description;
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "app-sheet-confirm" + (destructive ? " app-danger" : "");
    confirm.textContent = confirmLabel;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "app-sheet-cancel";
    cancel.textContent = cancelLabel;
    sheet.append(heading, detail, confirm, cancel);
    document.body.append(sheet);
    activeSheet = sheet;
    const oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return new Promise((resolve) => {
      let settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        sheet.close();
        sheet.remove();
        activeSheet = null;
        document.documentElement.style.overflow = oldOverflow;
        if (trigger?.isConnected && !trigger.matches("input, textarea")) trigger.focus({ preventScroll: true });
        resolve(result);
      }
      confirm.addEventListener("click", () => finish(true));
      cancel.addEventListener("click", () => finish(false));
      sheet.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
      sheet.addEventListener("click", (event) => {
        const box = sheet.getBoundingClientRect();
        if (event.target === sheet && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) finish(false);
      });
      sheet.showModal();
      cancel.focus({ preventScroll: true });
    });
  }
  function guardNavigation(isDirty) {
    document.addEventListener("click", async (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !isDirty()) return;
      const href = link.href;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (await confirmAction({ title: "还没保存，要离开吗？", description: "这次修改还没有保存。你可以继续编辑，或放弃修改后离开。", confirmLabel: "放弃修改并离开", destructive: true })) location.assign(href);
    }, true);
  }
  function focusField(selector) {
    const field = document.querySelector(selector);
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
  window.JournalUI = { confirmAction, guardNavigation, focusField };
})();
