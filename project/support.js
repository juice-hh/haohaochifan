// Local renderer for the bindings used by the seven exported Claude Design pages.
(() => {
  "use strict";

  const binding = /\{\{\s*([\w.]+)\s*\}\}/g;
  const exactBinding = /^\{\{\s*([\w.]+)\s*\}\}$/;

  function lookup(scope, path) {
    return path.split(".").reduce((value, key) => value?.[key], scope);
  }

  function readBinding(scope, expression) {
    return lookup(scope, expression.match(exactBinding)[1]);
  }

  function interpolate(scope, template) {
    return template.replace(binding, (_, path) => String(lookup(scope, path) ?? ""));
  }

  function bindChildren(parent) {
    const updates = Array.from(parent.childNodes, bindNode).filter(Boolean);
    return (scope) => updates.forEach((update) => update(scope));
  }

  function bindGroup(node) {
    const repeat = node.localName === "sc-for";
    const expression = node.getAttribute(repeat ? "list" : "value");
    const alias = node.getAttribute("as");
    const template = document.createDocumentFragment();
    template.append(...node.childNodes);
    const end = document.createComment(node.localName);
    node.replaceWith(end);
    const views = [];

    return (scope) => {
      const value = readBinding(scope, expression);
      const items = repeat ? value ?? [] : value ? [value] : [];

      while (views.length > items.length) {
        const range = document.createRange();
        range.setStartBefore(views.pop().start);
        range.setEndBefore(end);
        range.deleteContents();
      }

      items.forEach((item, index) => {
        if (!views[index]) {
          const content = template.cloneNode(true);
          const start = document.createComment("item");
          const update = bindChildren(content);
          end.before(start, content);
          views.push({ start, update });
        }
        views[index].update(repeat ? { ...scope, [alias]: item } : scope);
      });
    };
  }

  function bindNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const template = node.data;
      if (template.includes("{{")) {
        return (scope) => { node.data = interpolate(scope, template); };
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.localName === "sc-for" || node.localName === "sc-if") {
      return bindGroup(node);
    }

    const updates = [bindChildren(node)];
    for (const { name, value: template } of Array.from(node.attributes)) {
      if (!template.includes("{{")) continue;

      if (name.startsWith("on")) {
        const eventName = name === "onchange" && node.type === "range"
          ? "input"
          : name.slice(2);
        let handler;
        node.removeAttribute(name);
        node.addEventListener(eventName, (event) => handler?.(event));
        updates.push((scope) => { handler = readBinding(scope, template); });
      } else {
        updates.push((scope) => {
          const value = interpolate(scope, template);
          if (name === "value" && node instanceof HTMLInputElement) {
            if (node.value !== value) node.value = value;
          } else if (name === "href" && !value) {
            node.removeAttribute(name);
          } else if (node.getAttribute(name) !== value) {
            node.setAttribute(name, value);
          }
        });
      }
    }
    return (scope) => updates.forEach((update) => update(scope));
  }

  function start() {
    const root = document.querySelector("x-dc");
    const script = document.querySelector("script[type='text/x-dc'][data-dc-script]");
    const props = JSON.parse(script.dataset.props || "{}");
    const update = bindChildren(root);
    let component;

    class DCLogic {
      constructor(initialProps) {
        this.props = initialProps;
      }

      setState(changes) {
        this.state = { ...this.state, ...changes };
        update(component.renderVals());
      }
    }

    // The backed-up page supplies the original Component class as classic JS.
    const Component = new Function("DCLogic", script.textContent + "\nreturn Component;")(DCLogic);
    component = new Component(props);
    update(component.renderVals());

    // Center the fixed-width artboard in the desktop browser.
    root.style.cssText = "display: block; width: fit-content; margin-inline: auto;";
  }

  document.addEventListener("DOMContentLoaded", start, { once: true });
})();
