#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_DIR = path.resolve(new URL("..", import.meta.url).pathname);
const CASES_DIR = path.resolve(PROJECT_DIR, process.env.PORTFOLIO_CASES_DIR || "data/cases");
const BRAND_NAME = process.env.PORTFOLIO_BRAND_NAME || "Your Agency";
const BRAND_SITE = process.env.PORTFOLIO_BRAND_SITE || "https://example.com";
const DEFAULT_LANGUAGE = process.env.PORTFOLIO_DEFAULT_LANGUAGE || "th";
const DEFAULT_STATUS = process.env.WORDPRESS_DEFAULT_STATUS || "draft";

const tools = [
  {
    name: "list_portfolio_cases",
    description: "List portfolio case brief files available to the cowork workflow.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "get_portfolio_case",
    description: "Read one normalized portfolio case brief by case id.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string", description: "Case id, usually the JSON filename without .json." }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "validate_portfolio_case",
    description: "Validate required fields before case study generation and WordPress publishing.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "generate_case_study",
    description: "Generate a portfolio case study article draft from a case brief.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        format: { type: "string", enum: ["markdown", "html"], default: "html" }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "generate_portfolio_seo",
    description: "Generate SEO title, meta description, slug, excerpt, focus keywords, and JSON-LD.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "generate_image_prompt",
    description: "Generate a prompt for creating a portfolio cover or social image in GPT.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        templateId: {
          type: "string",
          enum: ["portfolio-cover", "case-study-hero", "metric-social-card"],
          default: "portfolio-cover"
        }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "build_wordpress_payload",
    description: "Build the WordPress REST API post payload without sending it.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        status: { type: "string", enum: ["draft", "pending", "publish", "private"], default: DEFAULT_STATUS },
        featuredMediaId: { type: "number" }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  },
  {
    name: "upload_wordpress_media",
    description: "Upload a local media file to WordPress. Requires WordPress environment variables.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        altText: { type: "string" }
      },
      required: ["filePath"],
      additionalProperties: false
    }
  },
  {
    name: "create_wordpress_draft",
    description: "Create a WordPress portfolio post. Defaults to draft. Requires WordPress environment variables.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        status: { type: "string", enum: ["draft", "pending", "publish", "private"], default: DEFAULT_STATUS },
        featuredMediaId: { type: "number" }
      },
      required: ["caseId"],
      additionalProperties: false
    }
  }
];

const requiredFields = ["id", "client", "industry", "projectType", "challenge", "solution", "results"];
let transportMode = "newline";
let inputBuffer = "";

function writeMessage(message) {
  const json = JSON.stringify(message);
  if (transportMode === "headers") {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
    return;
  }

  process.stdout.write(`${json}\n`);
}

function respond(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message, data) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message, data } });
}

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function safeCaseId(caseId) {
  const safeId = String(caseId || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!safeId) throw new Error("caseId is required.");
  return safeId;
}

async function readCase(caseId) {
  const file = path.join(CASES_DIR, `${safeCaseId(caseId)}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function listCases() {
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort();
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function languageOf(brief) {
  return brief.language || DEFAULT_LANGUAGE;
}

function titleForCase(brief) {
  return languageOf(brief) === "en"
    ? `Case Study: ${brief.client} - ${brief.projectType}`
    : `Case Study: ${brief.client} - ${brief.projectType}`;
}

function generateMarkdown(brief) {
  const solutionItems = asList(brief.solution).map((item) => `- ${item}`).join("\n");
  const resultItems = asList(brief.results).map((item) => `- ${item}`).join("\n");
  const metricItems = asList(brief.metrics)
    .map((metric) => `- ${metric.label}: ${metric.before || "-"} -> ${metric.after || "-"} (${metric.change || "improved"})`)
    .join("\n");
  const services = asList(brief.services).join(", ");

  return [
    `# ${titleForCase(brief)}`,
    "",
    `${BRAND_NAME} worked with ${brief.client} in the ${brief.industry} industry to deliver ${brief.projectType}.`,
    "",
    "## Challenge",
    brief.challenge,
    "",
    "## Solution",
    solutionItems,
    "",
    "## Results",
    resultItems,
    metricItems ? ["", "## Key Metrics", metricItems].join("\n") : "",
    services ? ["", "## Services", services].join("\n") : "",
    "",
    "## Next Step",
    languageOf(brief) === "en"
      ? `If your team wants to turn a digital project into measurable business results, ${BRAND_NAME} can help plan, design, build, and optimize the full workflow.`
      : `หากทีมของคุณต้องการเปลี่ยนโปรเจกต์ดิจิทัลให้สร้างผลลัพธ์ทางธุรกิจที่วัดได้ ${BRAND_NAME} พร้อมช่วยวางแผน ออกแบบ พัฒนา และปรับปรุงให้ครบทั้งระบบ`
  ]
    .filter(Boolean)
    .join("\n");
}

