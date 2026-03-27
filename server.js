const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { URL } = require("url");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v23.0";
const AUTOMATION_PAUSED = !/^(0|false|no)$/i.test(
  process.env.AUTOMATION_PAUSED || process.env.EMERGENCY_STOP || "true"
);

const COMPANY_DISPLAY_NAME =
  process.env.COMPANY_DISPLAY_NAME || "YZ Spare Parts";
const SALES_CONTACT_NAME = process.env.SALES_CONTACT_NAME || "Jim";
const CATALOG_URL =
  process.env.CATALOG_URL || "https://yzspareparts.com/catalog/";
const CATALOG_DELAY_MS = Number(process.env.CATALOG_DELAY_MS || 8000);
const IMPORTER_DELAY_MS = Number(process.env.IMPORTER_DELAY_MS || 12000);
const MAX_SCREENING_INBOUND_MESSAGES = Number(
  process.env.MAX_SCREENING_INBOUND_MESSAGES || 3
);
const MAX_SCREENING_PROMPTS = Number(
  process.env.MAX_SCREENING_PROMPTS || 2
);
const ENABLE_CATALOG_AUTOSEND = /^(1|true|yes)$/i.test(
  process.env.ENABLE_CATALOG_AUTOSEND || "false"
);

const AI_PROVIDER = process.env.AI_PROVIDER || "claude";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION =
  process.env.ANTHROPIC_VERSION || "2023-06-01";
const ANTHROPIC_TIMEOUT_MS = Number(
  process.env.ANTHROPIC_TIMEOUT_MS || 20000
);

const LEAD_LOG_PATH =
  process.env.LEAD_LOG_PATH ||
  path.join(__dirname, "data", "leads.ndjson");
const HANDOFF_LOG_PATH =
  process.env.HANDOFF_LOG_PATH ||
  path.join(__dirname, "data", "handoffs.ndjson");
const SCREENED_LOG_PATH =
  process.env.SCREENED_LOG_PATH ||
  path.join(__dirname, "data", "screened-leads.ndjson");
const META_EVENT_LOG_PATH =
  process.env.META_EVENT_LOG_PATH ||
  path.join(__dirname, "data", "meta-events.ndjson");
const EXPORT_LOG_PATH =
  process.env.EXPORT_LOG_PATH ||
  path.join(__dirname, "data", "exports.ndjson");
const STATE_PATH =
  process.env.STATE_PATH || path.join(__dirname, "data", "lead-state.json");
const EXISTING_CUSTOMER_LIST_PATH =
  process.env.EXISTING_CUSTOMER_LIST_PATH ||
  path.join(__dirname, "data", "existing-customers.txt");
const AUTO_MUTED_CONTACTS_PATH =
  process.env.AUTO_MUTED_CONTACTS_PATH ||
  path.join(__dirname, "data", "auto-muted-contacts.txt");
const LEAD_EXPORT_WEBHOOK_URL = process.env.LEAD_EXPORT_WEBHOOK_URL || "";
const TAKEOVER_ALERT_WEBHOOK_URL =
  process.env.TAKEOVER_ALERT_WEBHOOK_URL || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TELEGRAM_MESSAGE_THREAD_ID =
  process.env.TELEGRAM_MESSAGE_THREAD_ID || "";
const HISTORICAL_INBOUND_SKIP_THRESHOLD = Number(
  process.env.HISTORICAL_INBOUND_SKIP_THRESHOLD || 3
);
const AUTO_MUTE_AFTER_SCREENING = !/^(0|false|no)$/i.test(
  process.env.AUTO_MUTE_AFTER_SCREENING || "true"
);

const META_DATASET_ID = process.env.META_DATASET_ID || "";
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || "";
const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v23.0";
const META_TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || "";
const META_QUALIFIED_EVENT_NAME =
  process.env.META_QUALIFIED_EVENT_NAME || "QualifiedLead";
const META_DISQUALIFIED_EVENT_NAME =
  process.env.META_DISQUALIFIED_EVENT_NAME || "NonImporterLead";

const ENABLE_LOCAL_NOTIFICATIONS = !/^(0|false|no)$/i.test(
  process.env.ENABLE_LOCAL_NOTIFICATIONS || "true"
);

ensureDir(path.dirname(LEAD_LOG_PATH));
ensureDir(path.dirname(HANDOFF_LOG_PATH));
ensureDir(path.dirname(SCREENED_LOG_PATH));
ensureDir(path.dirname(META_EVENT_LOG_PATH));
ensureDir(path.dirname(EXPORT_LOG_PATH));
ensureDir(path.dirname(STATE_PATH));
ensureDir(path.dirname(EXISTING_CUSTOMER_LIST_PATH));
ensureDir(path.dirname(AUTO_MUTED_CONTACTS_PATH));

const supportedLanguages = new Set([
  "ar",
  "en",
  "ru",
  "kk",
  "ky",
  "es",
  "pt",
  "fr",
  "zh"
]);

const supportedBuyerTypes = new Set([
  "importer",
  "wholesaler",
  "distributor",
  "workshop",
  "retail",
  "non_importer",
  "unknown"
]);

const supportedLeadStatuses = new Set([
  "qualified",
  "need_more_info",
  "low_quality"
]);

const languageRules = [
  ["996", "Kyrgyzstan", "ky"],
  ["971", "United Arab Emirates", "ar"],
  ["966", "Saudi Arabia", "ar"],
  ["964", "Iraq", "ar"],
  ["974", "Qatar", "ar"],
  ["973", "Bahrain", "ar"],
  ["968", "Oman", "ar"],
  ["965", "Kuwait", "ar"],
  ["962", "Jordan", "ar"],
  ["961", "Lebanon", "ar"],
  ["218", "Libya", "ar"],
  ["216", "Tunisia", "ar"],
  ["213", "Algeria", "ar"],
  ["212", "Morocco", "ar"],
  ["20", "Egypt", "ar"],
  ["55", "Brazil", "pt"],
  ["54", "Argentina", "es"],
  ["56", "Chile", "es"],
  ["57", "Colombia", "es"],
  ["58", "Venezuela", "es"],
  ["51", "Peru", "es"],
  ["52", "Mexico", "es"],
  ["593", "Ecuador", "es"],
  ["598", "Uruguay", "es"],
  ["595", "Paraguay", "es"],
  ["591", "Bolivia", "es"],
  ["34", "Spain", "es"],
  ["237", "Cameroon", "fr"],
  ["223", "Mali", "fr"],
  ["33", "France", "fr"],
  ["86", "China", "zh"],
  ["44", "United Kingdom", "en"],
  ["1", "United States/Canada", "en"]
];

