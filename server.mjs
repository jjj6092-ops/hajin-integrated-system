import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 3000);
const adminId = (process.env.ADMIN_ID || "admin").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "hajin1234!";
const publicDir = join(process.cwd(), "dist/client");
const sessions = new Map();
if (!process.env.ADMIN_ID || !process.env.ADMIN_PASSWORD) {
  console.warn("관리자 환경변수가 없어 초기 계정으로 시작합니다. 배포 후 환경변수를 설정하세요.");
}
const hash = (value) => createHash("sha256").update(value).digest();
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((v) => v.trim().split(/=(.*)/s).slice(0, 2).map(decodeURIComponent)));
const userFor = (req) => { const token = cookies(req).hajin_session; return token && sessions.has(token) ? sessions.get(token) : null; };
const json = (res, status, data, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((resolve, reject) => { let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 100000) reject(new Error("too large")); }); req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("bad json")); } }); });
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json" };

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/session" && req.method === "GET") return json(res, 200, { user: userFor(req) });
    if (req.url === "/api/login" && req.method === "POST") {
      const data = await body(req);
      const id = String(data.email || "").split("@")[0].trim().toLowerCase();
      const password = String(data.password || "");
      const ok = id === adminId && timingSafeEqual(hash(password), hash(adminPassword));
      if (!ok) return json(res, 401, { error: "아이디 또는 비밀번호가 맞지 않습니다." });
      const token = randomBytes(32).toString("hex");
      const user = { id: adminId, email: `${adminId}@hajin.internal` };
      sessions.set(token, user);
      return json(res, 200, { user }, { "Set-Cookie": `hajin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` });
    }
    if (req.url === "/api/logout" && req.method === "POST") {
      const token = cookies(req).hajin_session;
      if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { "Set-Cookie": "hajin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
    }
    if (req.url?.startsWith("/api/")) return json(res, 404, { error: "없는 기능입니다." });
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let file = join(publicDir, clean === "/" ? "index.html" : clean);
    if (!file.startsWith(publicDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, "index.html");
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=31536000, immutable" });
    createReadStream(file).pipe(res);
  } catch {
    json(res, 400, { error: "요청 형식이 올바르지 않습니다." });
  }
});
server.listen(port, "0.0.0.0", () => console.log(`하진 통합시스템 실행: ${port}`));
