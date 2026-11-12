// Shared bottom navigation for the four main journal pages.
(() => {
  const items = [
    { page: "Main", label: "本周", icon: '<path d="M4 19V11M9.3 19V7M14.6 19v-6M20 19V9"/>' },
    { page: "Album", label: "饭相册", icon: '<rect x="3.5" y="4.5" width="17" height="15" rx="4"/><circle cx="15.5" cy="9.5" r="1.6"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18"/>' },
    { page: "Love", label: "爱吃的", icon: '<path d="M3.5 11h17a8.5 8 0 0 1-17 0zM9 4c-1 1.2 1 2 0 3.5M14 4c-1 1.2 1 2 0 3.5"/>' },
    { page: "Goal", label: "目标", icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>' }
  ];
  const icon = (paths, size = 24) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

  class JournalNav extends HTMLElement {
    static get observedAttributes() { return ["date"]; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      const active = this.getAttribute("page");
      const value = this.getAttribute("date");
      const date = Journal.isDate(value) ? value : Journal.selected();
      const recordDate = date > Journal.today ? Journal.today : date;
      this.innerHTML = '<div class="journal-dock"><nav aria-label="主导航">' + items.map((item) =>
        '<a href="' + Journal.link(item.page, date) + '"' + (active === item.page ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + item.label + '</span></a>'
      ).join("") + '</nav><a class="journal-camera" aria-label="拍一餐" href="' + Journal.link("Record", recordDate, { returnTo: items.some((item) => item.page === active) ? active : "Main" }) + '">' + icon('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>', 26) + '</a></div>';
    }
  }
  customElements.define("journal-nav", JournalNav);
})();
