// 共用的 WebSocket 連線：自動重連（指數退避，上限 10 秒）＋每 20 秒 ping 保持連線。
// ping 由伺服器端的 setWebSocketAutoResponse 直接回 pong，不會喚醒 Durable Object。

const PING_INTERVAL_MS = 20000;
const MAX_BACKOFF_MS = 10000;

export function connectRoom(roomCode, { onOpen, onMessage, onStatus }) {
  let socket = null;
  let pingTimer = null;
  let retry = 0;
  let closedByUs = false;

  function open() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${scheme}://${location.host}/ws?room=${encodeURIComponent(roomCode)}`);
    onStatus?.("connecting");

    socket.addEventListener("open", () => {
      retry = 0;
      onStatus?.("open");
      pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send("ping"), PING_INTERVAL_MS);
      onOpen?.();
    });

    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage?.(msg);
    });

    socket.addEventListener("close", (event) => {
      clearInterval(pingTimer);
      // 4403 被踢、4404 房間不存在：不要重連
      if (closedByUs || event.code === 4403 || event.code === 4404) {
        onStatus?.("closed");
        return;
      }
      onStatus?.("reconnecting");
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** retry++);
      setTimeout(open, delay);
    });
  }

  open();

  return {
    send(payload) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    },
    close() {
      closedByUs = true;
      socket?.close();
    },
  };
}
