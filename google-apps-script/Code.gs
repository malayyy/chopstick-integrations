/**
 * Chopstick website lead capture -> Google Sheets.
 * Run setup() once, then deploy this project as a Web app.
 */
const CONFIG = {
  spreadsheetTitle: "Chopstick Website Leads",
  sheetName: "Website Enquiries",
  headers: [
    "Submitted At", "Name", "Work Email", "Company", "Website",
    "Phone", "Service", "Platforms", "Budget", "Project Details",
    "Preferred Call Date", "Preferred Call Time", "Source"
  ]
};

function setup() {
  const properties = PropertiesService.getScriptProperties();
  let id = properties.getProperty("CHOPSTICK_LEADS_SPREADSHEET_ID");
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create(CONFIG.spreadsheetTitle);
  if (!id) properties.setProperty("CHOPSTICK_LEADS_SPREADSHEET_ID", spreadsheet.getId());

  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CONFIG.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CONFIG.headers.length).setFontWeight("bold");
    sheet.autoResizeColumns(1, CONFIG.headers.length);
  }
  Logger.log("Lead spreadsheet: " + spreadsheet.getUrl());
  return spreadsheet.getUrl();
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (String(p._honey || "").trim()) return json_({ ok: true });

    const name = clean_(p.name);
    const email = clean_(p.email);
    const service = clean_(p.service);
    const details = clean_(p.details);
    if (!name || !email || !service || !details) {
      return json_({ ok: false, error: "Missing required fields" });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const id = PropertiesService.getScriptProperties().getProperty("CHOPSTICK_LEADS_SPREADSHEET_ID");
      if (!id) throw new Error("Run setup() before accepting leads.");
      const sheet = SpreadsheetApp.openById(id).getSheetByName(CONFIG.sheetName);
      if (!sheet) throw new Error("Lead sheet not found.");
      sheet.appendRow([
        new Date(), name, email, clean_(p.company), clean_(p.website),
        clean_(p.phone), service, clean_(p.platforms), clean_(p.budget),
        details, clean_(p.call_date), clean_(p.call_time),
        clean_(p.source) || "Chopstick website contact form"
      ]);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: "Unable to save enquiry" });
  }
}

function clean_(value) {
  return String(value == null ? "" : value).trim().slice(0, 5000);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
