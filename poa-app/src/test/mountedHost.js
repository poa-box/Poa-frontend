// Small host surface for actual ReactDOM mount/update/error recovery in node-only tests.
// It has no browser, layout, network, or wallet implementation.
class HostNode {
  constructor(nodeType, name, ownerDocument) {
    Object.assign(this, { nodeType, nodeName: name.toUpperCase(), tagName: name.toUpperCase(),
      ownerDocument, namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [], attributes: {},
      style: {}, parentNode: null, disabled: false, value: '', text: '', listeners: {} });
  }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); this.childNodes.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child; }
  insertBefore(child, before) { if (child.parentNode) child.parentNode.removeChild(child); this.childNodes.splice(this.childNodes.indexOf(before), 0, child); child.parentNode = this; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'disabled') this.disabled = true; if (name === 'value') this.value = String(value); }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'disabled') this.disabled = false; }
  addEventListener(type, listener, capture = false) { (this.listeners[type] ||= []).push({ listener, capture }); }
  removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] || []).filter(item => item.listener !== listener); }
  click() {
    const event = { type: 'click', target: this, button: 0, bubbles: true, stopPropagation() {}, preventDefault() {} };
    const path = [];
    for (let node = this; node; node = node.parentNode) path.push(node);
    for (const capture of [true, false]) {
      for (const node of capture ? [...path].reverse() : path) {
        for (const item of node.listeners.click || []) if (item.capture === capture) item.listener(event);
      }
    }
  }
  get firstChild() { return this.childNodes[0] || null; }
  get options() { return this.childNodes.filter(child => child.tagName === 'OPTION'); }
  get nodeValue() { return this.text; }
  set nodeValue(value) { this.text = String(value); }
  get textContent() { return this.text + this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.childNodes.forEach(child => { child.parentNode = null; }); this.childNodes = []; }
}

export function mountedHostDocument() {
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {},
    createElement: name => new HostNode(1, name, doc),
    createElementNS: (_namespace, name) => new HostNode(1, name, doc),
    createTextNode: text => { const node = new HostNode(3, '#text', doc); node.textContent = text; return node; } };
  doc.body = doc.createElement('body'); doc.documentElement = doc.createElement('html');
  return doc;
}

export function mountedNodes(node) {
  return [node, ...node.childNodes.flatMap(child => mountedNodes(child))];
}