const templates = {
  ar: {
    intro:
      `مرحبا، أنا ${SALES_CONTACT_NAME} من ${COMPANY_DISPLAY_NAME}. لتوجيهك بشكل صحيح، هل أنت مستورد؟`,
    clarify:
      "للتأكيد، هل تستورد لإعادة البيع التجاري أم تشتري للاستخدام المحلي أو الشخصي؟",
    catalog: `هذا هو كتالوجنا وموقعنا الإلكتروني: ${CATALOG_URL}`,
    importerQuestion: "هل أنت مستورد؟",
    handoff:
      `شكرا لتأكيدك. سيتولى ${SALES_CONTACT_NAME} متابعة هذه المحادثة معك الآن.`,
    nonImporter:
      "شكرا على التوضيح. حاليا نحن نعطي الأولوية لطلبات المستوردين. إذا كنت مستوردا مستقبلا، تواصل معنا في أي وقت."
  },
  en: {
    intro:
      `Hello, this is ${SALES_CONTACT_NAME} from ${COMPANY_DISPLAY_NAME}. To route you correctly, may I confirm if you are an importer?`,
    clarify:
      "To confirm, are you importing for resale/business, or buying for local retail or personal use?",
    catalog: `Here is our product catalog and website: ${CATALOG_URL}`,
    importerQuestion: "May I ask if you are an importer?",
    handoff:
      `Thank you for confirming. ${SALES_CONTACT_NAME} will take over this chat from here.`,
    nonImporter:
      "Thank you for clarifying. At the moment we mainly work with importers. If you become an importer later, feel free to contact us anytime."
  },
  ru: {
    intro:
      `Здравствуйте, это ${SALES_CONTACT_NAME} из ${COMPANY_DISPLAY_NAME}. Чтобы правильно направить ваш запрос, могу уточнить, вы импортер?`,
    clarify:
      "Для подтверждения: вы импортируете товар для перепродажи и бизнеса или покупаете для местной розницы либо личного использования?",
    catalog: `Вот наш каталог и сайт: ${CATALOG_URL}`,
    importerQuestion: "Могу уточнить, вы импортер?",
    handoff:
      `Спасибо за подтверждение. ${SALES_CONTACT_NAME} дальше продолжит общение с вами лично.`,
    nonImporter:
      "Спасибо за уточнение. Сейчас мы в основном работаем с импортерами. Если в будущем вы будете импортером, свяжитесь с нами в любое время."
  },
  kk: {
    intro:
      `Сәлеметсіз бе, мен ${COMPANY_DISPLAY_NAME} компаниясынан ${SALES_CONTACT_NAME} боламын. Дұрыс бағыттау үшін, сіз импорттаушысыз ба?`,
    clarify:
      "Нақтылау үшін: сіз тауарды қайта сату және бизнес үшін импорттайсыз ба, әлде жергілікті бөлшек саудаға не жеке пайдалануға аласыз ба?",
    catalog: `Міне, біздің каталог пен сайт: ${CATALOG_URL}`,
    importerQuestion: "Сіз импорттаушысыз ба?",
    handoff:
      `Рақмет, растадыңыз. Енді ${SALES_CONTACT_NAME} бұл әңгімені өзі жалғастырады.`,
    nonImporter:
      "Нақтылағаныңызға рақмет. Қазір біз негізінен импорттаушылармен жұмыс істейміз. Егер кейін импорттаушы болсаңыз, кез келген уақытта хабарласыңыз."
  },
  ky: {
    intro:
      `Салам, мен ${COMPANY_DISPLAY_NAME} компаниясынан ${SALES_CONTACT_NAME} болом. Туура багыттоо үчүн, сиз импорттоочусузбу?`,
    clarify:
      "Тактоо үчүн: товарды кайра сатуу жана бизнес үчүн импорттойсузбу, же жергиликтүү чекене же жеке колдонуу үчүн сатып аласызбы?",
    catalog: `Бул биздин каталог жана сайт: ${CATALOG_URL}`,
    importerQuestion: "Сиз импорттоочусузбу?",
    handoff:
      `Ырастаганыңыз үчүн рахмат. Эми ${SALES_CONTACT_NAME} бул маекти өзү улантат.`,
    nonImporter:
      "Тактаганыңыз үчүн рахмат. Азыр биз негизинен импорттоочулар менен иштейбиз. Эгер кийин импорттоочу болсоңуз, каалаган убакта жазыңыз."
  },
  es: {
    intro:
      `Hola, soy ${SALES_CONTACT_NAME} de ${COMPANY_DISPLAY_NAME}. Para dirigirle correctamente, puedo confirmar si usted es importador?`,
    clarify:
      "Para confirmar, usted importa para reventa y negocio, o compra para venta local o uso personal?",
    catalog: `Este es nuestro catálogo y sitio web: ${CATALOG_URL}`,
    importerQuestion: "Puedo confirmar si usted es importador?",
    handoff:
      `Gracias por confirmarlo. ${SALES_CONTACT_NAME} continuará este chat con usted directamente.`,
    nonImporter:
      "Gracias por aclararlo. En este momento trabajamos principalmente con importadores. Si en el futuro usted es importador, escríbanos cuando quiera."
  },
  pt: {
    intro:
      `Olá, aqui é ${SALES_CONTACT_NAME} da ${COMPANY_DISPLAY_NAME}. Para direcionar você corretamente, posso confirmar se você é importador?`,
    clarify:
      "Para confirmar, você importa para revenda e negócio, ou compra para varejo local ou uso pessoal?",
    catalog: `Aqui está o nosso catálogo e website: ${CATALOG_URL}`,
    importerQuestion: "Posso confirmar se você é importador?",
    handoff:
      `Obrigado por confirmar. ${SALES_CONTACT_NAME} vai assumir esta conversa a partir de agora.`,
    nonImporter:
      "Obrigado por esclarecer. Neste momento trabalhamos principalmente com importadores. Se no futuro você for importador, fale conosco quando quiser."
  },
  fr: {
    intro:
      `Bonjour, ici ${SALES_CONTACT_NAME} de ${COMPANY_DISPLAY_NAME}. Pour bien orienter votre demande, puis-je confirmer que vous êtes importateur ?`,
    clarify:
      "Pour confirmer, importez-vous pour la revente professionnelle ou achetez-vous pour la vente locale ou un usage personnel ?",
    catalog: `Voici notre catalogue et notre site web : ${CATALOG_URL}`,
    importerQuestion: "Puis-je confirmer que vous êtes importateur ?",
    handoff:
      `Merci pour votre confirmation. ${SALES_CONTACT_NAME} va reprendre cette conversation directement avec vous.`,
    nonImporter:
      "Merci pour votre précision. Pour le moment, nous travaillons principalement avec des importateurs. Si vous devenez importateur plus tard, contactez-nous à tout moment."
  },
  zh: {
    intro:
      `你好，我是${COMPANY_DISPLAY_NAME}的${SALES_CONTACT_NAME}。为了正确分配对接，请问您是进口商吗？`,
    clarify:
      "再确认一下，您是做进口转售/批发业务，还是本地零售或个人采购？",
    catalog: `这是我们的产品目录和官方网站：${CATALOG_URL}`,
    importerQuestion: "请问您是进口商吗？",
    handoff: `感谢确认，${SALES_CONTACT_NAME}会马上接手和您继续沟通。`,
    nonImporter:
      "感谢说明。我们目前主要优先对接进口商客户。如果您之后有进口需求，欢迎随时联系。"
  }
};

