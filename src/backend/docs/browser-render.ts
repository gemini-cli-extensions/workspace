/**
 * @file docs/browser-render.ts
 * @description Rasterize a PDF to a PNG using Cloudflare Browser Rendering (REST).
 * A pdf.js harness renders the first N pages to stacked canvases; Browser
 * Rendering screenshots the full page. No BROWSER binding / puppeteer dep — uses
 * the account id + API token secrets. Returns null (caller falls back) if the
 * service isn't available or the PDF is too large to inline.
 */
import { getSecret } from "@/backend/utils/secrets";

const MAX_PDF_BYTES = 3_000_000; // keep the inlined base64 payload sane

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function harness(b64: string, maxPages: number): string {
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
  return `<!doctype html><html><head><meta charset="utf-8">
<script src="${PDFJS}/pdf.min.js"></script></head>
<body style="margin:0;background:#fff"><div id="pages"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc="${PDFJS}/pdf.worker.min.js";
(async()=>{try{
  const data=Uint8Array.from(atob("${b64}"),c=>c.charCodeAt(0));
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const n=Math.min(pdf.numPages,${maxPages});
  for(let i=1;i<=n;i++){const p=await pdf.getPage(i);const vp=p.getViewport({scale:1.4});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    document.getElementById('pages').appendChild(c);
    await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;}
}catch(e){document.body.setAttribute('data-error',String(e));}
const d=document.createElement('div');d.id='ready';document.body.appendChild(d);
})();
</script></body></html>`;
}

/** Render a PDF's pages to one tall PNG via Browser Rendering. Null on failure. */
export async function rasterizePdf(env: Env, pdfBytes: Uint8Array, maxPages = 8): Promise<Uint8Array | null> {
  if (pdfBytes.length > MAX_PDF_BYTES) return null;
  const accountId = await getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
  const token = await getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
  if (!accountId || !token) return null;

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      html: harness(toBase64(pdfBytes), maxPages),
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      waitForSelector: "#ready",
      screenshotOptions: { fullPage: true, type: "png" },
    }),
  });
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") ?? "").includes("image")) return null;
  return new Uint8Array(await res.arrayBuffer());
}
