const TelegramBot = require("node-telegram-bot-api");
const http = require("http");
const axios = require("axios");

// Replace with your bot token
const BOT_TOKEN = process.env.BOT_TOKEN;
const YOUR_USER_ID = process.env.USER_ID; // Replace with your Telegram user ID

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const userMessagesSent = new Map();
const mediaGroupTracking = new Map();
const messageTimeout = 15 * 1000; // 15 seconds

function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const senderName = msg.chat.first_name || "Unknown";
  const mediaGroupId = msg.media_group_id;

  try {
    debugLog("Received Message:", msg);

    const fileIds = [];

    // Collect file IDs for photos (mobile)
    if (msg.photo) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      fileIds.push(largestPhoto.file_id);
    }

    // Collect file IDs for documents (web)
    if (msg.document) {
      fileIds.push(msg.document.file_id);
    }

    // Skip processing if no valid files are detected
    if (fileIds.length === 0) {
      return;
    }

    const currentTime = Date.now();
    let shouldShowNotification = false;

    if (mediaGroupId) {
      // Handle media group messages
      const groupInfo = mediaGroupTracking.get(mediaGroupId);
      if (!groupInfo) {
        // This is the first message in the media group
        const lastMessageTime = userMessagesSent.get(chatId);
        shouldShowNotification = !lastMessageTime || (currentTime - lastMessageTime > messageTimeout);
        
        if (shouldShowNotification) {
          userMessagesSent.set(chatId, currentTime);
        }
        
        // Track this media group
        mediaGroupTracking.set(mediaGroupId, {
          notificationShown: shouldShowNotification,
          timestamp: currentTime
        });

        // Clean up old media group entries after timeout
        setTimeout(() => {
          mediaGroupTracking.delete(mediaGroupId);
        }, messageTimeout);
      }
    } else {
      // Handle single image messages
      const lastMessageTime = userMessagesSent.get(chatId);
      shouldShowNotification = !lastMessageTime || (currentTime - lastMessageTime > messageTimeout);
      
      if (shouldShowNotification) {
        userMessagesSent.set(chatId, currentTime);
      }
    }

    // Send notification only if needed
    if (shouldShowNotification) {
      await bot.sendMessage(YOUR_USER_ID, `New photo received from ${senderName}`);
      debugLog("Notification sent", { chatId, senderName, mediaGroupId });
    }

    // Process each file and send it without additional notifications
    for (const fileId of fileIds) {
      try {
        const fileInfo = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
        debugLog("Processing file", fileUrl);

        const response = await axios({
          method: "get",
          url: fileUrl,
          responseType: "arraybuffer",
        });

        if (msg.photo) {
          await bot.sendPhoto(YOUR_USER_ID, response.data, {
            filename: `photo_${fileId}_${Date.now()}.jpg`,
          });
        } else if (msg.document) {
          await bot.sendDocument(YOUR_USER_ID, response.data, {
            filename: msg.document.file_name || `document_${fileId}_${Date.now()}`,
          });
        }
      } catch (error) {
        debugLog("Error processing file", { fileId, error });
      }
    }

    debugLog("Files sent successfully");
  } catch (error) {
    debugLog("Processing Error", error);
  }
});

bot.on("polling_error", (error) => {
  debugLog("Polling Error", error);
});

const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is running.\n");
  })
  .listen(PORT, () => {
    debugLog(`HTTP server running on port ${PORT}`);
  });

debugLog("Bot initialization complete");

