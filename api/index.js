import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 60,
};

// تغییر نام به یک متغیر عادی
const API_BASE = (process.env.WEATHER_API_URL || "").replace(/\/$/, "");

const IGNORED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req, res) {
  if (!API_BASE) {
    res.statusCode = 500;
    // تغییر متن خطای تنظیم نبودن سرور
    return res.end("System Error: WEATHER_API_URL is not configured.");
  }

  try {
    const apiUrl = API_BASE + req.url;

    const headers = {};
    let userIp = null;
    for (const key of Object.keys(req.headers)) {
      const k = key.toLowerCase();
      const v = req.headers[key];
      if (IGNORED_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") { userIp = v; continue; }
      if (k === "x-forwarded-for") { if (!userIp) userIp = v; continue; }
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    if (userIp) headers["x-forwarded-for"] = userIp;

    const method = req.method;
    const hasData = method !== "GET" && method !== "HEAD";

    const requestOptions = { method, headers, redirect: "manual" };
    if (hasData) {
      requestOptions.body = Readable.toWeb(req);
      requestOptions.duplex = "half";
    }

    const weatherServerResponse = await fetch(apiUrl, requestOptions);

    res.statusCode = weatherServerResponse.status;
    for (const [k, v] of weatherServerResponse.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      try { res.setHeader(k, v); } catch {}
    }

    if (weatherServerResponse.body) {
      await pipeline(Readable.fromWeb(weatherServerResponse.body), res);
    } else {
      res.end();
    }
  } catch (err) {
    // تغییر متن خطا برای رد گم کنی
    console.error("weather api fetch error:", err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("API Error: Could not fetch weather data from source.");
    }
  }
}
