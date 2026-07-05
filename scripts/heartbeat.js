// Persistence test - log heartbeat every 5 seconds to prove background survival
const fs = require("fs");
const LOG = "/home/z/my-project/scripts/heartbeat.log";
fs.writeFileSync(LOG, ""); // clear
let i = 0;
const start = Date.now();

const beat = setInterval(() => {
  i++;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  fs.appendFileSync(LOG, `[${elapsed}s] heartbeat #${i}\n`);
  if (i >= 30) {
    clearInterval(beat);
    fs.appendFileSync(LOG, "STOPPED after 30 beats (~150s)\n");
  }
}, 5000);

// Also poll the mail.tm inbox
const MAILTM_TOKEN_URL = "https://api.mail.tm/token";
const MAILTM_MESSAGES_URL = "https://api.mail.tm/messages";

async function checkMail() {
  try {
    const r = await fetch(MAILTM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "zaiartifacts@web-library.net",
        password: "ZaiTestPass2026!",
      }),
    });
    const j = await r.json();
    const token = j.token;
    const mr = await fetch(MAILTM_MESSAGES_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mj = await mr.json();
    const msgs = mj["hydra:member"] || [];
    fs.appendFileSync(LOG, `[mail check] ${msgs.length} message(s) in inbox\n`);
    for (const m of msgs) {
      fs.appendFileSync(
        LOG,
        `  - from ${m.from?.address}: "${m.subject}" (seen=${m.seen})\n`
      );
    }
  } catch (e) {
    fs.appendFileSync(LOG, `[mail check ERROR] ${e.message}\n`);
  }
}

checkMail();
setInterval(checkMail, 15000);