const leadState = loadState(STATE_PATH);
const existingCustomerWaIds = loadExistingCustomers(
  EXISTING_CUSTOMER_LIST_PATH,
  process.env.EXISTING_CUSTOMER_WA_IDS || ""
);
const autoMutedWaIds = loadWaIdList(
  AUTO_MUTED_CONTACTS_PATH,
  process.env.AUTO_MUTED_WA_IDS || ""
);
const historicalConversationWaIds = loadHistoricalConversationWaIds(
  LEAD_LOG_PATH,
  HISTORICAL_INBOUND_SKIP_THRESHOLD
);
const processedMessageIds = new Map();
const contactQueues = new Map();
const scheduledTimers = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "HEAD" && url.pathname === "/health") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "whatsapp-importer-screener",
        time: new Date().toISOString()
      });
    }

    if (req.method === "HEAD" && url.pathname === "/webhook") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/webhook") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(challenge || "");
        return;
      }

      if (!mode && !token && !challenge) {
        return json(res, 200, {
          ok: true,
          message: "Webhook endpoint is reachable"
        });
      }

      return json(res, 403, { error: "Invalid verification token" });
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      const body = await readJson(req);
      if (AUTOMATION_PAUSED) {
        console.warn("Automation paused: acknowledging webhook without processing.");
        return json(res, 200, { received: true, count: 0, paused: true });
      }
      const events = extractInboundMessages(body);

      for (const event of events) {
        await enqueueLeadEvent(event);
      }

      return json(res, 200, { received: true, count: events.length });
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`WhatsApp lead screener listening on http://localhost:${PORT}`);
  console.log("Webhook verify path: /webhook");
  if (AUTOMATION_PAUSED) {
    console.warn("WARNING: automation is paused; inbound webhooks will be acknowledged but ignored.");
  }
  if (existingCustomerWaIds.size === 0) {
    console.warn(
      "WARNING: no existing customer WhatsApp IDs loaded; old customers will not bypass auto-replies."
    );
  } else {
    console.log(
      `Loaded ${existingCustomerWaIds.size} existing customer WhatsApp IDs.`
    );
  }
  console.log(`Loaded ${autoMutedWaIds.size} auto-muted WhatsApp IDs.`);
  console.log(
    `Loaded ${historicalConversationWaIds.size} historical conversation WhatsApp IDs (threshold: ${HISTORICAL_INBOUND_SKIP_THRESHOLD}).`
  );
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function extractInboundMessages(payload) {
  const out = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      // In coexistence mode, Meta can send non-customer events such as
      // `smb_message_echoes` (messages manually sent from the Business app)
      // and `history`. We only want fresh inbound customer chat messages.
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      const profileName = contacts[0]?.profile?.name || "";
      const displayPhoneNumber = normalizePhoneIdentifier(
        value.metadata?.display_phone_number || ""
      );

      for (const message of messages) {
        if (!message.from) continue;

        const from = normalizePhoneIdentifier(message.from);

        // Ignore app-originated echoes and other non-inbound payloads.
        if (message.to || (displayPhoneNumber && from === displayPhoneNumber)) {
          continue;
        }

        out.push({
          kind: "inbound",
          messageId: String(message.id || ""),
          waId: String(message.from),
          profileName,
          type: message.type || "unknown",
          text: extractMessageText(message),
          hasImage: message.type === "image",
          hasDocument: message.type === "document"
        });
      }
    }
  }

  return out;
}

function normalizePhoneIdentifier(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function extractMessageText(message) {
  if (message.text?.body) return String(message.text.body).trim();
  if (message.image?.caption) return String(message.image.caption).trim();
  if (message.document?.caption) return String(message.document.caption).trim();
  if (message.video?.caption) return String(message.video.caption).trim();
  if (message.button?.text) return String(message.button.text).trim();
  if (message.interactive?.button_reply?.title) {
    return String(message.interactive.button_reply.title).trim();
  }
  if (message.interactive?.list_reply?.title) {
    return String(message.interactive.list_reply.title).trim();
  }
  return "";
}

async function enqueueLeadEvent(event) {
  const queueKey = normalizeWaId(event.waId);
  const previous = contactQueues.get(queueKey) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => processLeadEvent(event));

  contactQueues.set(queueKey, current);

  try {
    await current;
  } finally {
    if (contactQueues.get(queueKey) === current) {
      contactQueues.delete(queueKey);
    }
  }
}

async function processLeadEvent(event) {
  if (event.kind === "scheduled") {
    await processScheduledEvent(event);
    return;
  }

  if (isDuplicateMessage(event.messageId)) {
    console.log(`Skipping duplicate message ${event.messageId || "unknown"}`);
    return;
  }

  const previousState = sanitizeLeadState(
    leadState[event.waId] || createLeadState()
  );

  const bypassReason = getAutomationBypassReason(event.waId);

  if (bypassReason) {
    if (bypassReason === "existing_customer") {
      previousState.existingCustomer = true;
    }
    previousState.screeningComplete = true;
    previousState.lastInboundText = event.text || "";
    previousState.lastInboundMessageId = event.messageId || "";
    previousState.lastUpdatedAt = new Date().toISOString();
    leadState[event.waId] = previousState;
    saveState(STATE_PATH, leadState);

    appendLeadLog({
      updated_at: new Date().toISOString(),
      direction: "inbound",
      wa_id: event.waId,
      profile_name: event.profileName,
      country_guess: previousState.country || guessCountryAndLanguage(event.waId).country,
      language: previousState.language || guessCountryAndLanguage(event.waId).language,
      company_name: previousState.companyName || "",
      buyer_type: previousState.buyerType || "unknown",
      lead_status:
        bypassReason === "existing_customer"
          ? "existing_customer_skip"
          : "automation_bypass_skip",
      incoming_text: event.text,
      reply_text: "",
      reply_engine:
        bypassReason === "existing_customer"
          ? "skip_existing_customer"
          : `skip_${bypassReason}`
    });
    return;
  }

  if (previousState.screeningComplete) {
    previousState.lastInboundText = event.text || "";
    previousState.lastInboundMessageId = event.messageId || "";
    previousState.lastUpdatedAt = new Date().toISOString();
    leadState[event.waId] = previousState;
    saveState(STATE_PATH, leadState);

    appendLeadLog({
      updated_at: new Date().toISOString(),
      direction: "inbound",
      wa_id: event.waId,
      profile_name: event.profileName,
      country_guess: previousState.country || guessCountryAndLanguage(event.waId).country,
      language: previousState.language || guessCountryAndLanguage(event.waId).language,
      company_name: previousState.companyName || "",
      buyer_type: previousState.buyerType || "unknown",
      lead_status: previousState.lastLeadStatus || "screening_complete_skip",
      incoming_text: event.text,
      reply_text: "",
      reply_engine: "screening_complete_skip"
    });
    return;
  }

  const lead = await analyzeLead(event, previousState);

  lead.state.inboundCount = Number(previousState.inboundCount || 0) + 1;
  lead.state.lastInboundText = lead.text;
  lead.state.lastInboundMessageId = event.messageId || "";
  lead.state.lastUpdatedAt = new Date().toISOString();
  lead.state.profileName = lead.profileName;
  if (!lead.state.firstInboundText && lead.text) {
    lead.state.firstInboundText = lead.text;
  }
  lead.state.firstThreeInboundTexts = Array.isArray(previousState.firstThreeInboundTexts)
    ? previousState.firstThreeInboundTexts.slice(0, 3)
    : [];
  if (
    lead.text &&
    lead.state.firstThreeInboundTexts.length < MAX_SCREENING_INBOUND_MESSAGES
  ) {
    lead.state.firstThreeInboundTexts.push(lead.text);
  }

  appendLeadLog({
    updated_at: new Date().toISOString(),
    direction: "inbound",
    wa_id: lead.waId,
    profile_name: lead.profileName,
    country_guess: lead.countryGuess,
    language: lead.language,
    company_name: lead.companyName,
    buyer_type: lead.buyerType,
    lead_status: lead.leadStatus,
    incoming_text: lead.text,
    reply_text: "",
    reply_engine: lead.analysisEngine
  });

  // Persist the latest inbound-derived state before branching into follow-up
  // handlers. Otherwise helper functions that reload state from disk can
  // accidentally overwrite this turn's updated counters/message history.
  leadState[lead.waId] = sanitizeLeadState(lead.state);
  saveState(STATE_PATH, leadState);

  if (lead.leadStatus === "qualified") {
    await handleQualifiedLead(lead, previousState);
    return;
  }

  if (lead.leadStatus === "low_quality") {
    await handleDisqualifiedLead(lead, previousState);
    return;
  }

  if (!previousState.sequenceStartedAt) {
    await startLeadSequence(lead);
    return;
  }

  if (shouldRepeatImporterQuestion(lead, previousState)) {
    await sendImporterQuestionReminderStep(
      lead.waId,
      lead.language,
      "screening_importer_repeat"
    );
    return;
  }

  if (shouldForceScreeningDecision(lead.state)) {
    await handleTimedOutLead(lead, previousState);
    return;
  }

  await sendClarifyQuestionStep(lead.waId, lead.language, "screening_clarify");
}

