const express = require("express");
const cors = require("cors");
const { Groq } = require("groq-sdk");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// Настройки
const MAX_SESSIONS = 10;
const MAX_TOKENS_PER_SESSION = 20000; // Лимит по токенам для одной сессии

// Инициализация Groq SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Память с ограничением по количеству сессий
const conversationMemory = new Map();

// Подсчёт токенов в сообщениях
function countTokens(messages) {
  return messages.reduce((sum, msg) => {
    // Для упрощения подсчета, здесь можно воспользоваться грубым методом (считаем как количество символов)
    return sum + msg.content.length; // для более точных расчётов используй токенизатор
  }, 0);
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/gpt", async (req, res) => {
  const { message, sessionId = "default" } = req.body;

  // Если новая сессия, создаем её
  if (!conversationMemory.has(sessionId)) {
    if (conversationMemory.size >= MAX_SESSIONS) {
      const oldestSessionId = conversationMemory.keys().next().value;
      conversationMemory.delete(oldestSessionId); // Удаляем старую сессию
    }

    conversationMemory.set(sessionId, [
      { role: "system", content: "Ты умный ассистент. Отвечай на русском языке." }
    ]);
  }

  const sessionHistory = conversationMemory.get(sessionId);

  // Добавляем новое сообщение пользователя
  sessionHistory.push({ role: "user", content: message });

  // Удаляем старые сообщения, если токенов слишком много
  while (countTokens(sessionHistory) > MAX_TOKENS_PER_SESSION && sessionHistory.length > 1) {
    // Удаляем самые старые сообщения, не касаясь system prompt
    sessionHistory.splice(1, 1);
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: sessionHistory
    });

    const reply = chatCompletion.choices[0]?.message?.content || "Нет ответа.";

    // Сохраняем ответ в истории
    sessionHistory.push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    res.status(500).json({ error: "Groq API error", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
