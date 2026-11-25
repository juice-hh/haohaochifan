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
      this.innerHTML = `<ul class="meal-slots">${meals.map((kind) => {
        const label = Journal.kinds[kind];
        const contents = `
          <span class="meal-slot-plate" aria-hidden="true"><span class="meal-slot-mark"></span>
            ${canRecord ? '<span class="meal-slot-plus">+</span>' : ""}
          </span><span>${label}</span>`;
        const slot = canRecord
          ? `<button type="button" class="meal-slot" data-meal="${kind}" aria-label="记${label}">${contents}</button>`
          : `<span class="meal-slot">${contents}</span>`;
        return `<li data-kind="${kind}">${slot}</li>`;
      }).join("")}</ul>`;
      this.querySelectorAll("button[data-meal]").forEach((button) => {
        button.onclick = () => document.querySelector("journal-nav")?.open(button.dataset.meal);
      });
    }
  }

  customElements.define("journal-meal-slots", JournalMealSlots);
})();
