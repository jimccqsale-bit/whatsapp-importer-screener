# WhatsApp Importer Screener V2

这是按 `Meta Click-to-WhatsApp -> WhatsApp Cloud API -> AI/规则筛选 -> 导出 -> Meta 回传` 思路整理过的 `Node.js` 版本。

## 这版已经对齐的流程

1. 接收 `WhatsApp Cloud API` webhook
2. 按 `区号 + 文本脚本` 初判语言
3. 用 `规则 + Claude` 在最多 `3` 条客户消息内判断
   - `importer`
   - `non_importer`
   - 内部保留 `unknown`，但超时会路由到 `non_importer`
4. 一旦判定完成，机器人停止继续聊天
5. 已经过筛选的联系人后续自动静音，不再重复进入机器人流程
6. 历史入站消息达到阈值的联系人可自动旁路，避免误触达老客或长聊联系人
7. `importer`
   - 发接管提示
   - 触发本地通知或 webhook 通知
   - 写入筛选日志 / 导出日志
   - 可选回传 `Meta Dataset / CAPI`
8. `non_importer`
   - 发结束语
   - 写入筛选日志 / 导出日志
   - 可选回传 `Meta Dataset / CAPI`

## 当前没有内置的东西

- 不直接写 Google Sheets API
- 不直接写 HubSpot / CRM SDK
- 不自动建 Meta 广告

这版通过 `LEAD_EXPORT_WEBHOOK_URL` 把结构化线索推给外部：

- Google Apps Script
- n8n
- Make
- 自己的 CRM webhook

## 目录

- [server.js](/Users/a93775/Documents/Playground/whatsapp_ai_workflow/free_local_rule_based/server.js)
- [.env.example](/Users/a93775/Documents/Playground/whatsapp_ai_workflow/free_local_rule_based/.env.example)
- [data/](/Users/a93775/Documents/Playground/whatsapp_ai_workflow/free_local_rule_based/data)

## 关键环境变量

```env
PORT=8787
VERIFY_TOKEN=replace_with_your_webhook_verify_token
WHATSAPP_ACCESS_TOKEN=replace_with_your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=replace_with_your_phone_number_id
GRAPH_API_VERSION=v23.0
AUTOMATION_PAUSED=true

AI_PROVIDER=claude
ANTHROPIC_API_KEY=replace_with_your_anthropic_api_key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

MAX_SCREENING_INBOUND_MESSAGES=3
MAX_SCREENING_PROMPTS=2
ENABLE_CATALOG_AUTOSEND=false
SEND_CATALOG_ON_FIRST_REPLY=false
ENABLE_CONTACT_CARD_AUTOSEND=false
CONTACT_CARD_FORMATTED_NAME=
CONTACT_CARD_FIRST_NAME=
CONTACT_CARD_LAST_NAME=
CONTACT_CARD_COMPANY=
CONTACT_CARD_TITLE=
CONTACT_CARD_PHONE=
CONTACT_CARD_PHONE_TYPE=WORK
CONTACT_CARD_WA_ID=
CONTACT_CARD_EMAIL=
CONTACT_CARD_URL=
HISTORICAL_INBOUND_SKIP_THRESHOLD=3
AUTO_MUTE_AFTER_SCREENING=true
ONLY_PROCESS_AD_REFERRAL_LEADS=false

LEAD_EXPORT_WEBHOOK_URL=
TAKEOVER_ALERT_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_MESSAGE_THREAD_ID=

META_DATASET_ID=
META_CAPI_TOKEN=
META_GRAPH_API_VERSION=v23.0
ADMIN_OVERRIDE_TOKEN=
```

## 本地启动

```bash
cp .env.example .env
node server.js
```

启动后会监听：

- `GET /health`
- `GET /webhook`
- `POST /webhook`
- `GET /admin/lead-override`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）
- `POST /admin/lead-override`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）
- `GET /admin/lead-history`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）
- `POST /admin/lead-history/search`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）
- `GET /admin/lead-table`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）
- `POST /admin/lead-table/search`（仅在配置 `ADMIN_OVERRIDE_TOKEN` 后启用）