async function processScheduledEvent(event) {
  if (!ENABLE_CATALOG_AUTOSEND) return;
  clearScheduledStep(event.waId, event.step);

  const state = sanitizeLeadState(leadState[event.waId] || createLeadState());
  if (state.screeningComplete || state.existingCustomer) return;

  const guess = guessCountryAndLanguage(event.waId);
  const language = state.language || guess.language;

  if (event.step === "catalog") {
    if (!state.catalogSentAt) {
      await sendCatalogStep(event.waId, language, "scheduled_catalog");
    }
    return;
  }

  if (event.step === "importer") {
    if (!state.importerAskedAt && state.buyerType === "unknown") {
      await sendImporterQuestionStep(event.waId, language, "scheduled_importer_question");
    }
  }
}

async function analyzeLead(event, previousState = createLeadState()) {
  const heuristicLead = analyzeHeuristically(event, previousState);
  const aiLead =
    AI_PROVIDER === "claude" && ANTHROPIC_API_KEY
      ? await analyzeWithClaude(event, previousState, heuristicLead)
      : null;

  const aiBuyerType = normalizeBuyerType(aiLead?.buyer_type);
  const language =
    normalizeLanguage(aiLead?.language) || heuristicLead.language;
  const buyerType =
    aiBuyerType && aiBuyerType !== "unknown"
      ? aiBuyerType
      : heuristicLead.buyerType;
  const companyName =
    clampText(aiLead?.company_name, 80) || heuristicLead.companyName;
  const countryGuess =
    clampText(aiLead?.country, 60) || heuristicLead.countryGuess;
  const wantsCatalog =
    typeof aiLead?.wants_catalog === "boolean"
      ? aiLead.wants_catalog
      : heuristicLead.wantsCatalog;
  const askedIdentity =
    typeof aiLead?.asked_identity === "boolean"
      ? aiLead.asked_identity
      : heuristicLead.askedIdentity;

  const state = {
    ...createLeadState(),
    ...previousState,
    language,
    country: countryGuess,
    companyName,
    buyerType
  };

  return {
    waId: event.waId,
    profileName: event.profileName,
    countryGuess,
    language,
    intent: heuristicLead.intent,
    companyName,
    buyerType,
    leadStatus: classifyLead({ buyerType }),
    wantsCatalog,
    askedIdentity,
    text: event.text,
    analysisEngine: aiLead ? "claude_api" : "heuristics",
    state
  };
}

function analyzeHeuristically(event, previousState = createLeadState()) {
  const prefixGuess = guessCountryAndLanguage(event.waId);
  const language = detectLanguage(
    event.text,
    previousState.language || prefixGuess.language,
    prefixGuess.country
  );
  const intent = detectIntent(event.text);
  const lastScreeningPromptKey =
    previousState.lastScreeningPromptKey ||
    (previousState.importerAskedAt ? "importer_question" : "");
  const buyerType =
    detectBuyerType(event.text, lastScreeningPromptKey) ||
    previousState.buyerType;
  const companyName = detectCompanyName(event.text) || previousState.companyName;
  const countryGuess =
    detectCountry(event.text) || previousState.country || prefixGuess.country;
  const wantsCatalog = detectCatalogRequest(event.text);
  const askedIdentity = intent === "ask_identity";

  return {
    language,
    intent,
    buyerType,
    companyName,
    countryGuess,
    wantsCatalog,
    askedIdentity
  };
}

async function analyzeWithClaude(event, previousState, heuristicLead) {
  const prompt = [
    "You are a classifier for a WhatsApp import-lead screener.",
    "Return JSON only. No markdown. No commentary.",
    "Supported languages: ar,en,ru,kk,ky,es,pt,fr,zh.",
    "Classify the customer's buyer_type using only these values:",
    "importer, wholesaler, distributor, workshop, retail, non_importer, unknown",
    "Rules:",
    "- importer when the customer clearly says they are an importer or answers yes to an importer question.",
    "- non_importer when they clearly answer no to the importer question or clearly say they are not an importer.",
    "- If the customer only sends a greeting or small talk such as hello or how are you, and they do not answer the screening question, keep buyer_type as unknown.",
    "- If the last screening prompt asked whether they buy for resale/business vs local retail/personal use, then answers like business, commercial, resale, wholesale, or trading mean importer.",
    "- If the last screening prompt asked whether they buy for resale/business vs local retail/personal use, then answers like retail, local retail, personal use, or self-use mean non_importer.",
    "- If the last screening prompt asked whether they buy for resale/business vs local retail/personal use, then a bare affirmative such as yes, sure, of course, or certainly should not be treated as non_importer. Prefer importer when the earlier context was confirming importer status.",
    "- The intro message that asks whether they are an importer counts as an importer question.",
    "- If unclear, keep unknown.",
    "- wants_catalog should be true if the customer asks for a catalog, brochure, website, or product list.",
    "- asked_identity should be true if the customer asks who you are or what company this is.",
    "- company_name should be empty unless explicitly stated.",
    "- Prefer the customer's actual message language over phone-prefix language.",
    "",
    JSON.stringify(
      {
        phone_prefix_guess: {
          country: heuristicLead.countryGuess,
          language: heuristicLead.language
        },
        previous_state: {
          language: previousState.language || "",
          buyer_type: previousState.buyerType || "unknown",
          importer_question_already_sent: Boolean(previousState.importerAskedAt),
          last_screening_prompt_key: previousState.lastScreeningPromptKey || ""
        },
        inbound: {
          profile_name: event.profileName || "",
          text: event.text || "",
          has_image: Boolean(event.hasImage),
          has_document: Boolean(event.hasDocument)
        }
      },
      null,
      2
    ),
    "",
    "Return exactly this shape:",
    JSON.stringify(
      {
        language: "en",
        country: "United Kingdom",
        buyer_type: "unknown",
        company_name: "",
        wants_catalog: true,
        asked_identity: false
      },
      null,
      2
    )
  ].join("\n");

  try {
    return await runClaudeJson(prompt);
  } catch (error) {
    console.error("Claude analysis failed, falling back to heuristics:", error.message);
    return null;
  }
}

