const assert = require('node:assert/strict');

/** Client giao thức Chromium tối thiểu dùng WebSocket Node 24; không thêm dependency dự án. */
class BrowserPage {
  /** Gắn response giao thức với bên gọi và giữ riêng listener sự kiện an toàn. */
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
  /** Mở tab trình duyệt tạm đã chọn. */
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
  /** Giới hạn lệnh giao thức để trình duyệt lỗi không làm treo test vô hạn. */
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
  /** Thực thi thao tác UI mà không tuần tự hóa kết quả bí mật vào báo cáo test. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result?.value;
  }
  /** Thăm dò điều kiện UI với timeout giới hạn thay vì chờ cố định lâu. */
  async wait(expression, label, timeout = 15000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`UI timeout: ${label}`);
  }
  /** Đặt giá trị form native và phát sự kiện input/change mà Angular nhận. */
  async fill(selector, value) {
    assert.equal(
      await this.evaluate(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
      ),
      true,
      `Missing input ${selector}`,
    );
  }
  /** Bấm nút có nhãn duy nhất thay vì dựa vào tọa độ hiển thị. */
  async click(text) {
    const result = await this.evaluate(
      `(()=>{const e=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||e.textContent.trim().replace(/\\s*→$/,'').trim())===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true})()`,
    );
    assert.equal(result, true, `Missing or disabled button: ${text}`);
  }
  /** Điều hướng bằng location trình duyệt thật và chờ form hoặc trang Angular. */
  async navigate(path, ready) {
    await this.send('Page.navigate', {
      url: `http://localhost:${process.env.LOOPLY_E2E_UI_PORT || '4200'}${path}`,
    });
    await this.wait(ready, path);
  }
  /** Đóng kết nối giao thức sau khi tiến trình trình duyệt dừng. */
  close() {
    this.socket.close();
  }
}
module.exports = { BrowserPage };
