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
HISTORICAL_INBOUND_SKIP_THRESHOLD=3
AUTO_MUTE_AFTER_SCREENING=true

LEAD_EXPORT_WEBHOOK_URL=
TAKEOVER_ALERT_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_MESSAGE_THREAD_ID=

META_DATASET_ID=
META_CAPI_TOKEN=
META_GRAPH_API_VERSION=v23.0
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

如果你不想“筛选完自动静音”，可以把：

- `AUTO_MUTE_AFTER_SCREENING=false`

## 导出记录格式

无论有没有外部 webhook，程序都会把导出结果写到：

- `data/exports.ndjson`

每条记录都会带这些核心字段：

- `wa_id`
- `profile_name`
- `language`
- `country_guess`
- `buyer_type`
- `lead_status`
- `routing_bucket`
- `decision_reason`
- `first_3_messages`

如果配置了 `LEAD_EXPORT_WEBHOOK_URL`，同一份 JSON 也会被 `POST` 到那个地址。

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