async function runClaudeJson(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 240,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }),
    signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude request failed: ${response.status} ${errorText}`);
  }

  const body = await response.json();
  const rawText = (body.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();

  return parseJsonObject(rawText);
}

function parseJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw error;
  }
}

async function startLeadSequence(lead) {
  const state = sanitizeLeadState(leadState[lead.waId] || lead.state);
  const t = getTemplates(lead.language);

  if (!state.sentIntroAt) {
    await sendAndRecordMessage(lead.waId, t.intro, {
      direction: "outbound",
      reply_engine: "sequence_intro",
      language: lead.language,
      country_guess: lead.countryGuess,
      company_name: lead.companyName,
      buyer_type: lead.buyerType,
      lead_status: lead.leadStatus,
      profile_name: lead.profileName
    });
    state.sentIntroAt = new Date().toISOString();
    state.sequenceStartedAt = state.sequenceStartedAt || state.sentIntroAt;
    // The intro doubles as the first importer question, so plain "yes" responses
    // should be interpreted in that context.
    state.importerAskedAt = state.importerAskedAt || state.sentIntroAt;
    state.lastScreeningPromptKey = "importer_question";
    state.lastBotReply = t.intro;
    state.screeningPromptCount = 1;
  }

  leadState[lead.waId] = state;
  saveState(STATE_PATH, leadState);

  if (ENABLE_CATALOG_AUTOSEND && lead.wantsCatalog) {
    if (!state.catalogSentAt) {
      await sendCatalogStep(lead.waId, lead.language, "catalog_requested_initial");
    }
    if (!state.importerAskedAt) {
      scheduleStep(lead.waId, "importer", IMPORTER_DELAY_MS);
    }
  }
}

async function sendCatalogStep(waId, language, reason) {
  const state = sanitizeLeadState(leadState[waId] || createLeadState());
  if (state.screeningComplete || state.existingCustomer || state.catalogSentAt) {
    return;
  }

  const t = getTemplates(language || state.language || "en");
  await sendAndRecordMessage(waId, t.catalog, {
    direction: "outbound",
    reply_engine: reason,
    language: language || state.language || "en",
    country_guess: state.country || guessCountryAndLanguage(waId).country,
    company_name: state.companyName || "",
    buyer_type: state.buyerType || "unknown",
    lead_status: state.lastLeadStatus || "need_more_info",
    profile_name: state.profileName || ""
  });

  state.catalogSentAt = new Date().toISOString();
  state.lastBotReply = t.catalog;
  state.sequenceStartedAt = state.sequenceStartedAt || state.catalogSentAt;
  leadState[waId] = state;
  saveState(STATE_PATH, leadState);
}

async function sendImporterQuestionStep(waId, language, reason) {
  const state = sanitizeLeadState(leadState[waId] || createLeadState());
  if (
    state.screeningComplete ||
    state.existingCustomer ||
    state.importerAskedAt ||
    state.buyerType !== "unknown"
  ) {
    return;
  }

  const t = getTemplates(language || state.language || "en");
  await sendAndRecordMessage(waId, t.importerQuestion, {
    direction: "outbound",
    reply_engine: reason,
    language: language || state.language || "en",
    country_guess: state.country || guessCountryAndLanguage(waId).country,
    company_name: state.companyName || "",
    buyer_type: state.buyerType || "unknown",
    lead_status: "need_more_info",
    profile_name: state.profileName || ""
  });

  state.importerAskedAt = new Date().toISOString();
  state.lastScreeningPromptKey = "importer_question";
  state.lastBotReply = t.importerQuestion;
  state.lastLeadStatus = "need_more_info";
  state.screeningPromptCount = Math.max(
    Number(state.screeningPromptCount || 0),
    1
  );
  leadState[waId] = state;
  saveState(STATE_PATH, leadState);
}

async function sendImporterQuestionReminderStep(waId, language, reason) {
  const state = sanitizeLeadState(leadState[waId] || createLeadState());
  if (
    state.screeningComplete ||
    state.existingCustomer ||
    Number(state.screeningPromptCount || 0) >= MAX_SCREENING_PROMPTS
  ) {
    return;
  }

  const t = getTemplates(language || state.language || "en");
  await sendAndRecordMessage(waId, t.importerQuestion, {
    direction: "outbound",
    reply_engine: reason,
    language: language || state.language || "en",
    country_guess: state.country || guessCountryAndLanguage(waId).country,
    company_name: state.companyName || "",
    buyer_type: state.buyerType || "unknown",
    lead_status: "need_more_info",
    profile_name: state.profileName || ""
  });

  state.importerAskedAt = state.importerAskedAt || new Date().toISOString();
  state.lastImporterReminderAt = new Date().toISOString();
  state.lastScreeningPromptKey = "importer_question";
  state.lastBotReply = t.importerQuestion;
  state.lastLeadStatus = "need_more_info";
  state.screeningPromptCount = Number(state.screeningPromptCount || 0) + 1;
  leadState[waId] = state;
  saveState(STATE_PATH, leadState);
}

async function sendClarifyQuestionStep(waId, language, reason) {
  const state = sanitizeLeadState(leadState[waId] || createLeadState());
  if (
    state.screeningComplete ||
    state.existingCustomer ||
    Number(state.screeningPromptCount || 0) >= MAX_SCREENING_PROMPTS
  ) {
    return;
  }

  const t = getTemplates(language || state.language || "en");
  await sendAndRecordMessage(waId, t.clarify || t.importerQuestion, {
    direction: "outbound",
    reply_engine: reason,
    language: language || state.language || "en",
    country_guess: state.country || guessCountryAndLanguage(waId).country,
    company_name: state.companyName || "",
    buyer_type: state.buyerType || "unknown",
    lead_status: "need_more_info",
    profile_name: state.profileName || ""
  });

  state.lastBotReply = t.clarify || t.importerQuestion;
  state.lastScreeningPromptKey = "clarify";
  state.lastLeadStatus = "need_more_info";
  state.screeningPromptCount = Number(state.screeningPromptCount || 0) + 1;
  leadState[waId] = state;
  saveState(STATE_PATH, leadState);
}

async function handleQualifiedLead(lead, previousState) {
  cancelContactTimers(lead.waId);

  const state = sanitizeLeadState(lead.state);
  const t = getTemplates(lead.language);

  await sendAndRecordMessage(lead.waId, t.handoff, {
    direction: "outbound",
    reply_engine: "qualified_handoff",
    language: lead.language,
    country_guess: lead.countryGuess,
    company_name: lead.companyName,
    buyer_type: lead.buyerType,
    lead_status: "qualified",
    profile_name: lead.profileName
  });

  state.buyerType = lead.buyerType;
  state.language = lead.language;
  state.country = lead.countryGuess;
  state.companyName = lead.companyName;
  state.screeningComplete = true;
  state.notifiedQualified = true;
  state.lastLeadStatus = "qualified";
  state.lastBotReply = t.handoff;
  state.lastUpdatedAt = new Date().toISOString();
  state.routingBucket = "importer";
  state.decisionReason = "importer_confirmed";

  leadState[lead.waId] = state;
  saveState(STATE_PATH, leadState);
  if (AUTO_MUTE_AFTER_SCREENING) {
    muteContact(lead.waId);
  }

  const finalizedLead = {
    ...lead,
    state,
    leadStatus: "qualified",
    routingBucket: "importer",
    decisionReason: "importer_confirmed"
  };

  await notifyTakeover(finalizedLead);
  appendHandoffLog(finalizedLead);
  appendScreenedLeadLog(finalizedLead);
  await exportLead(finalizedLead);
  await queueMetaFeedback(finalizedLead);
}

async function handleDisqualifiedLead(lead, previousState) {
  cancelContactTimers(lead.waId);

  const state = sanitizeLeadState(lead.state);
  const t = getTemplates(lead.language);

  await sendAndRecordMessage(lead.waId, t.nonImporter, {
    direction: "outbound",
    reply_engine: "low_quality_close",
    language: lead.language,
    country_guess: lead.countryGuess,
    company_name: lead.companyName,
    buyer_type: lead.buyerType,
    lead_status: "low_quality",
    profile_name: lead.profileName
  });

  state.buyerType = lead.buyerType;
  state.language = lead.language;
  state.country = lead.countryGuess;
  state.companyName = lead.companyName;
  state.screeningComplete = true;
  state.lastLeadStatus = "low_quality";
  state.lastBotReply = t.nonImporter;
  state.lastUpdatedAt = new Date().toISOString();
  state.routingBucket = "non_importer";
  state.decisionReason =
    lead.decisionReason || lead.buyerType || "non_importer";

  leadState[lead.waId] = state;
  saveState(STATE_PATH, leadState);
  if (AUTO_MUTE_AFTER_SCREENING) {
    muteContact(lead.waId);
  }

  const finalizedLead = {
    ...lead,
    state,
    leadStatus: "low_quality",
    routingBucket: "non_importer",
    decisionReason: lead.decisionReason || lead.buyerType || "non_importer"
  };

  appendScreenedLeadLog(finalizedLead);
  await exportLead(finalizedLead);
  await queueMetaFeedback(finalizedLead);
}

async function handleTimedOutLead(lead, previousState) {
  const timedOutLead = {
    ...lead,
    buyerType: "unknown",
    leadStatus: "low_quality",
    decisionReason: "timeout_after_3_messages",
    routingBucket: "non_importer",
    state: {
      ...lead.state,
      buyerType: "unknown"
    }
  };

  await handleDisqualifiedLead(timedOutLead, previousState);
}

function getTemplates(language) {
  return templates[language] || templates.en;
}

function scheduleStep(waId, step, delayMs) {
  const key = normalizeWaId(waId);
  const entry = scheduledTimers.get(key) || {};
  if (entry[step]) return;

  entry[step] = setTimeout(() => {
    enqueueLeadEvent({
      kind: "scheduled",
      waId,
      step
    }).catch((error) => {
      console.error(`Scheduled step failed for ${waId}/${step}:`, error.message);
    });
  }, Math.max(0, delayMs));

  scheduledTimers.set(key, entry);
}

function hasScheduledStep(waId, step) {
  const entry = scheduledTimers.get(normalizeWaId(waId));
  return Boolean(entry && entry[step]);
}

function clearScheduledStep(waId, step) {
  const key = normalizeWaId(waId);
  const entry = scheduledTimers.get(key);
  if (!entry || !entry[step]) return;
  clearTimeout(entry[step]);
  delete entry[step];
  if (!Object.keys(entry).length) {
    scheduledTimers.delete(key);
    return;
  }
  scheduledTimers.set(key, entry);
}

function cancelContactTimers(waId) {
  const key = normalizeWaId(waId);
  const entry = scheduledTimers.get(key);
  if (!entry) return;
  for (const timer of Object.values(entry)) {
    clearTimeout(timer);
  }
  scheduledTimers.delete(key);
}

function guessCountryAndLanguage(waId) {
  for (const [prefix, country, language] of languageRules) {
    if (waId.startsWith(prefix)) {
      return { country, language };
    }
  }

  if (waId.startsWith("7")) {
    if (/^7(6|7)/.test(waId)) return { country: "Kazakhstan", language: "kk" };
    return { country: "Russia", language: "ru" };
  }

  return { country: "Unknown", language: "en" };
}

function detectLanguage(text, fallbackLanguage, countryGuess) {
  if (!text) return fallbackLanguage;
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(text)) return "kk";
  if (/[\u0400-\u04FF]/.test(text)) {
    if (countryGuess === "Kyrgyzstan") return "ky";
    if (countryGuess === "Kazakhstan" && /қ|ң|ү|ұ|ө|ә|ғ|һ|і/i.test(text)) return "kk";
    return "ru";
  }
  if (/(hola|catalogo|cat[aá]logo|repuesto|remolque|semi-remolque|importador)/i.test(text)) {
    return "es";
  }
  if (/(ol[aá]|cat[aá]logo|pe[cç]a|reboque|semirreboque|importador)/i.test(text)) {
    return "pt";
  }
  if (/(bonjour|catalogue|pi[eè]ce|camion|importateur)/i.test(text)) {
    return "fr";
  }
  if (/(hello|hi|hey|good morning|good afternoon|good evening|catalog|truck|trailer|importer)/i.test(text)) {
    return "en";
  }
  return fallbackLanguage;
}

function detectIntent(text) {
  const value = String(text || "").trim();
  if (!value) return "unknown";
  if (/(who are you|who is this|what company|which company|introduce yourself|who am i speaking with)/i.test(value)) {
    return "ask_identity";
  }
  if (/(hello|hi|hey|good morning|good afternoon|hola|ol[aá]|bonjour|привет|здравствуйте|سلام|你好)/i.test(value)) {
    return "greeting";
  }
  if (/(how are you|how are u|how r you|how're you|how do you do|what'?s up|que tal|cómo estás|como estas|как дела|你好吗|最近怎么样|还好吗)/i.test(value)) {
    return "smalltalk";
  }
  return "info";
}

function detectCatalogRequest(text) {
  return /(catalog|catalogue|brochure|website|site|product list|cat[aá]logo|каталог|目录)/i.test(
    String(text || "")
  );
}

function detectBuyerType(text, lastPromptKey = "") {
  const value = String(text || "");
  const compact = value.trim().toLowerCase();
  const askedImporterQuestion =
    lastPromptKey === "importer_question" || lastPromptKey === "intro_importer";
  const askedClarifyQuestion = lastPromptKey === "clarify";
  const affirmativeReply = isAffirmativeReply(compact);
  const negativeReply = isNegativeReply(compact);

  if (
    /(importer|importador|importadora|импортер|импорт|进口商|进口)/i.test(value) ||
    (askedImporterQuestion && affirmativeReply) ||
    (askedClarifyQuestion && affirmativeReply)
  ) {
    return "importer";
  }

  if (
    ((askedImporterQuestion || askedClarifyQuestion) && negativeReply) ||
    /(not importer|non importer|no importador|não importador|不是进口商)/i.test(
      value
    )
  ) {
    return "non_importer";
  }

  if (
    askedClarifyQuestion &&
    /(business|commercial|resale|re[- ]?sale|wholesale|trade|trading|for business|business use|commercial use|批发|转售|商业用途|商用|贸易|生意)/i.test(
      value
    )
  ) {
    return "importer";
  }

  if (
    askedClarifyQuestion &&
    /(retail|local retail|personal|personal use|self use|self-use|local use|零售|个人|自用|本地零售)/i.test(
      value
    )
  ) {
    return "retail";
  }

  if (/(wholesaler|mayorista|atacadista|grossiste|оптов)/i.test(value)) {
    return "wholesaler";
  }
  if (/(distributor|distribuidor|distributeur|дистриб)/i.test(value)) {
    return "distributor";
  }
  if (/(workshop|garage|taller|oficina|atelier|service|servi[cç]o|мастерск|сервис|维修厂)/i.test(value)) {
    return "workshop";
  }
  if (/(retail|personal|my car|one piece|1 piece|individual|розниц|личн|个人)/i.test(value)) {
    return "retail";
  }
  return "unknown";
}

function isAffirmativeReply(value) {
  return /^(yes|y|yeah|yep|yes sure|sure|sure yes|of course|certainly|definitely|absolutely|affirmative|oui|bien sur|bien sûr|sí|si|sí claro|si claro|sim|да|да конечно|конечно|是|对|是的|当然|当然是|可以)$/i.test(
    String(value || "").trim()
  );
}

function isNegativeReply(value) {
  return /^(no|n|nope|nah|нет|не|non|nao|não|不是|不|not really)$/i.test(
    String(value || "").trim()
  );
}

function detectCountry(text) {
  const value = String(text || "");
  const knownCountries = [
    "china",
    "russia",
    "kazakhstan",
    "kyrgyzstan",
    "uae",
    "united arab emirates",
    "saudi arabia",
    "iraq",
    "qatar",
    "bahrain",
    "oman",
    "kuwait",
    "jordan",
    "lebanon",
    "egypt",
    "morocco",
    "algeria",
    "tunisia",
    "libya",
    "brazil",
    "argentina",
    "chile",
    "colombia",
    "venezuela",
    "peru",
    "ecuador",
    "paraguay",
    "uruguay",
    "bolivia",
    "mexico",
    "spain",
    "cameroon",
    "mali",
    "france",
    "china",
    "中国"
  ];
  return knownCountries.find((item) => value.toLowerCase().includes(item)) || "";
}

function detectCompanyName(text) {
  const value = String(text || "").trim();
  if (!value) return "";

  const explicitPatterns = [
    /(?:company|empresa|compa[nñ]ia|firm|factory|co\.?|ltd|llc|trading|garage|workshop|atelier)\s*[:\-]?\s*([A-Za-z0-9&.,'()\- ]{2,80})/i,
    /(?:this is|i am from|we are from|soy de|somos de|from|nous sommes)\s+([A-Za-z0-9&.,'()\- ]{2,80})/i
  ];

  for (const pattern of explicitPatterns) {
    const match = value.match(pattern);
    if (match?.[1]) return cleanCompanyName(match[1]);
  }

  if (
    /(ltd|llc|co\.|company|trading|import|distrib|factory|garage|workshop|atelier)/i.test(
      value
    ) &&
    value.length <= 100
  ) {
    return cleanCompanyName(value);
  }

  return "";
}

function cleanCompanyName(value) {
  return String(value || "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .slice(0, 80);
}

function classifyLead({ buyerType }) {
  if (buyerType === "importer") return "qualified";
  if (
    ["wholesaler", "distributor", "workshop", "retail", "non_importer"].includes(
      buyerType
    )
  ) {
    return "low_quality";
  }
  return "need_more_info";
}

function shouldForceScreeningDecision(state) {
  return (
    Number(state.inboundCount || 0) >= MAX_SCREENING_INBOUND_MESSAGES ||
    Number(state.screeningPromptCount || 0) >= MAX_SCREENING_PROMPTS
  );
}

function shouldRepeatImporterQuestion(lead, previousState) {
  if (!lead || lead.buyerType !== "unknown") return false;
  if (Number(previousState.screeningPromptCount || 0) >= MAX_SCREENING_PROMPTS) {
    return false;
  }

  const lastPromptKey = previousState.lastScreeningPromptKey || "";
  if (!["importer_question", "intro_importer"].includes(lastPromptKey)) {
    return false;
  }

  return ["greeting", "smalltalk", "ask_identity"].includes(lead.intent);
}

async function sendAndRecordMessage(waId, body, meta = {}) {
  const replyText = sanitizeReplyText(body);
  if (!replyText) return;

  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    try {
      await sendWhatsAppText(waId, replyText);
    } catch (error) {
      console.error(`WhatsApp send failed for ${waId}: ${error.message}`);
      throw error;
    }
  }

  appendLeadLog({
    updated_at: new Date().toISOString(),
    incoming_text: "",
    ...meta,
    wa_id: waId,
    reply_text: replyText
  });
}

async function sendWhatsAppText(to, body) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: false,
      body
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${errorText}`);
  }
}

