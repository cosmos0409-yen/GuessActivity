import { describe, expect, it } from "vitest";
import { generateQrDataUrl } from "./qr";

describe("generateQrDataUrl", () => {
  it("產生 data:image/ 開頭的字串，且不呼叫任何外部 QR 服務", async () => {
    const url = await generateQrDataUrl("https://example.com/form?entry.1=ROUND-1");
    expect(url.startsWith("data:image/")).toBe(true);
  });

  it("不同文字內容會產生不同的圖片內容", async () => {
    const a = await generateQrDataUrl("https://example.com/a");
    const b = await generateQrDataUrl("https://example.com/b");
    expect(a).not.toBe(b);
  });
});
