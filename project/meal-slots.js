(() => {
  const meals = ["breakfast", "lunch", "dinner"];

  class JournalMealSlots extends HTMLElement {
    static get observedAttributes() { return ["date", "via"]; }

    connectedCallback() { this.render(); }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      const date = this.getAttribute("date");
      if (!Journal.isDate(date)) return;

      const canRecord = date <= Journal.today;
      const via = this.getAttribute("via");
      const fromDay = via === "week" || via === "album";
      this.innerHTML = `<ul class="meal-slots">${meals.map((kind) => {
        const label = Journal.kinds[kind];
        const contents = `
          <span class="meal-slot-plate" aria-hidden="true">
            <span class="meal-slot-mark"></span>
            ${canRecord ? '<span class="meal-slot-plus">+</span>' : ""}
          </span>
          <span>${label}</span>
        `;
        const route = Journal.link("Record", date, fromDay ? { kind, from: "day", via } : { kind });
        const slot = canRecord
          ? `<a class="meal-slot" href="${route}" aria-label="记${label}">${contents}</a>`
          : `<span class="meal-slot">${contents}</span>`;
        return `<li data-kind="${kind}">${slot}</li>`;
      }).join("")}</ul>`;
    }
  }

  customElements.define("journal-meal-slots", JournalMealSlots);
})();
