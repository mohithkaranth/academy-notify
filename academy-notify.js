require("dotenv").config();
const postgres = require("postgres");
const XLSX = require("xlsx");
const fs = require("fs");

const sql = postgres(process.env.DATABASE_URL);
console.log("Webhook exists:", !!process.env.SLACK_WEBHOOK_URL);

async function sendSlack(message) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
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
      await sendSlack("No new academy applications");
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