function appendLeadLog(record) {
  fs.appendFileSync(LEAD_LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
}

function appendHandoffLog(lead) {
  fs.appendFileSync(
    HANDOFF_LOG_PATH,
    `${JSON.stringify(buildLeadSummary(lead, "qualified"))}\n`,
    "utf8"
  );
}

function appendScreenedLeadLog(lead) {
  fs.appendFileSync(
    SCREENED_LOG_PATH,
    `${JSON.stringify(buildLeadSummary(lead, lead.leadStatus))}\n`,
    "utf8"
  );
}

async function exportLead(lead) {
  const record = buildExportRecord(lead);
  const queued = {
    queued_at: new Date().toISOString(),
    status: LEAD_EXPORT_WEBHOOK_URL ? "queued_webhook" : "logged_local",
    destination: LEAD_EXPORT_WEBHOOK_URL ? "webhook" : "local_log",
    record
  };

  if (LEAD_EXPORT_WEBHOOK_URL) {
    try {
      const response = await fetch(LEAD_EXPORT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Lead export failed: ${response.status} ${errorText.slice(0, 400)}`
        );
      }

      queued.status = "sent";
    } catch (error) {
      queued.status = "send_failed";
      queued.error = error.message;
    }
  }

  fs.appendFileSync(EXPORT_LOG_PATH, `${JSON.stringify(queued)}\n`, "utf8");
}

async function queueMetaFeedback(lead) {
  const summary = buildLeadSummary(lead, lead.leadStatus);
  const queued = {
    queued_at: new Date().toISOString(),
    status: META_CAPI_TOKEN && META_DATASET_ID ? "sent" : "pending_credentials",
    event_name:
      lead.leadStatus === "qualified"
        ? META_QUALIFIED_EVENT_NAME
        : META_DISQUALIFIED_EVENT_NAME,
    payload: buildMetaEventPayload(lead),
    lead_summary: summary
  };

  if (META_CAPI_TOKEN && META_DATASET_ID) {
    try {
      await sendMetaEvent(queued.payload);
    } catch (error) {
      queued.status = "send_failed";
      queued.error = error.message;
    }
  }

  fs.appendFileSync(META_EVENT_LOG_PATH, `${JSON.stringify(queued)}\n`, "utf8");
}

function buildMetaEventPayload(lead) {
  const waId = normalizeWaId(lead.waId);
  const now = Math.floor(Date.now() / 1000);
  return {
    event_name:
      lead.leadStatus === "qualified"
        ? META_QUALIFIED_EVENT_NAME
        : META_DISQUALIFIED_EVENT_NAME,
    event_time: now,
    action_source: "system_generated",
    event_source_url: CATALOG_URL,
    user_data: {
      ph: [sha256(waId)],
      external_id: [sha256(waId)]
    },
    custom_data: {
      source: "whatsapp_click_to_message",
      buyer_type: lead.buyerType,
      language: lead.language,
      country_guess: lead.countryGuess,
      company_name: lead.companyName || "",
      profile_name: lead.profileName || ""
    }
  };
}

async function sendMetaEvent(payload) {
  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_DATASET_ID}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_CAPI_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: [payload],
        ...(META_TEST_EVENT_CODE ? { test_event_code: META_TEST_EVENT_CODE } : {})
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta event send failed: ${response.status} ${errorText}`);
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildExportRecord(lead) {
  const summary = buildLeadSummary(lead, lead.leadStatus);
  return {
    ...summary,
    exported_at: new Date().toISOString(),
    first_3_messages: Array.isArray(lead.state?.firstThreeInboundTexts)
      ? lead.state.firstThreeInboundTexts.join(" | ")
      : ""
  };
}

function buildLeadSummary(lead, finalStatus) {
  return {
    updated_at: new Date().toISOString(),
    wa_id: lead.waId,
    profile_name: lead.profileName || "",
    language: lead.language || "",
    country_guess: lead.countryGuess || "",
    company_name: lead.companyName || "",
    buyer_type: lead.buyerType || "unknown",
    lead_status: finalStatus,
    routing_bucket:
      lead.routingBucket || (finalStatus === "qualified" ? "importer" : "non_importer"),
    decision_reason: lead.decisionReason || "",
    screening_inbound_count: Number(lead.state?.inboundCount || 0),
    screening_prompt_count: Number(lead.state?.screeningPromptCount || 0),
    first_inbound_text: lead.state?.firstInboundText || "",
    last_inbound_text: lead.text || lead.state?.lastInboundText || "",
    first_3_messages: Array.isArray(lead.state?.firstThreeInboundTexts)
      ? lead.state.firstThreeInboundTexts.join(" | ")
      : ""
  };
}

function loadState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Failed to load lead state:", error);
    return {};
  }
}

function saveState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function createLeadState() {
  return {
    language: "",
    country: "",
    companyName: "",
    buyerType: "unknown",
    sentIntroAt: "",
    catalogSentAt: "",
    importerAskedAt: "",
    lastImporterReminderAt: "",
    sequenceStartedAt: "",
    lastBotReply: "",
    lastInboundText: "",
    firstInboundText: "",
    firstThreeInboundTexts: [],
    lastInboundMessageId: "",
    lastLeadStatus: "",
    screeningComplete: false,
    existingCustomer: false,
    notifiedQualified: false,
    profileName: "",
    lastUpdatedAt: "",
    inboundCount: 0,
    screeningPromptCount: 0,
    lastScreeningPromptKey: "",
    routingBucket: "",
    decisionReason: ""
  };
}

function sanitizeLeadState(state) {
  return {
    ...createLeadState(),
    ...(state || {})
  };
}

function loadExistingCustomers(filePath, inlineValue) {
  return loadWaIdList(filePath, inlineValue);
}

function loadWaIdList(filePath, inlineValue) {
  const values = [];

  if (inlineValue) {
    values.push(...String(inlineValue).split(","));
  }

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    values.push(...content.split(/\r?\n/));
  }

  return new Set(values.map(normalizeWaId).filter(Boolean));
}

function loadHistoricalConversationWaIds(logPath, threshold) {
  const limit = Math.max(1, Number(threshold || 0));
  const counts = new Map();

  if (!fs.existsSync(logPath)) {
    return new Set();
  }

  const content = fs.readFileSync(logPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;

    try {
      const record = JSON.parse(text);
      const waId = normalizeWaId(record.wa_id);
      const hasInboundText = Boolean(String(record.incoming_text || "").trim());
      if (!waId || !hasInboundText) continue;

      counts.set(waId, Number(counts.get(waId) || 0) + 1);
    } catch (_) {
      continue;
    }
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= limit)
      .map(([waId]) => waId)
  );
}

