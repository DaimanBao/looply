const assert = require('node:assert/strict');

/** Minimal Chromium protocol client using Node 24 WebSocket; adds no project dependency. */
class BrowserPage {
  /** Associates protocol responses with their callers and keeps safe event listeners separate. */
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        message.error
          ? pending.reject(new Error(message.error.message))
          : pending.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
  }
  /** Opens the selected disposable browser tab. */
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const page = new BrowserPage(socket);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    return page;
  }
  /** Bounds protocol commands so a broken browser cannot hang the test indefinitely. */
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  /** Evaluates UI operations without serializing secret results to the test report. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result?.value;
  }
  /** Polls a UI condition with a bounded timeout rather than fixed slow sleeps. */
  async wait(expression, label, timeout = 15000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`UI timeout: ${label}`);
  }
  /** Sets a native form value and dispatches the input/change events Angular consumes. */
  async fill(selector, value) {
    assert.equal(
      await this.evaluate(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
      ),
      true,
      `Missing input ${selector}`,
    );
  }
  /** Clicks the uniquely labelled button instead of relying on visual coordinates. */
  async click(text) {
    const result = await this.evaluate(
      `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().replace(/\\s*→$/,'').trim()===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true})()`,
    );
    assert.equal(result, true, `Missing or disabled button: ${text}`);
  }
  /** Navigates through the real browser location and waits for Angular's form or page. */
  async navigate(path, ready) {
    await this.send('Page.navigate', { url: `http://localhost:4200${path}` });
    await this.wait(ready, path);
  }
  /** Closes the protocol connection after the browser process is stopped. */
  close() {
    this.socket.close();
  }
}
module.exports = { BrowserPage };