默认 `AUTOMATION_PAUSED=true`。

- 这表示 webhook 会收到并确认请求，但不会处理，也不会自动发消息
- 只有你明确把 `AUTOMATION_PAUSED=false`，才会真正进入自动筛选/自动回复流程

## Railway 部署

这份目录已经适合直接作为独立仓库部署到 Railway。

推荐步骤：

1. 把这个目录单独推到 GitHub
2. Railway 选择 `GitHub Repository`
3. 选这个仓库
4. 在 Railway `Variables` 里填 `.env` 里的值
5. 至少设置 `EXISTING_CUSTOMER_WA_IDS`，把绝不能触达的老客号码以逗号分隔方式放进去
6. 如果要保留筛选后自动静音名单和本地日志，给 `data/` 挂 `Volume`
7. 准备真正上线前，再把 `AUTOMATION_PAUSED=false`

## 免打扰规则

默认会旁路自动回复的联系人包括：

- `EXISTING_CUSTOMER_WA_IDS` 或 `existing-customers.txt` 里的号码
- 已经完成过筛选的联系人
- 历史入站消息数达到 `HISTORICAL_INBOUND_SKIP_THRESHOLD` 的联系人

如果你复用同一个 WhatsApp 号码，同时又有很多老客户，建议额外打开：

- `ONLY_PROCESS_AD_REFERRAL_LEADS=true`

打开后，只有首条入站里带 `WhatsApp Click-to-WhatsApp / referral` 广告来源信息的联系人才会进入自动筛选。
普通自然消息、老客户回访、非广告来源的新消息会直接旁路，不会触发机器人自动回复。

如果你不想“筛选完自动静音”，可以把：

- `AUTO_MUTE_AFTER_SCREENING=false`

## 自动发目录 / 名片

如果你希望机器人在首条自动回复后立刻再发目录链接，可以打开：

- `SEND_CATALOG_ON_FIRST_REPLY=true`

如果你希望机器人自动发 WhatsApp 联系人名片，可以打开：

- `ENABLE_CONTACT_CARD_AUTOSEND=true`

然后至少补这几个变量：

- `CONTACT_CARD_FORMATTED_NAME`
- `CONTACT_CARD_FIRST_NAME`
- `CONTACT_CARD_PHONE`

可选补充：

- `CONTACT_CARD_LAST_NAME`
- `CONTACT_CARD_COMPANY`
- `CONTACT_CARD_TITLE`
- `CONTACT_CARD_WA_ID`
- `CONTACT_CARD_EMAIL`
- `CONTACT_CARD_URL`

当前实现说明：

- 目录是以文本链接形式发送
- 名片是通过 WhatsApp `contacts` 消息类型发送
- 两个功能默认关闭，不改变量不会影响现有流程

## 手动改判

如果系统把某个联系人判错了，你可以手动改判，不用直接改 Railway volume 文件。

先配置：

- `ADMIN_OVERRIDE_TOKEN`

然后打开：

- `/admin/lead-override`

例如你的 Railway 域名是：

- `https://whatsapp-importer-screener-production.up.railway.app/admin/lead-override`

这个页面可以让你输入：

- `wa_id`
- `lead_status`（`qualified` / `low_quality`）
- `buyer_type`
- `decision_reason`
- `language`
- `country_guess`
- `profile_name`
- `company_name`
- `note`

提交后会自动做这些事：

- 更新 `lead-state.json`
- 把结果写入 `screened-leads.ndjson`
- 写入 `exports.ndjson`
- 按最终状态补发对应的 Meta 事件
- 额外写入 `manual-overrides.ndjson`

说明：

- 改成 `qualified` 时，会补写合格客户日志
- 这个手动改判不会再自动给客户补发 WhatsApp 话术
- 这个入口默认关闭，只有设置了 `ADMIN_OVERRIDE_TOKEN` 才能访问

