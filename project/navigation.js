// Shared bottom navigation for the four main journal pages.
(() => {
  const items = [
    {
      page: "Main", label: "本周",
      icon: `
        <path d="M3.15 10.25C3.45 7.8 4.58 6.43 6.58 5.91c.09-1.5.75-2.29 1.91-2.29 1.22 0 1.82.65 1.9 1.89a31 31 0 0 1 3.22 0c.08-1.24.68-1.89 1.9-1.89 1.16 0 1.82.79 1.91 2.29 2 .52 3.13 1.89 3.43 4.34a29 29 0 0 1-.25 6.04c-.55 3.2-2.71 4.03-8.6 4.03s-8.05-.83-8.6-4.03a29 29 0 0 1-.25-6.04Z"/>
        <rect x="7.05" y="9.9" width="9.9" height="2.15" rx="1.075" fill="var(--nav-icon-detail)"/>
        <rect x="7.05" y="14.2" width="3.65" height="2.13" rx="1.065" fill="var(--nav-icon-detail)"/>
        <rect x="13.3" y="14.2" width="3.65" height="2.13" rx="1.065" fill="var(--nav-icon-green)"/>
      `
    },
    {
      page: "Album", label: "饭相册",
      icon: `
        <path d="M3.02 9.57c.31-3.32 2.48-4.86 5.5-5.14a44 44 0 0 1 6.96 0c3.02.28 5.19 1.82 5.5 5.14a26 26 0 0 1-.14 5.02c-.44 3.49-2.5 4.83-5.57 5.02-1.95.12-4.59.12-6.54 0-3.07-.19-5.13-1.53-5.57-5.02a26 26 0 0 1-.14-5.02Z"/>
        <path d="M6.6 15.04c.67-1.5 2.29-3.73 3.62-3.73 1.35 0 2.08 1.82 2.95 2.54.49-.65.99-1.11 1.61-1.11.93 0 2.06 1.36 2.61 2.39.4.73-.03 1.29-.94 1.32H7.55c-.81 0-1.25-.61-.95-1.41Z" fill="var(--nav-icon-detail)"/>
        <circle cx="15.25" cy="9.73" r="1.47" fill="var(--nav-icon-orange)"/>
      `
    },
    {
      page: "Love", label: "爱吃的",
      icon: `
        <path d="M3.05 11.35C3.3 9.92 6.45 9.6 12 9.6s8.7.32 8.95 1.75c.43 2.34-1.35 5.64-4.25 7.18-1.21.65-1.78 1.55-3.05 1.6h-3.3c-1.27-.05-1.84-.95-3.05-1.6-2.9-1.54-4.68-4.84-4.25-7.18Z"/>
        <path d="M11.17 7.69c-.81-.36-.8-1.06-.36-1.63.39-.49.65-.92.59-1.44-.1-.83.51-1.34 1.18-1.24.77.12 1.09.72.99 1.46-.13.94-.9 1.53-1.15 2.31-.18.56-.69.82-1.25.54Z" fill="var(--nav-icon-detail)"/>
        <path d="M12 17.82c-.38 0-2.53-1.62-2.53-2.98 0-1.32 1.53-1.93 2.53-.95 1-.98 2.53-.37 2.53.95 0 1.36-2.15 2.98-2.53 2.98Z" fill="var(--nav-icon-orange)"/>
      `
    },
    {
      page: "Goal", label: "目标",
      icon: `
        <path d="M3.08 11.28c.23-5.19 3.75-8.07 9.18-7.94 5.33.13 8.66 3.23 8.66 8.47 0 5.39-3.44 8.82-8.92 8.86-5.53.04-9.17-3.6-8.92-9.39Z"/>
        <path d="M12.1 6.93c-2.84-.08-5.02 1.99-5.08 4.93-.06 2.98 1.97 5.17 4.95 5.21 2.94.04 5.02-1.99 5.06-4.93.04-2.98-2.01-5.12-4.93-5.21Z" fill="var(--nav-icon-cutout)"/>
        <circle cx="12" cy="12" r="2.32" fill="var(--nav-icon-green)"/>
      `
    }
  ];
  const camera = `
    <path d="M2.92 10.26c.27-2.72 1.92-4.03 5.14-4.15.86-1.65 1.82-2.18 3.94-2.18 2.12 0 3.08.53 3.94 2.18 3.22.12 4.87 1.43 5.14 4.15a22 22 0 0 1-.12 5.1c-.42 3.12-2.39 4.33-5.55 4.61a49 49 0 0 1-6.82 0c-3.16-.28-5.13-1.49-5.55-4.61a22 22 0 0 1-.12-5.1Z"/>
    <circle cx="12" cy="12.9" r="3.65" fill="var(--nav-icon-cutout)"/>
    <circle cx="17.45" cy="9.43" r="1.08" fill="var(--nav-icon-orange)"/>
  `;
  const dumbbell = `
    <rect x="6" y="10.1" width="12" height="3.8" rx="1.9"/>
    <rect x="3" y="7.6" width="3.8" height="8.8" rx="1.9"/>
    <rect x="6.1" y="5.1" width="4.6" height="13.8" rx="2.15"/>
    <rect x="13.3" y="5.1" width="4.6" height="13.8" rx="2.15"/>
    <rect x="17.2" y="7.6" width="3.8" height="8.8" rx="1.9"/>
  `;
  const icon = (paths) =>
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="var(--nav-icon-body)" aria-hidden="true">' + paths + '</svg>';

  class JournalNav extends HTMLElement {
    static get observedAttributes() { return ["date"]; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    render() {
      const active = this.getAttribute("page");
      const value = this.getAttribute("date");
      const date = Journal.isDate(value) ? value : Journal.selected();
      // The day page is a page of the week, so 本周 stays highlighted there.
      const current = active === "Day" ? (this.getAttribute("via") === "album" ? "Album" : "Main") : active;
      const tabs = '<nav aria-label="主导航">' + items.map((item) =>
        '<a href="' + Journal.link(item.page, date) + '"' + (current === item.page ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + item.label + '</span></a>'
      ).join("") + '</nav>';
      this.innerHTML = '<div class="journal-dock">' + tabs + '<button type="button" class="journal-camera" aria-label="记录" aria-haspopup="dialog" aria-expanded="false">' + icon(camera) + '</button></div>';
      this.querySelector("button").onclick = () => this.open();
    }

    open(kind) {
      const button = this.querySelector("button");
      if (!button || button.getAttribute("aria-expanded") === "true") return;
      const date = Journal.isDate(this.getAttribute("date")) ? this.getAttribute("date") : Journal.selected();
      const recordDate = date > Journal.today ? Journal.today : date;
      const active = this.getAttribute("page");
      const isDay = active === "Day";
      const via = this.getAttribute("via") === "album" ? "album" : "week";
      const back = isDay ? { from: "day", via } : { returnTo: active };
      const entries = [
        ["camera", kind ? "记" + Journal.kinds[kind] : "记一餐", Journal.link("Record", recordDate, { ...back, ...(kind ? { kind } : {}) })],
        ["scale", "记体重", Journal.link("Weigh", recordDate, back)],
        ["plan", "贴计划", Journal.link("Album", date, { plan: "1" })],
        ["move", "记运动", Journal.link("Goal", recordDate) + "#movement"]
      ];
      button.setAttribute("aria-expanded", "true");
      JournalUI.openSheet({
        title: "添加记录", className: "journal-record-menu",
        description: date > Journal.today ? "餐食和体重将记在今天，计划贴在所选日期。" : Journal.shortDate(date),
        render(sheet, close) {
          const actions = document.createElement("div");
          actions.className = "journal-menu-actions";
          for (const [type, label, href] of entries) {
            const link = document.createElement("a");
            link.className = "journal-menu-action";
            link.href = href;
            link.onclick = (event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              close(link.href);
            };
            const mark = document.createElement("span");
            mark.className = "journal-menu-mark";
            mark.setAttribute("aria-hidden", "true");
            if (type === "camera") mark.innerHTML = icon(camera);
            else if (type === "move") mark.innerHTML = icon(dumbbell);
            else {
              const image = document.createElement("img");
              image.src = "./icons/week-" + (type === "scale" ? "weigh-scale" : "plan-clipboard") + ".png";
              image.alt = "";
              mark.append(image);
            }
            const name = document.createElement("span");
            name.textContent = label;
            link.append(mark, name);
            actions.append(link);
          }
          sheet.append(actions);
          return actions.firstElementChild;
        }
      }).then(href => { if (href) return JournalUI.navigate(href); })
        .finally(() => button.setAttribute("aria-expanded", "false"));
    }
  }
  customElements.define("journal-nav", JournalNav);
})();
