const fs = require("node:fs");
const path = require("node:path");
const READ_NAMES = new Set([
  "get_data",
  "model_table_meta",
  "model_field_meta",
  "project_lineage",
  "export_project_pages",
  "export_palette_groups",
  "export_project_transfer",
]);
const isRead = (name) =>
  /^(get_|list_|check_|data_catalog_(sources|joined_tables|measures|variables)$|storage_(list|picker)$|qa_(get_|list_))/.test(
    name,
  ) || READ_NAMES.has(name);
const secretKey = (key) =>
  /^(password|authorization|cookie|setcookie|xauthtoken|jwt|token|pattoken|pat|fbpat|accesstoken|refreshtoken|sessiontoken|clientsecret|apikey)$/.test(
    key.replace(/[^a-z0-9]/gi, "").toLowerCase(),
  );
function safe(value, token = "") {
  if (typeof value === "string") {
    let s = value.replace(/fbpat_[A-Za-z0-9_-]{12,}/g, "[REDACTED]");
    if (token) s = s.split(token).join("[REDACTED]");
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object")
        return JSON.stringify(safe(parsed, token));
    } catch {}
    s = s.replace(
      /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
      "[REDACTED]",
    );
    return s.replace(
      /(["']?(?:password|authorization|cookie|set-cookie|x-auth-token|jwt|(?:access|refresh|session)[_-]?token|client[_-]?secret|api[_-]?key|token|pat)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^,\r\n;}&]+)/gi,
      '$1"[REDACTED]"',
    );
  }
  if (Array.isArray(value)) return value.map((v) => safe(v, token));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        secretKey(k) ? "[REDACTED]" : safe(v, token),
      ]),
    );
  return value;
}
function decode(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  for (const line of text.split(/\r?\n/))
    if (line.startsWith("data:")) {
      const body = JSON.parse(line.slice(5).trim());
      if ("result" in body || "error" in body) return body;
    }
  throw new Error(
    "Response is neither JSON-RPC JSON nor a supported SSE data event.",
  );
}
class Client {
  constructor({ endpoint, token, projectId, fetchImpl = globalThis.fetch }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "Use the target HTTPS MCP endpoint without URL credentials.",
      );
    if (!token || !projectId)
      throw new Error("FB_PAT and FB_PROJECT_ID are required.");
    this.endpoint = url.href;
    this.token = token;
    this.projectId = projectId;
    this.fetch = fetchImpl;
    this.session = null;
    this.counter = 0;
  }
  async rpc(method, params) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer " + this.token,
    };
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    const r = await this.fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.counter,
        method,
        params,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const text = await r.text();
    if (!r.ok)
      throw new Error(
        "MCP HTTP " + r.status + ": " + safe(text.slice(0, 600), this.token),
      );
    this.session = r.headers?.get?.("Mcp-Session-Id") || this.session;
    const body = decode(text);
    if (body.error)
      throw new Error(JSON.stringify(safe(body.error, this.token)));
    return body.result;
  }
  async initialize() {
    return this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "fastboard-multipage-dashboards helper",
        version: "1.0.0",
      },
    });
  }
  async call(name, args = {}, allowWrite = false) {
    for (const key of ["projectId", "project"])
      if (args[key] && args[key] !== this.projectId)
        throw new Error("Argument " + key + " does not match FB_PROJECT_ID.");
    const read = isRead(name);
    if (!read && !allowWrite)
      throw new Error("Tool requires explicit --write: " + name);
    const payload = { projectId: this.projectId, ...args };
    if (name === "get_data" && !payload.project)
      payload.project = this.projectId;
    if (!read) await this.call("get_last_settings_timestamp");
    const result = await this.rpc("tools/call", { name, arguments: payload });
    if (result?.isError)
      throw new Error(JSON.stringify(safe(result.content, this.token)));
    const text = result?.content?.find((c) => c.type === "text")?.text;
    if (text !== undefined) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return result;
  }
}
async function main(argv, env = process.env) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    if (!argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error("Missing value for " + name);
    return argv[i + 1];
  };
  const client = new Client({
    endpoint: env.FB_MCP,
    token: env.FB_PAT,
    projectId: env.FB_PROJECT_ID,
  });
  await client.initialize();
  let output;
  if (argv[0] === "tools") output = await client.rpc("tools/list", {});
  else if (argv[0] === "call" && argv[1]) {
    const input = arg("--args");
    const args = input
      ? JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, ""))
      : {};
    const file = arg("--file");
    if (file) {
      const ext = path.extname(file).toLowerCase();
      if (![".json", ".zip"].includes(ext))
        throw new Error("File envelope supports explicit JSON/ZIP here.");
      args.file = {
        contentType: ext === ".zip" ? "application/zip" : "application/json",
        encoding: "base64",
        data: fs.readFileSync(file).toString("base64"),
      };
    }
    output = await client.call(argv[1], args, argv.includes("--write"));
  } else
    throw new Error(
      "Usage: mcp-client.cjs tools | call TOOL [--args args.json] [--file export.json] [--write] [--out result.json]",
    );
  const text = JSON.stringify(safe(output, env.FB_PAT), null, 2);
  const out = arg("--out");
  if (out) {
    const parent = path.dirname(path.resolve(out));
    if (!fs.statSync(parent).isDirectory())
      throw new Error("Output parent is not a directory.");
    fs.writeFileSync(out, text);
    console.log("Saved sanitized result to " + out);
  } else console.log(text);
}
if (require.main === module)
  main(process.argv.slice(2)).catch((e) => {
    console.error(safe(e.message, process.env.FB_PAT));
    process.exitCode = 1;
  });
module.exports = { Client, decode, safe, isRead };