function generateHtml(brief) {
  const solutions = asList(brief.solution).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const results = asList(brief.results).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const metrics = asList(brief.metrics)
    .map((metric) => {
      const detail = [metric.before, metric.after].filter(Boolean).join(" to ");
      return `<li><strong>${escapeHtml(metric.label)}</strong>: ${escapeHtml(detail)}${metric.change ? ` (${escapeHtml(metric.change)})` : ""}</li>`;
    })
    .join("");
  const services = asList(brief.services).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const nextStep =
    languageOf(brief) === "en"
      ? `If your team wants to turn a digital project into measurable business results, ${BRAND_NAME} can help plan, design, build, and optimize the full workflow.`
      : `หากทีมของคุณต้องการเปลี่ยนโปรเจกต์ดิจิทัลให้สร้างผลลัพธ์ทางธุรกิจที่วัดได้ ${BRAND_NAME} พร้อมช่วยวางแผน ออกแบบ พัฒนา และปรับปรุงให้ครบทั้งระบบ`;

  return [
    `<h1>${escapeHtml(titleForCase(brief))}</h1>`,
    `<p>${escapeHtml(BRAND_NAME)} worked with <strong>${escapeHtml(brief.client)}</strong> in the ${escapeHtml(brief.industry)} industry to deliver ${escapeHtml(brief.projectType)}.</p>`,
    "<h2>Challenge</h2>",
    `<p>${escapeHtml(brief.challenge)}</p>`,
    "<h2>Solution</h2>",
    `<ul>${solutions}</ul>`,
    "<h2>Results</h2>",
    `<ul>${results}</ul>`,
    metrics ? `<h2>Key Metrics</h2><ul>${metrics}</ul>` : "",
    services ? `<h2>Services</h2><ul>${services}</ul>` : "",
    "<h2>Next Step</h2>",
    `<p>${escapeHtml(nextStep)}</p>`
  ]
    .filter(Boolean)
    .join("\n");
}

function validateBrief(brief) {
  const missing = requiredFields.filter((field) => {
    const value = brief[field];
    return Array.isArray(value) ? value.length === 0 : !value;
  });

  const warnings = [];
  if (!brief.keywords?.length) warnings.push("No SEO keywords provided.");
  if (!brief.images?.length) warnings.push("No images provided.");
  if (!brief.metrics?.length) warnings.push("No metrics provided.");
  if (!brief.approvalStatus) warnings.push("No approvalStatus provided.");

  return { ok: missing.length === 0, missing, warnings };
}

