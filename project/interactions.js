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
  window.JournalUI = { confirmAction, guardNavigation, focusField };
})();
