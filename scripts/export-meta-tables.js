#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const inputPath =
  process.argv[2] || path.join(repoRoot, "data", "exports.ndjson");
const outputDir =
  process.argv[3] || path.join(repoRoot, "data", "facebook-exports");

const QUALIFIED_EVENT_NAME = "QualifiedLead";
const DISQUALIFIED_EVENT_NAME = "NonImporterLead";

main();

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    console.error(
      "Tip: exports.ndjson is created when a lead reaches a finalized outcome."
    );
    process.exit(1);
  }

  const rows = readExports(inputPath);
  const qualifiedRows = latestRowsByWaId(
    rows.filter((row) => row.lead_status === "qualified").map((row) => ({
      ...row,
      facebook_event_name: QUALIFIED_EVENT_NAME
    }))
  );
  const disqualifiedRows = latestRowsByWaId(
    rows.filter((row) => row.lead_status === "low_quality").map((row) => ({
      ...row,
      facebook_event_name: DISQUALIFIED_EVENT_NAME
    }))
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const columns = [
    "wa_id",
    "phone_number",
    "profile_name",
    "language",
    "country_guess",
    "company_name",
    "buyer_type",
    "lead_status",
    "routing_bucket",
    "decision_reason",
    "screening_inbound_count",
    "screening_prompt_count",
    "first_inbound_text",
    "last_inbound_text",
    "first_3_messages",
    "facebook_event_name",
    "updated_at",
    "exported_at"
  ];

  const qualifiedCsv = toCsv(qualifiedRows, columns);
  const disqualifiedCsv = toCsv(disqualifiedRows, columns);

  const qualifiedPath = path.join(outputDir, "qualified-leads.csv");
  const disqualifiedPath = path.join(outputDir, "non-qualified-leads.csv");
  const summaryPath = path.join(outputDir, "summary.json");

  fs.writeFileSync(qualifiedPath, qualifiedCsv, "utf8");
  fs.writeFileSync(disqualifiedPath, disqualifiedCsv, "utf8");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        input_path: inputPath,
        qualified_count: qualifiedRows.length,
        non_qualified_count: disqualifiedRows.length,
        qualified_csv: qualifiedPath,
        non_qualified_csv: disqualifiedPath
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Qualified rows: ${qualifiedRows.length}`);
  console.log(`Non-qualified rows: ${disqualifiedRows.length}`);
  console.log(`Wrote: ${qualifiedPath}`);
  console.log(`Wrote: ${disqualifiedPath}`);
  console.log(`Wrote: ${summaryPath}`);
}

function readExports(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry) => entry.record || entry)
    .map((row) => ({
      ...row,
      phone_number: normalizePhone(row.wa_id),
      updated_at: row.updated_at || "",
      exported_at: row.exported_at || ""
    }));
}

function latestRowsByWaId(rows) {
  const byWaId = new Map();
  for (const row of rows) {
    const key = String(row.wa_id || "").trim();
    const existing = byWaId.get(key);
    if (!existing) {
      byWaId.set(key, row);
      continue;
    }

    const existingTime = new Date(existing.exported_at || existing.updated_at || 0).getTime();
    const currentTime = new Date(row.exported_at || row.updated_at || 0).getTime();
    if (currentTime >= existingTime) {
      byWaId.set(key, row);
    }
  }
  return Array.from(byWaId.values()).sort((a, b) =>
    String(a.wa_id || "").localeCompare(String(b.wa_id || ""))
  );
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => csvEscape(row[column] == null ? "" : row[column]))
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvEscape(value) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
