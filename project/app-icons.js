// Shared icon set. Soft flat shapes with one highlight colour, matching the nav icons.
// <hh-icon name="carb" size="18"></hh-icon> renders decoratively; label it on the parent.
(() => {
  const paths = {
    // Meals
    breakfast: '<circle cx="12" cy="13" r="7.5" fill="#FFE7A3"/><circle cx="12" cy="13" r="3.6" fill="#F4B63F"/><path d="M5 7.2 3.6 5.8M19 7.2l1.4-1.4M12 3.2V1.6" stroke="#F4B63F" stroke-width="1.8" stroke-linecap="round"/>',
    lunch: '<path d="M3.2 11.6h17.6c0 4.6-3.6 8.2-8.8 8.2s-8.8-3.6-8.8-8.2Z" fill="#CFE8D2"/><path d="M6.5 11.4c.6-2.6 2.6-4.2 5.5-4.2s4.9 1.6 5.5 4.2" fill="#8CC79A"/><circle cx="10" cy="6" r="1.4" fill="#8CC79A"/><circle cx="14.2" cy="5.2" r="1.2" fill="#8CC79A"/>',
    dinner: '<path d="M19.2 14.6A8 8 0 0 1 9.4 4.8a8 8 0 1 0 9.8 9.8Z" fill="#C9C0F6"/><circle cx="16.6" cy="6.2" r="1.3" fill="#8C7BE6"/><circle cx="19.6" cy="9.4" r=".9" fill="#8C7BE6"/>',
    snack: '<path d="M7.4 9.2h9.2l-1.1 10.2a1.6 1.6 0 0 1-1.6 1.4h-3.8a1.6 1.6 0 0 1-1.6-1.4Z" fill="#FFD3BC"/><path d="M6.4 6.4h11.2a1.4 1.4 0 0 1 0 2.8H6.4a1.4 1.4 0 0 1 0-2.8Z" fill="#F29A6B"/><path d="m13 6.4 1.8-3.8" stroke="#F29A6B" stroke-width="1.6" stroke-linecap="round"/>',
    // Nutrients
    energy: '<path d="M13.4 2.4 5.6 13.2h5.2l-1.2 8.4 7.8-10.8h-5.2Z" fill="#7A66E0"/>',
    carb: '<path d="M12 21c-.2-3.6-.2-6.8 0-10.2" stroke="#C99621" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="9.4" cy="8.4" rx="2" ry="3" transform="rotate(-25 9.4 8.4)" fill="#F0C14B"/><ellipse cx="14.6" cy="8.4" rx="2" ry="3" transform="rotate(25 14.6 8.4)" fill="#F0C14B"/><ellipse cx="9.6" cy="13.8" rx="2" ry="3" transform="rotate(-25 9.6 13.8)" fill="#F0C14B"/><ellipse cx="14.4" cy="13.8" rx="2" ry="3" transform="rotate(25 14.4 13.8)" fill="#F0C14B"/><ellipse cx="12" cy="4.4" rx="1.7" ry="2.5" fill="#F0C14B"/>',
    protein: '<path d="M12 2.8c3.8 0 6.6 4.6 6.6 9.6S15.6 21.2 12 21.2s-6.6-3.8-6.6-8.8S8.2 2.8 12 2.8Z" fill="#FFF3E0"/><path d="M12 2.8c3.8 0 6.6 4.6 6.6 9.6S15.6 21.2 12 21.2s-6.6-3.8-6.6-8.8S8.2 2.8 12 2.8Z" fill="none" stroke="#B8A9F5" stroke-width="1.4"/><circle cx="12" cy="14" r="3.4" fill="#A996F2"/>',
    fat: '<path d="M12 2.8c3 4 6.2 7.4 6.2 11.4a6.2 6.2 0 0 1-12.4 0c0-4 3.2-7.4 6.2-11.4Z" fill="#8FCFA6"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    sugar: '<rect x="4.8" y="6.6" width="10" height="10" rx="2.2" transform="rotate(-10 9.8 11.6)" fill="#FFE29A"/><rect x="10.2" y="10.8" width="9" height="9" rx="2" transform="rotate(8 14.7 15.3)" fill="#F4B63F"/><path d="M8 9.6h2.4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
    addedSugar: '<path d="M7.6 4.2h8.8l-1.2 16a1.2 1.2 0 0 1-1.2 1.1h-4a1.2 1.2 0 0 1-1.2-1.1Z" fill="#FFD7E3"/><path d="M8.2 11.6h7.6l-.6 8.6a1.2 1.2 0 0 1-1.2 1.1h-4a1.2 1.2 0 0 1-1.2-1.1Z" fill="#F08AA8"/><path d="m13.6 4.2 1.6-2.6" stroke="#F08AA8" stroke-width="1.6" stroke-linecap="round"/>',
    fiber: '<path d="M12 21.2V9" stroke="#3E9A62" stroke-width="1.6" stroke-linecap="round"/><path d="M12 12.6C8 12.6 5.4 10 5.4 5.6c4 0 6.6 2.6 6.6 7Z" fill="#8FCFA6"/><path d="M12 15.4c4 0 6.6-2.6 6.6-7-4 0-6.6 2.6-6.6 7Z" fill="#5DB27E"/>',
    weight: '<rect x="3.4" y="4.4" width="17.2" height="16" rx="5" fill="#E7E2FB"/><path d="M8 10.6a4.2 4.2 0 0 1 8 0" stroke="#7A66E0" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="m12 10.8 1.6-2.2" stroke="#7A66E0" stroke-width="1.8" stroke-linecap="round"/>',
    // Actions (single colour, follow currentColor)
    edit: '<path d="M4.4 19.6 5.2 15.8 15.6 5.4a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.2 18.8Z" fill="currentColor" opacity=".22"/><path d="M4.4 19.6 5.2 15.8 15.6 5.4a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.2 18.8Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m13.8 7.2 3 3" stroke="currentColor" stroke-width="1.9"/>',
    trash: '<path d="M6.2 7.6h11.6l-.9 11.4a2 2 0 0 1-2 1.8H9.1a2 2 0 0 1-2-1.8Z" fill="currentColor" opacity=".22"/><path d="M6.2 7.6h11.6l-.9 11.4a2 2 0 0 1-2 1.8H9.1a2 2 0 0 1-2-1.8ZM4.6 7.6h14.8M9.6 7.4V5.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v2.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="m6.5 6.5 11 11m0-11-11 11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    left: '<path d="m14.5 6-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    right: '<path d="m9.5 6 6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    sliders: '<path d="M5 7h14M5 17h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="2.6" fill="#fff" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="17" r="2.6" fill="#fff" stroke="currentColor" stroke-width="2"/>',
    photo: '<rect x="3.4" y="5.4" width="17.2" height="13.6" rx="3.6" fill="currentColor" opacity=".22"/><rect x="3.4" y="5.4" width="17.2" height="13.6" rx="3.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m6.6 16 3.6-4 2.6 2.6 1.8-1.8 2.8 3.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    scan: '<path d="M4 9V6.4A2.4 2.4 0 0 1 6.4 4H9M15 4h2.6A2.4 2.4 0 0 1 20 6.4V9M20 15v2.6a2.4 2.4 0 0 1-2.4 2.4H15M9 20H6.4A2.4 2.4 0 0 1 4 17.6V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M7.5 12h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    up: '<path d="M12 18.5V6m0 0-5 5m5-5 5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    down: '<path d="M12 5.5V18m0 0-5-5m5 5 5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
  };
  const aliases = { pro: "protein", totalSugar: "sugar", kcal: "energy", calories: "energy" };

  function svg(name, size = 20) {
    const body = paths[aliases[name] ?? name];
    if (!body) return "";
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  class HhIcon extends HTMLElement {
    static get observedAttributes() { return ["name", "size"]; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      this.setAttribute("aria-hidden", "true");
      this.innerHTML = svg(this.getAttribute("name"), Number(this.getAttribute("size")) || 20);
    }
  }
  customElements.define("hh-icon", HhIcon);
  window.AppIcons = { svg, names: Object.keys(paths) };
})();
