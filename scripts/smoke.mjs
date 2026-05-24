import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, ["src/server.js"], {
  cwd: projectDir,
  stdio: ["pipe", "pipe", "inherit"]
});

const messages = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "validate_portfolio_case", arguments: { caseId: "example-portfolio-case" } }
  },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "build_wordpress_payload", arguments: { caseId: "example-portfolio-case" } }
  }
];

let received = 0;
server.stdout.on("data", (chunk) => {
  for (const line of String(chunk).trim().split(/\r?\n/)) {
    if (!line) continue;
    const parsed = JSON.parse(line);
    if (parsed.error) {
      console.error(parsed.error);
      process.exitCode = 1;
    }
    received += 1;
  }

  if (received >= messages.length) server.kill();
});

server.on("exit", () => {
  if (received < messages.length) {
    console.error(`Expected ${messages.length} responses, got ${received}.`);
    process.exit(1);
  }
});

for (const message of messages) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}
