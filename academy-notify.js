require("dotenv").config();
const postgres = require("postgres");
const XLSX = require("xlsx");
const fs = require("fs");
const { google } = require("googleapis");

const sql = postgres(process.env.DATABASE_URL);
console.log("Webhook exists:", !!process.env.SLACK_WEBHOOK_URL);
console.log("JSON exists:", !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function sendSlack(message) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

async function appendToSheet(rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows,
    },
  });
}

async function run() {
  try {
    // 1. Get unprocessed records
    const rows = await sql`
      SELECT * FROM "AcademyApplication"
      WHERE processed = false
    `;

    if (rows.length === 0) {
      console.log("No new records");
      return;
    }

    console.log(`Processing ${rows.length} records`);

    // 2. Convert to Excel
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Applications");

    const filePath = `academy_${Date.now()}.xlsx`;
    XLSX.writeFile(workbook, filePath);

    console.log("Excel created:", filePath);

    // 3. Notify Slack
    await sendSlack(`New applications received: ${rows.length}`);

    // 3.5 Send to Google Sheets
    const sheetRows = rows.map(r => [
      r.name,
      r.email,
      r.phone,
      r.instrument,
      r.experience,
      r.about,
      r.Genre,
    ]);

    await appendToSheet(sheetRows);

    console.log("Sent to Google Sheets");

    // 4. Mark as processed
    const ids = rows.map(r => r.id);

    await sql`
      UPDATE "AcademyApplication"
      SET processed = true
      WHERE id = ANY(${ids})
    `;

    console.log("Marked as processed");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await sql.end();
  }
}

run();