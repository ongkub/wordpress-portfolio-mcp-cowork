# Wordpress Portfolio Mcp Cowork

Reusable MCP server สำหรับทีม/เอเจนซี่ที่อยากให้ AI ช่วยทำ portfolio case study แล้วส่งเข้า WordPress ผ่าน REST API

Flow หลัก:

```text
ทีมเพิ่ม case brief + รูป
↓
MCP validate ข้อมูล
↓
AI เรียก MCP เพื่อสร้าง case study / SEO / image prompt
↓
ทีมตรวจและสร้างรูป final
↓
MCP build WordPress payload
↓
MCP upload media + create WordPress draft
```

## Requirements

- Node.js 20+
- WordPress ที่เปิด REST API
- WordPress Application Password สำหรับ user ที่มีสิทธิ์สร้าง post/media

ไม่มี npm dependency ภายนอกใน MVP นี้

## Install แบบง่ายด้วย Cowork

ถ้าใช้ Codex / Claude Code / AI cowork อยู่แล้ว ให้สั่งประมาณนี้ได้เลย:

```text
เอา GitHub repo นี้ไปลงให้หน่อย:
https://github.com/ongkub/wordpress-portfolio-mcp-cowork

ติดตั้งไว้ที่ /Users/your-name/wordpress-portfolio-mcp-cowork
แล้วตั้งค่า MCP server ให้เรียกใช้งานได้
```

จากนั้น cowork จะช่วยทำขั้นตอนหลักให้:

1. clone repo จาก GitHub
2. เช็คว่ามี Node.js พร้อมใช้งาน
3. รัน `npm run smoke` เพื่อตรวจว่า MCP server ทำงาน
4. ช่วยเตรียม MCP config สำหรับ Claude Desktop / Claude Code
5. ช่วยใส่ค่า WordPress env แบบไม่ commit secret เข้า Git

ถ้าต้องทำเองแบบ manual:

```bash
cd /Users/your-name
git clone https://github.com/ongkub/wordpress-portfolio-mcp-cowork.git
cd wordpress-portfolio-mcp-cowork
npm run smoke
```

หลังจากนั้นเอา path ของเครื่องคุณไปใส่ใน MCP config:

```json
{
  "mcpServers": {
    "wordpress-portfolio-mcp-cowork": {
      "command": "node",
      "args": ["/Users/your-name/wordpress-portfolio-mcp-cowork/src/server.js"],
      "env": {
        "PORTFOLIO_CASES_DIR": "/Users/your-name/wordpress-portfolio-mcp-cowork/data/cases",
        "PORTFOLIO_BRAND_NAME": "Your Agency",
        "PORTFOLIO_BRAND_SITE": "https://example.com",
        "WORDPRESS_BASE_URL": "https://example.com",
        "WORDPRESS_USERNAME": "api-user",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx",
        "WORDPRESS_DEFAULT_STATUS": "draft"
      }
    }
  }
}
```

Prompt ตัวอย่างหลังติดตั้ง:

```text
ใช้ wordpress-portfolio-mcp-cowork ช่วยสร้าง portfolio case study จาก case example-portfolio-case
ตรวจข้อมูลก่อน แล้วสร้าง case study, SEO, image prompt และ WordPress payload ให้หน่อย
```

## Quick Start

```bash
cd wordpress-portfolio-mcp-cowork
npm run smoke
npm run start
```

## MCP Config

ตัวอย่าง config สำหรับ Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "wordpress-portfolio-mcp-cowork": {
      "command": "node",
      "args": ["/absolute/path/wordpress-portfolio-mcp-cowork/src/server.js"],
      "env": {
        "PORTFOLIO_CASES_DIR": "/absolute/path/wordpress-portfolio-mcp-cowork/data/cases",
        "PORTFOLIO_BRAND_NAME": "Your Agency",
        "PORTFOLIO_BRAND_SITE": "https://example.com",
        "PORTFOLIO_DEFAULT_LANGUAGE": "th",
        "WORDPRESS_BASE_URL": "https://example.com",
        "WORDPRESS_USERNAME": "api-user",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx",
        "WORDPRESS_DEFAULT_STATUS": "draft"
      }
    }
  }
}
```

ถ้ายังไม่ใส่ `WORDPRESS_*` tools ที่ generate/validate/build payload ยังใช้ได้ แต่ `upload_wordpress_media` และ `create_wordpress_draft` จะยังไม่ยิงเว็บจริง

## Tools

- `list_portfolio_cases`
- `get_portfolio_case`
- `validate_portfolio_case`
- `generate_case_study`
- `generate_portfolio_seo`
- `generate_image_prompt`
- `build_wordpress_payload`
- `upload_wordpress_media`
- `create_wordpress_draft`

## Case Brief

เพิ่มไฟล์ JSON ใน `data/cases/` เช่น:

```json
{
  "id": "acme-website",
  "client": "ACME",
  "industry": "Retail",
  "projectType": "Website Development",
  "language": "th",
  "challenge": "เว็บไซต์เดิมแก้ไขยากและไม่รองรับ SEO",
  "solution": ["ออกแบบ UX/UI ใหม่", "พัฒนา WordPress", "ตั้งค่า technical SEO"],
  "results": ["ทีมแก้ไขข้อมูลเองได้", "รองรับ landing page สำหรับแคมเปญ"],
  "metrics": [{ "label": "Speed", "before": "Slow", "after": "Optimized", "change": "Improved" }],
  "services": ["UX/UI", "WordPress", "SEO"],
  "keywords": ["WordPress", "portfolio case study"],
  "images": [{ "path": "./assets/acme-cover.jpg", "alt": "ACME website case study" }],
  "approvalStatus": "draft"
}
```

Required fields:

- `id`
- `client`
- `industry`
- `projectType`
- `challenge`
- `solution`
- `results`

## WordPress Setup

1. เข้า WordPress Admin
2. ไปที่ Users > Profile
3. สร้าง Application Password
4. ใส่ค่าใน MCP env
5. เรียก `create_wordpress_draft`

ค่า default คือ `draft` เพื่อให้ทีมตรวจเนื้อหา SEO และรูปก่อน publish

## Recommended Team Workflow

1. ให้ทีมกรอก case brief เป็น JSON หรือให้ระบบ intake แปลงเป็น JSON
2. เรียก `validate_portfolio_case`
3. เรียก `generate_case_study` และ `generate_portfolio_seo`
4. เรียก `generate_image_prompt` แล้วให้ทีมสร้าง/ตรวจรูป
5. อัปโหลดรูปด้วย `upload_wordpress_media`
6. สร้าง draft ด้วย `create_wordpress_draft`
