// QR code 產生：只用本機的 npm 套件 `qrcode`，不呼叫任何外部 QR 產生服務
// （現場網路可能不穩，且投票網址不應該經過第三方伺服器轉手）。

import QRCode from "qrcode";

/**
 * 把文字（通常是 voteUrl() 產生的表單網址）轉成 `data:image/...` 開頭的 QR code 圖片。
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 320,
  });
}