## 历史查询页

如果你想查以前的记录，不要只搜 Railway 的 Deploy Logs。更稳的是用历史查询页直接看 `/data/` 里的结构化记录。

打开：

- `/admin/lead-history`

例如：

- `https://whatsapp-importer-screener-production.up.railway.app/admin/lead-history`

你可以按这些条件查询：

- `wa_id`
- `lead_status`
- `limit`

页面会显示这些来源：

- `exports`
- `meta_events`
- `screened_leads`
- `manual_overrides`
- 当前 `lead-state.json` 里的状态快照

适合查：

- 以前哪些人被判成 `low_quality`
- 某个号码有没有被回传 `NonImporterLead` / `QualifiedLead`
- 某个号码有没有被手动改判过
- 当前系统里这个号码的状态到底是什么

## 总表页

如果你不想先查询号码，想直接看全部客户的最新列表，可以打开：

- `/admin/lead-table`

例如：

- `https://whatsapp-importer-screener-production.up.railway.app/admin/lead-table`

这个页面默认按最新时间列出每个 `wa_id` 的最新一条记录，并附带：

- `lead_status`
- `buyer_type`
- `profile_name`
- `company_name`
- `decision_reason`
- 最新 Meta 事件名和状态
- 最近一次手动改判时间
- 前 3 条客户消息摘要
- 未完成筛选、还没有导出记录的 `unclassified` 客户

适合用来：

- 直接浏览最近全部线索
- 筛选 `qualified` / `low_quality`
- 筛选 `unclassified`
- 按 `buyer_type` 看名单
- 快速判断哪些线索已经回传、哪些改判过

这个总表页里还可以直接做手动改判：

- 每行可直接选择 `qualified` / `low_quality`
- 每行可直接调整 `buyer_type`
- 点击 `Apply` 后会立刻调用手动改判接口

## 导出记录格式

无论有没有外部 webhook，程序都会把导出结果写到：

- `data/exports.ndjson`

每条记录都会带这些核心字段：

- `wa_id`
- `profile_name`
- `language`
- `country_guess`
- `lead_source`
- `referral_source_id`
- `ctwa_clid`
- `buyer_type`
- `lead_status`
- `routing_bucket`
- `decision_reason`
- `first_3_messages`

如果配置了 `LEAD_EXPORT_WEBHOOK_URL`，同一份 JSON 也会被 `POST` 到那个地址。

如果你想直接拿两张给 `Facebook / Meta` 用的表，可以执行：

```bash
cd /Users/a93775/Documents/Playground/whatsapp_ai_workflow/free_local_rule_based
npm run export:tables
```

生成结果会放在：

- `data/facebook-exports/qualified-leads.csv`
- `data/facebook-exports/non-qualified-leads.csv`
- `data/facebook-exports/summary.json`

规则是：

- `qualified-leads.csv`：只保留 `lead_status=qualified`
- `non-qualified-leads.csv`：只保留 `lead_status=low_quality`
- 同一个 `wa_id` 如果重复出现，只保留最新一条

## 接管通知

`importer` 触发后：

- 本机会弹系统通知
- 如果配置了 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID`，会给你的 Telegram 发一条“新精准客户需要接管”的提醒
- 如果你用的是 Telegram 群组话题，还可以额外配置 `TELEGRAM_MESSAGE_THREAD_ID`
- 如果配置了 `TAKEOVER_ALERT_WEBHOOK_URL`，还会额外发 webhook

Telegram 提醒内容会包含：

- 联系人名 / WhatsApp 号码
- 语言和国家猜测
- buyer type
- 最新一条客户消息
- 前 3 条客户消息摘要

## 建议的下一步

1. 接一个 `Google Apps Script` webhook，把导出写进 Google Sheets
2. 接一个 `Telegram / Slack / ntfy` webhook，做 importer 接管提醒
3. 补广告来源字段，再把高低质量名单回传 Meta
