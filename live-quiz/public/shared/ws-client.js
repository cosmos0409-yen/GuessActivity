// 共用的 WebSocket 連線：自動重連（指數退避，上限 10 秒）＋每 20 秒 ping 保持連線。
// ping 由伺服器端的 setWebSocketAutoResponse 直接回 pong，不會喚醒 Durable Object。
//
// 階段 4 韌性：
// - ping 送出後 8 秒沒收到 pong，就判定這條連線已經「假死」（手機鎖屏、換 Wi-Fi 常見），直接換一條新的，
//   不等瀏覽器自己發現（有時要好幾分鐘）。
// - 網路恢復（online 事件）或畫面回到前景（visibilitychange）時，立刻重連或先 ping 檢查，不等退避計時。

const PING_INTERVAL_MS = 20000;
const PONG_TIMEOUT_MS = 8000;
const MAX_BACKOFF_MS = 10000;
const NO_RETRY_CODES = [4403, 4404]; // 4403 被踢、4404 房間不存在：不要重連

export function connectRoom(roomCode, { onOpen, onMessage, onStatus }) {
  let socket = null;
  let pingTimer = null;
  let pongTimer = null;
  let retryTimer = null;
  let retry = 0;
  let stopped = false;

  function clearTimers() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = pongTimer = null;
  }

  function ping() {
    if (socket?.readyState !== WebSocket.OPEN || pongTimer) return;
    socket.send("ping");
    pongTimer = setTimeout(() => {
      pongTimer = null;
      reconnectNow(); // 等不到 pong：這條連線已經不通了
    }, PONG_TIMEOUT_MS);
  }

  function scheduleRetry() {
    onStatus?.("reconnecting");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, Math.min(MAX_BACKOFF_MS, 500 * 2 ** retry++));
  }

  function open() {
    if (stopped) return;
    clearTimeout(retryTimer);
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/ws?room=${encodeURIComponent(roomCode)}`);
    socket = ws;
    onStatus?.("connecting");

    // 被換掉的舊連線（ws !== socket）晚到的事件一律忽略，避免重複 join 或重複排程重連
    ws.addEventListener("open", () => {
      if (ws !== socket) return;
      retry = 0;
      onStatus?.("open");
      clearTimers();
      pingTimer = setInterval(ping, PING_INTERVAL_MS);
      onOpen?.();
    });

    ws.addEventListener("message", (event) => {
      if (ws !== socket) return;
      if (event.data === "pong") {
        clearTimeout(pongTimer);
        pongTimer = null;
        return;
      }
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage?.(msg);
    });

    ws.addEventListener("close", (event) => {
      if (ws !== socket) return;
      clearTimers();
      if (stopped || NO_RETRY_CODES.includes(event.code)) {
        stopped = true;
        onStatus?.("closed");
        return;
      }
      scheduleRetry();
    });
  }

  // 丟掉目前的連線（不管它是不是假死），馬上開一條新的
  function reconnectNow() {
    if (stopped) return;
    const old = socket;
    socket = null;
    clearTimers();
    try {
      old?.close();
    } catch {
      /* 已經關閉 */
    }
    retry = 0;
    open();
  }

  function onOnline() {
    if (stopped) return;
    if (socket?.readyState === WebSocket.OPEN) ping();
    else reconnectNow();
  }

  function onVisible() {
    if (document.visibilityState === "visible") onOnline();
  }

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  open();

  return {
    send(payload) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    },
    close() {
      stopped = true;
      clearTimers();
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.close();
    },
  };
}
