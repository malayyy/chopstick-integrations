# Free website lead database (Google Sheets)

This adds a Google Apps Script endpoint that stores each Chopstick contact-form enquiry in a Google Sheet. It is free with a standard Google account and requires no paid database or mailbox.

## What this branch changes

- Keeps the current FormSubmit email notification flow.
- Adds an optional Google Sheets POST. It remains disabled until you paste your own Apps Script Web App URL into sheetsEndpoint in index.html.
- Adds the Apps Script backend in google-apps-script/Code.gs.
- Does not change the cinematic experience, assets, DNS, or production branch.

## One-time Google setup (requires your Google account)

1. Open https://script.google.com/ and create a new project named Chopstick Lead Capture.
2. Copy google-apps-script/Code.gs into the editor, replacing the starter code.
3. Select setup from the function dropdown and click Run. Approve the Google Sheets permission prompt. The execution log prints the new spreadsheet URL. Open it and bookmark it.
4. Click Deploy → New deployment → Web app.
5. Set Execute as to Me and Who has access to Anyone, then deploy. Approve the deployment permissions if prompted.
6. Copy the Web App URL ending in /exec.
7. In index.html, replace the empty string in const sheetsEndpoint = ""; with that URL.
8. Review and publish this branch through a pull request. The live site is not changed by this branch.

## Data captured

Submission timestamp, name, work email, company, website, phone, service, current platforms, budget, project details, preferred call date/time, and source.

## Notes

- Existing email delivery remains in place. Google Sheets is an additional record, not a replacement.
- The browser sends a simple URL-encoded POST to avoid a CORS preflight. Apps Script responses are opaque to browser JavaScript in this mode, so a resolved request means the browser dispatched it, not that the row was independently verified. Test with a clearly labelled test enquiry and check the Sheet before launch.
- The script uses a honeypot field, validates required fields, trims inputs, and serializes writes with a lock.
- Zoho Mail is your mailbox provider. Keep Zoho's three MX records and remove only the two ImprovMX MX records you added (mx1.improvmx.com and mx2.improvmx.com) in GoDaddy. This DNS cleanup is separate from this website code branch.
- Historical FormSubmit enquiries are not imported by this change; recover those separately from FormSubmit's archive if available.