function normalizeWaId(value) {
  return String(value || "").replace(/[^\d]/g, "").trim();
}

function isExistingCustomer(waId) {
  return existingCustomerWaIds.has(normalizeWaId(waId));
}

function getAutomationBypassReason(waId) {
  const normalized = normalizeWaId(waId);
  if (!normalized) return "";
  if (existingCustomerWaIds.has(normalized)) return "existing_customer";
  if (autoMutedWaIds.has(normalized)) return "screened_contact";
  if (historicalConversationWaIds.has(normalized)) return "historical_chat_limit";
  return "";
}

function muteContact(waId) {
  const normalized = normalizeWaId(waId);
  if (!normalized || autoMutedWaIds.has(normalized)) return;
  autoMutedWaIds.add(normalized);
  fs.appendFileSync(AUTO_MUTED_CONTACTS_PATH, `${normalized}\n`, "utf8");
}

function isDuplicateMessage(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;

  const now = Date.now();
  for (const [key, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > 1000 * 60 * 60) {
      processedMessageIds.delete(key);
    }
  }

  if (processedMessageIds.has(id)) return true;
  processedMessageIds.set(id, now);
  return false;
}

function normalizeLanguage(value) {
  const text = String(value || "").trim().toLowerCase();
  return supportedLanguages.has(text) ? text : "";
}

