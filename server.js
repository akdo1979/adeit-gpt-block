const express = require("express");
const cors = require("cors");
const { Groq } = require("groq-sdk");
const { LlamaTokenizer } = require("llama-tokenizer-js");
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

// Инициализация токенизатора
const tokenizer = new LlamaTokenizer();

// Память с ограничением по количеству сессий
const conversationMemory = new Map();

// Подсчёт токенов с использованием токенизатора
async function countTokens(messages) {
  let totalTokens = 0;
  for (const msg of messages) {
    const tokens = await tokenizer.encode(msg.content);
    totalTokens += tokens.length;
  }
  return totalTokens;
}

// Очистка старых сессий
function cleanupSessions() {
  if (conversationMemory.size >= MAX_SESSIONS) {
    const oldestSessionId = conversationMemory.keys().next().value;
    conversationMemory.delete(oldestSessionId); // Удаляем самую старую сессию
  }
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/gpt", async (req, res) => {
  const { message, sessionId = "default" } = req.body;

  // Если новая сессия, создаем её
  if (!conversationMemory.has(sessionId)) {
    cleanupSessions(); // Очистка старых сессий

    // Создание новой сессии
    conversationMemory.set(sessionId, [
      { role: "system", content: "Ты умный ассистент. Отвечай на русском языке." }
    ]);
  }

  const sessionHistory = conversationMemory.get(sessionId);

  // Добавляем новое сообщение пользователя
  sessionHistory.push({ role: "user", content: message });

  // Логирование текущего количества токенов перед удалением
  console.log(`Текущие токены в сессии: ${await countTokens(sessionHistory)} / ${MAX_TOKENS_PER_SESSION} токенов`);

  // Удаляем старые сообщения, если токенов слишком много
  while (await countTokens(sessionHistory) > MAX_TOKENS_PER_SESSION && sessionHistory.length > 1) {
    console.log(`Удаляем старое сообщение, текущее количество сообщений: ${sessionHistory.length}`);
    sessionHistory.shift(); // Удаляет старые сообщения (не system prompt)
  }

  // Логирование после очистки старых сообщений
  console.log(`После очистки, текущее количество токенов: ${await countTokens(sessionHistory)}`);

  try {
    const chatCompletion = await groq.chat.completions.create({
      model: "Llama 3.1 8B Instant",
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