require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const cron = require('node-cron');
const crypto = require('crypto');

// 1. إعداد البوت
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// 2. الاتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// 3. تعريف الموديل
const userSchema = new mongoose.Schema({
  id: Number,
  time: String,
  page: { type: Number, default: 1 },
});
const User = mongoose.model('User', userSchema,'telegram');

// 4. توليد قائمة الساعات
function generateTimeKeyboard() {
  const buttons = [];
  for (let hour = 0; hour < 24; hour++) {
    const label24 = `${hour.toString().padStart(2, '0')}:00`;
    const label12 = hour === 0
      ? `12:00 صباحًا`
      : hour < 12
      ? `${hour}:00 صباحًا`
      : hour === 12
      ? `12:00 مساءً`
      : `${hour - 12}:00 مساءً`;
    buttons.push([{ text: `🕒 ${label12}`, callback_data: `set_time_${label24}` }]);
  }
  return { reply_markup: { inline_keyboard: buttons } };
}

// 5. عند تنفيذ /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "👋 مرحبًا بك!\nيرجى اختيار الساعة التي تريد أن تصلك فيها صفحة من القرآن يوميًا:",
    generateTimeKeyboard()
  );
});

// 6. عندما يختار المستخدم الساعة من القائمة
// 6. عندما يختار المستخدم الساعة من القائمة
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('set_time_')) {
    const selectedTime = data.replace('set_time_', '');

    // ✅ تحقق من الوقت قبل الحفظ
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(selectedTime)) {
      await bot.answerCallbackQuery({ callback_query_id: query.id, text: '❌ وقت غير صالح' });
      return;
    }

    await User.findOneAndUpdate(
      { id: chatId },
      { time: selectedTime },
      { upsert: true, new: true }
    );

    await bot.answerCallbackQuery({ callback_query_id: query.id });
    await bot.sendMessage(chatId, `✅ تم تعيين الوقت: ${selectedTime}. ستصلك صفحتك من القرآن يوميًا.`);
  }
});


// 7. إرسال رابط الصفحة اليومي
async function sendPage(user) {
  const page = user.page;
  const url = `${process.env.BASE_URL}${page}`;
  await bot.sendMessage(user.id, `📖 صفحتك اليوم من القرآن:\n${url}`);
  user.page += 1;
  await user.save();
}

// 8. كرون: كل دقيقة يفحص من يجب إرسال رسالة له
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  const users = await User.find({ time: timeStr });
  users.forEach(sendPage);
});

console.log("✅ the bot is working");