function generateSeo(brief) {
  const title = `${brief.client} ${brief.projectType} Case Study | ${BRAND_NAME}`;
  const description =
    languageOf(brief) === "en"
      ? `See how ${BRAND_NAME} delivered ${brief.projectType} for ${brief.client}, including challenge, solution, and measurable results.`
      : `ดูผลงาน ${brief.projectType} ของ ${brief.client} โดย ${BRAND_NAME} พร้อม challenge, solution และผลลัพธ์ที่วัดได้`;
  const keywords = asList(brief.keywords);

  return {
    title,
    metaDescription: description.slice(0, 155),
    slug: slugify(`${brief.client}-${brief.projectType}-case-study`),
    focusKeywords: keywords.length ? keywords.slice(0, 6) : [brief.projectType, brief.industry],
    excerpt:
      languageOf(brief) === "en"
        ? `${brief.client} portfolio case study for ${brief.projectType} in the ${brief.industry} industry.`
        : `ผลงาน ${brief.projectType} สำหรับ ${brief.client} ในธุรกิจ ${brief.industry}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      author: { "@type": "Organization", name: BRAND_NAME, url: BRAND_SITE },
      publisher: { "@type": "Organization", name: BRAND_NAME, url: BRAND_SITE },
      about: brief.projectType,
      keywords: keywords.join(", ")
    }
  };
}

function imagePrompt(brief, templateId = "portfolio-cover") {
  const metrics = asList(brief.metrics)
    .map((metric) => `${metric.label}: ${metric.change || `${metric.before || ""} to ${metric.after || ""}`}`.trim())
    .join(", ");
  const templates = {
    "portfolio-cover": "16:9 portfolio cover image for a WordPress case study, premium agency presentation, generous safe space for headline overlay",
    "case-study-hero": "wide website hero image, polished digital project showcase, subtle UI and workflow cues, professional B2B composition",
    "metric-social-card": "1:1 social card centered on one measurable result, strong hierarchy, clean data visualization space"
  };

  return [
    `Create an image for a portfolio case study.`,
    `Brand: ${BRAND_NAME}.`,
    `Template: ${templates[templateId] || templates["portfolio-cover"]}.`,
    `Client: ${brief.client}.`,
    `Industry: ${brief.industry}.`,
    `Project type: ${brief.projectType}.`,
    metrics ? `Result to highlight: ${metrics}.` : "",
    `Style: modern, trustworthy, practical, high-end digital agency, clean layout, realistic but not stock-photo generic.`,
    `Avoid: unreadable text, fake logos, distorted interfaces, excessive decoration, claims not present in the case brief.`,
    `Leave clear safe areas for final text overlay.`
  ]
    .filter(Boolean)
    .join("\n");
}

function parseIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function buildWordPressPayload(brief, options = {}) {
  const seo = generateSeo(brief);
  const payload = {
    title: seo.title,
    slug: seo.slug,
    status: options.status || DEFAULT_STATUS,
    content: `${generateHtml(brief)}\n<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`,
    excerpt: seo.excerpt,
    categories: parseIdList(process.env.WORDPRESS_DEFAULT_CATEGORY_IDS),
    tags: parseIdList(process.env.WORDPRESS_DEFAULT_TAG_IDS),
    meta: {
      seo_title: seo.title,
      seo_description: seo.metaDescription,
      focus_keywords: seo.focusKeywords.join(", ")
    }
  };

  if (options.featuredMediaId) payload.featured_media = options.featuredMediaId;
  return payload;
}

function wordpressConfig() {
  const baseUrl = process.env.WORDPRESS_BASE_URL;
  const username = process.env.WORDPRESS_USERNAME;
  const password = process.env.WORDPRESS_APP_PASSWORD;
  if (!baseUrl || !username || !password) {
    throw new Error("Missing WORDPRESS_BASE_URL, WORDPRESS_USERNAME, or WORDPRESS_APP_PASSWORD.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    auth: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
  };
}

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

async function uploadWordPressMedia(args) {
  const { baseUrl, auth } = wordpressConfig();
  const filePath = path.resolve(PROJECT_DIR, args.filePath);
  const buffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentTypeFor(filename)
    },
    body: buffer
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WordPress media upload failed (${response.status}): ${JSON.stringify(body)}`);
  }

  if (args.altText) {
    await fetch(`${baseUrl}/wp-json/wp/v2/media/${body.id}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text: args.altText })
    });
  }

  return body;
}

async function createWordPressDraft(args) {
  const { baseUrl, auth } = wordpressConfig();
  const brief = await readCase(args.caseId);
  const payload = buildWordPressPayload(brief, args);
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WordPress post creation failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

async function callTool(name, args = {}) {
  if (name === "list_portfolio_cases") return textResult({ cases: await listCases(), casesDir: CASES_DIR });
  if (name === "get_portfolio_case") return textResult(await readCase(args.caseId));
  if (name === "validate_portfolio_case") return textResult(validateBrief(await readCase(args.caseId)));
  if (name === "generate_case_study") {
    const brief = await readCase(args.caseId);
    return textResult(args.format === "markdown" ? generateMarkdown(brief) : generateHtml(brief));
  }
  if (name === "generate_portfolio_seo") return textResult(generateSeo(await readCase(args.caseId)));
  if (name === "generate_image_prompt") return textResult(imagePrompt(await readCase(args.caseId), args.templateId));
  if (name === "build_wordpress_payload") return textResult(buildWordPressPayload(await readCase(args.caseId), args));
  if (name === "upload_wordpress_media") return textResult(await uploadWordPressMedia(args));
  if (name === "create_wordpress_draft") return textResult(await createWordPressDraft(args));
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "wordpress-portfolio-mcp-cowork", version: "0.1.0" }
    });
    return;
  }

  if (message.method === "tools/list") {
    respond(message.id, { tools });
    return;
  }

  if (message.method === "tools/call") {
    try {
      respond(message.id, await callTool(message.params?.name, message.params?.arguments || {}));
    } catch (error) {
      respond(message.id, { content: [{ type: "text", text: error.message }], isError: true });
    }
    return;
  }

  if (message.id !== undefined) respondError(message.id, -32601, `Method not found: ${message.method}`);
}

function parseNewlineFrames() {
  const lines = inputBuffer.split(/\r?\n/);
  inputBuffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handle(JSON.parse(trimmed));
    } catch (error) {
      respondError(null, -32700, "Parse error", error.message);
    }
  }
}

function parseHeaderFrames() {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = inputBuffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      respondError(null, -32700, "Missing Content-Length header");
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (Buffer.byteLength(inputBuffer.slice(bodyStart), "utf8") < length) return;

    const body = inputBuffer.slice(bodyStart, bodyEnd);
    inputBuffer = inputBuffer.slice(bodyEnd);
    try {
      handle(JSON.parse(body));
    } catch (error) {
      respondError(null, -32700, "Parse error", error.message);
    }
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  if (/^Content-Length:/i.test(inputBuffer)) {
    transportMode = "headers";
    parseHeaderFrames();
    return;
  }

  parseNewlineFrames();
});