function normalizeBuyerType(value) {
  const text = String(value || "").trim().toLowerCase();
  return supportedBuyerTypes.has(text) ? text : "";
}

function clampText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, maxLength);
}

function sanitizeReplyText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

async function notifyTakeover(lead) {
  const title = "WhatsApp importer confirmed";
  const subtitle = lead.profileName
    ? `${lead.profileName} / ${lead.waId}`
    : lead.waId;
  const message = `${lead.language.toUpperCase()} / ${lead.countryGuess} / importer confirmed`;

  if (ENABLE_LOCAL_NOTIFICATIONS) {
    const escapeAppleScript = (value) =>
      `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

    execFile(
      "osascript",
      [
        "-e",
        `display notification ${escapeAppleScript(
          message
        )} with title ${escapeAppleScript(title)} subtitle ${escapeAppleScript(
          subtitle
        )}`
      ],
      () => {}
    );
  }

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await sendTelegramTakeoverAlert(lead, { title, subtitle, message });
    } catch (error) {
      console.error("Telegram takeover alert failed:", error.message);
    }
  }

  if (!TAKEOVER_ALERT_WEBHOOK_URL) return;

  try {
    const response = await fetch(TAKEOVER_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        subtitle,
        message,
        lead: buildLeadSummary(lead, lead.leadStatus || "qualified")
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Takeover alert failed: ${response.status} ${errorText.slice(0, 400)}`
      );
    }
  } catch (error) {
    console.error("Takeover alert webhook failed:", error.message);
  }
}

async function sendTelegramTakeoverAlert(lead, payload) {
  const leadSummary = buildLeadSummary(lead, lead.leadStatus || "qualified");
  const lines = [
    "<b>New qualified importer needs takeover</b>",
    "",
    `<b>Contact</b>: ${escapeTelegramHtml(payload.subtitle)}`,
    `<b>Language / Country</b>: ${escapeTelegramHtml(
      `${lead.language.toUpperCase()} / ${lead.countryGuess || "Unknown"}`
    )}`,
    `<b>Buyer Type</b>: ${escapeTelegramHtml(lead.buyerType || "importer")}`,
    `<b>Last Message</b>: ${escapeTelegramHtml(
      lead.text || lead.state?.lastInboundText || "-"
    )}`,
    `<b>First 3 Messages</b>: ${escapeTelegramHtml(
      leadSummary.first_3_messages || "-"
    )}`,
    "",
    "Please take over this WhatsApp conversation now."
  ];

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (TELEGRAM_MESSAGE_THREAD_ID) {
    body.message_thread_id = Number(TELEGRAM_MESSAGE_THREAD_ID);
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${errorText.slice(0, 400)}`
    );
  }
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
