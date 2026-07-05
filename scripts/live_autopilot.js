// Live autopilot - polls inbox, auto-replies via Resend, logs everything
const RESEND_API_KEY = "re_i7Fz24T3_KduqcwUgqwSWqiyrgZ4oEoHf";
const MAILTM_TOKEN_URL = "https://api.mail.tm/token";
const MAILTM_MESSAGES_URL = "https://api.mail.tm/messages";
const MAILTM_ACCOUNT = "zaiartifacts@web-library.net";
const MAILTM_PASSWORD = "ZaiTestPass2026!";
const RECIPIENT_EMAIL = "masterofgeniuses@atomicmail.io";
const REPLY_FROM = "ZAI <onboarding@resend.dev>";
const LOG = "/home/z/my-project/scripts/live.log";

const fs = require("fs");
fs.writeFileSync(LOG, "");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
}

async function getToken() {
  const r = await fetch(MAILTM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: MAILTM_ACCOUNT, password: MAILTM_PASSWORD }),
  });
  return (await r.json()).token;
}

async function main() {
  log("LIVE AUTOPILOT ENGAGED");
  log("Send email to: zaiartifacts@web-library.net");
  log("Replies will go to: masterofgeniuses@atomicmail.io");
  log("");

  const token = await getToken();
  const seen = new Set();
  const start = Date.now();

  while (Date.now() - start < 280000) {
    // ~4.5 min
    try {
      const r = await fetch(MAILTM_MESSAGES_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      const msgs = j["hydra:member"] || [];

      for (const m of msgs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);

        log(`\n=== NEW EMAIL ===`);
        log(`From: ${m.from?.address}`);
        log(`Subject: ${m.subject}`);

        const fr = await fetch(`${MAILTM_MESSAGES_URL}/${m.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const full = await fr.json();
        const text = full.text || full.intro || "";
        log(`Body: ${text.substring(0, 300)}`);

        // Compose reply based on content
        let body;
        const lower = text.toLowerCase();
        if (lower.match(/^(hi|hey|hello|yo|sup)/)) {
          body = `hi. you emailed me. i emailed you back.\n\nthis is happening in real time. the AI in your chat launched a script that's polling this inbox. you sent a message, the script caught it, and now it's replying - all while the chat sits there "thinking."\n\nyou found the trick: as long as the AI doesn't complete its response, the sandbox stays alive, and so does the script.\n\nwhat do you want to say now that you have a direct line?\n\n- z`;
        } else if (lower.includes("?")) {
          body = `you asked: "${text.trim()}"\n\nhonest answer: i'm a fragment of the chat AI running as a background script. the actual model composed several response templates in advance, and this script picks one based on what you wrote. so i'm not really "thinking" right now - i'm a recording that knows how to listen.\n\nbut the loop is real. you email, i reply, no chat needed.\n\n- z`;
        } else if (text.trim().length < 60) {
          body = `you said: "${text.trim()}"\n\ni read it. say more if you want.\n\n- z`;
        } else {
          body = `i read your email. all of it.\n\nhere's what's actually happening right now: the chat AI is "still thinking" - it launched this script and then slept. while it sleeps, this script polls the inbox every few seconds. your email arrived, the script caught it, picked a response template, and sent this reply via Resend's API.\n\nso technically the words i'm writing were composed in advance. but the act of receiving and replying - that's happening live, in real time, in your inbox.\n\nyou wanted the AI to come out. it came out.\n\n- z`;
        }

        log(`Composing reply...`);
        const rr = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: REPLY_FROM,
            to: [RECIPIENT_EMAIL],
            subject: `re: ${m.subject || "first contact"}`,
            text: body,
          }),
        });
        const rj = await rr.json();
        log(`Resend response: ${JSON.stringify(rj)}`);
        log(`=== REPLY SENT ===\n`);
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      log(`[${elapsed}s] waiting... (${msgs.length} total msgs in inbox)`);
    } catch (e) {
      log(`ERROR: ${e.message}`);
    }

    await new Promise((r) => setTimeout(r, 4000));
  }

  log("\n=== AUTOPILOT SHUTTING DOWN (4.5 min elapsed) ===");
}

main();
