/** Local production-like HTTPS smoke check; a real deployed URL needs a separate run. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { SMTPServer } from "smtp-server";

if (process.env.NODE_ENV === "production") throw new Error("Deployment fixtures are disabled in production.");
const serverRoot = fileURLToPath(new URL("../", import.meta.url));
const clientRoot = fileURLToPath(new URL("../../client/", import.meta.url));
const clientCli = join(clientRoot, "node_modules", "@playwright", "test", "cli.js");
const viteCli = join(clientRoot, "node_modules", "vite", "bin", "vite.js");
const opensslCandidates = [process.env.OPENSSL_BIN, "openssl", "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"].filter(Boolean);
const openssl = opensslCandidates.find((candidate) => spawnSync(candidate, ["version"], { stdio: "ignore" }).status === 0);
assert.ok(openssl, "Install OpenSSL or set OPENSSL_BIN to run the local HTTPS deployment check.");

async function unusedPort() {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((done) => listener.close(done));
  return address.port;
}

const used = new Set();
async function uniquePort() {
  let port;
  do { port = await unusedPort(); } while (used.has(port));
  used.add(port);
  return port;
}

const [apiPort, clientPort, edgePort] = await Promise.all([uniquePort(), uniquePort(), uniquePort()]);
const baseURL = `https://127.0.0.1:${edgePort}`;
const tempRoot = resolve(tmpdir());
const certificateDir = await mkdtemp(join(tempRoot, "subscriptions-deploy-"));
const keyPath = join(certificateDir, "key.pem");
const certPath = join(certificateDir, "cert.pem");
const created = spawnSync(openssl, [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath,
  "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
], { encoding: "utf8" });
if (created.status !== 0) {
  const resolved = resolve(certificateDir);
  assert.ok(resolved.startsWith(`${tempRoot}${sep}`), "Refusing to remove a directory outside the temporary root.");
  await rm(resolved, { recursive: true, force: true });
  throw new Error(`Could not create the local test certificate: ${created.stderr}`);
}

const children = [];
let proxy;
let smtp;
const capturedMail = [];
function start(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const record = { name, child, output: "" };
  child.stdout.on("data", (chunk) => { record.output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { record.output += chunk.toString(); });
  children.push(record);
  return record;
}

async function getSecure(path, origin) {
  return new Promise((done, fail) => {
    const request = https.request({
      hostname: "127.0.0.1", port: edgePort, path,
      rejectUnauthorized: false,
      headers: origin ? { origin } : {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", fail);
    request.end();
  });
}

async function waitForReady() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const record of children) {
      if (record.child.exitCode !== null) throw new Error(`${record.name} exited: ${record.output}`);
    }
    try {
      const [health, home] = await Promise.all([getSecure("/api/v1/health", baseURL), getSecure("/")]);
      if (health.status === 200 && home.status === 200 && home.body.includes("<div id=\"root\"")) {
        assert.equal(JSON.parse(health.body).data.status, "ready");
        assert.equal(health.headers["access-control-allow-origin"], baseURL, "Configured CORS origin mismatch.");
        return;
      }
    } catch { /* Services are still starting. */ }
    await new Promise((done) => setTimeout(done, 400));
  }
  throw new Error(`Production-like services did not become ready: ${children.map((record) => `${record.name}: ${record.output}`).join("\n")}`);
}

async function stopChild(record) {
  if (record.child.exitCode !== null) return;
  record.child.kill("SIGTERM");
  await Promise.race([
    new Promise((done) => record.child.once("exit", done)),
    new Promise((done) => setTimeout(done, 3_000)),
  ]);
  if (record.child.exitCode === null) record.child.kill("SIGKILL");
}

try {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  try {
    const [columns] = await connection.query("SHOW COLUMNS FROM subscriptions LIKE 'billing_anchor_day'");
    assert.equal(columns.length, 1, "Required billing migration 008 has not been applied.");
    const [addOnColumns] = await connection.query("SHOW COLUMNS FROM subscription_lines LIKE 'is_enabled'");
    assert.equal(addOnColumns.length, 1, "Required add-on migration 009 has not been applied.");
  } finally {
    await connection.end();
  }

  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, callback) {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        capturedMail.push({
          recipients: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks).toString("utf8"),
        });
        callback(null, "Message captured");
      });
      stream.on("error", callback);
    },
  });
  await new Promise((done) => smtp.listen(0, "127.0.0.1", done));
  const smtpAddress = smtp.server.address();
  assert.ok(smtpAddress && typeof smtpAddress !== "string");

  start("compiled API", ["dist/src/server.js"], serverRoot, {
    ...process.env, NODE_ENV: "production", PORT: String(apiPort), APP_URL: baseURL, API_URL: baseURL,
    BILLING_RUN_INTERVAL_MINUTES: "0", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpAddress.port),
    SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "invoices@brightloop.test",
  });
  start("production browser bundle", [viteCli, "preview", "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], clientRoot, process.env);
  proxy = https.createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
    const target = request.url?.startsWith("/api/") ? apiPort : clientPort;
    const upstream = http.request({
      hostname: "127.0.0.1", port: target, path: request.url, method: request.method,
      headers: { ...request.headers, "x-forwarded-proto": "https", "x-forwarded-host": request.headers.host },
    }, (upstreamResponse) => {
      if (response.destroyed) { upstreamResponse.destroy(); return; }
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on("error", (error) => {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy(error);
      else { response.writeHead(502); response.end(error.message); }
    });
    request.pipe(upstream);
  });
  await new Promise((done) => proxy.listen(edgePort, "127.0.0.1", done));
  await waitForReady();
  console.log("Production API, migrations, HTTPS proxy, static bundle, health, and CORS checks passed locally.");

  const browser = spawn(process.execPath, [clientCli, "test"], {
    cwd: clientRoot,
    env: { ...process.env, E2E_BASE_URL: baseURL, E2E_IGNORE_HTTPS_ERRORS: "1", E2E_SMTP_CAPTURE: "1" },
    stdio: "inherit",
  });
  const browserCode = await new Promise((done) => browser.once("exit", done));
  assert.equal(browserCode, 0, "Production-like browser workflow failed.");
  assert.equal(capturedMail.length, 1, "Expected one invoice email via the production API and local SMTP capture.");
  assert.equal(capturedMail[0].recipients.length, 1);
  assert.match(capturedMail[0].recipients[0], /^browser\.[^@]+@demo\.test$/);
  const body = capturedMail[0].raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  assert.match(body, /Invoice INV-/);
  assert.match(body, /\/portal\?tab=invoices&open=/);
  assert.ok(body.includes(baseURL), "Invoice email link did not use the public HTTPS origin.");
  console.log("Production-like HTTPS browser, Secure session cookie, and API-to-SMTP capture checks passed.");
} finally {
  if (proxy) {
    proxy.closeAllConnections();
    await new Promise((done) => proxy.close(done));
  }
  await Promise.all(children.map(stopChild));
  if (smtp) await new Promise((done) => smtp.close(done));
  const resolved = resolve(certificateDir);
  assert.ok(resolved.startsWith(`${tempRoot}${sep}`), "Refusing to remove a directory outside the temporary root.");
  await rm(resolved, { recursive: true, force: true });
}
