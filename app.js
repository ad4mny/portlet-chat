"use strict";

const STORAGE_KEY = "portlet-chat.v1";
const DISCOVERY_TIMEOUT_MS = 5000;
const element = (id) => document.getElementById(id);
const apiKeys = new Map();
let endpoints = [];
let chats = [];
let activeChatId = "";
let editingEndpointUrl = null;
let messages = [];
let models = [];
let selectedModel = "";
let chatController = null;
let refreshing = false;

function setStatus(message) {
  element("status").textContent = message;
}

function saveState() {
  const chat = chats.find((entry) => entry.id === activeChatId);
  if (chat) { chat.messages = messages; chat.selectedModel = selectedModel; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endpoints, chats, activeChatId, selectedModel }));
  } catch {
    setStatus("Browser storage is unavailable or full. Changes will last only until reload.");
  }
}

function normalizeUrl(value) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTP(S) base URL without credentials, a query, or a fragment.");
  }
  return url.href.replace(/\/+$/, "");
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    endpoints = (saved.endpoints || []).map(({ name, url }) => {
      if (typeof name !== "string") throw new Error("Invalid endpoint name.");
      return { name, url: normalizeUrl(url) };
    });
    const cleanMessages = (entries) => (Array.isArray(entries) ? entries : []).filter((message) =>
      message && ["user", "assistant"].includes(message.role) && typeof message.content === "string"
    ).map((message) => ({ ...message, status: message.status === "pending" ? "failed" : message.status }));
    chats = (Array.isArray(saved.chats) ? saved.chats : []).filter((chat) => chat && typeof chat.id === "string").map((chat) => ({
      ...chat, messages: cleanMessages(chat.messages)
    }));
    if (!chats.length && saved.messages?.length) {
      chats.push({ id: crypto.randomUUID(), messages: cleanMessages(saved.messages), selectedModel: saved.selectedModel || "" });
    }
    const chat = chats.find((entry) => entry.id === saved.activeChatId) || chats[0];
    if (chat) {
      activeChatId = chat.id;
      messages = chat.messages;
      selectedModel = chat.selectedModel || saved.selectedModel || "";
    }

  } catch {
    setStatus("Saved settings could not be read. Add your endpoints again.");
  }
}

function startChat() {
  saveState();
  const chat = { id: crypto.randomUUID(), messages: [], selectedModel };
  chats.unshift(chat);
  activeChatId = chat.id;
  messages = chat.messages;
  saveState();
  renderMessages();
  setStatus("");
  element("prompt").value = "";
  element("prompt").focus();
}

function renderHistory() {
  element("chat-list").replaceChildren();
  for (const chat of chats) {
    const button = document.createElement("button");
    button.textContent = chat.messages.find((message) => message.role === "user")?.content.slice(0, 80) || "New chat";
    button.setAttribute("aria-current", String(chat.id === activeChatId));
    button.addEventListener("click", () => {
      saveState();
      activeChatId = chat.id;
      messages = chat.messages;
      selectedModel = chat.selectedModel || "";
      element("model").value = models.some((model) => model.value === selectedModel) ? selectedModel : "";
      element("prompt").value = "";
      renderMessages();
      updateControls();
      saveState();
      setStatus("");
      element("history-dialog").close();
    });
    const row = document.createElement("div");
    row.className = "chat-row";
    const remove = document.createElement("button");
    remove.className = "delete-chat";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete chat: ${button.textContent}`);
    remove.addEventListener("click", () => deleteChat(chat.id));
    row.append(button, remove);
    element("chat-list").append(row);
  }
}

function deleteChat(id) {
  if (chatController || refreshing || !chats.some((chat) => chat.id === id)) return;
  if (!window.confirm("Delete this chat permanently? This cannot be undone.")) return;
  chats = chats.filter((chat) => chat.id !== id);
  if (activeChatId === id) {
    const nextChat = chats[0];
    if (nextChat) {
      activeChatId = nextChat.id;
      messages = nextChat.messages;
      selectedModel = nextChat.selectedModel || "";
      element("model").value = models.some((model) => model.value === selectedModel) ? selectedModel : "";
      element("prompt").value = "";
      renderMessages();
      setStatus("");
    } else startChat();
  }
  saveState();
  renderHistory();
  updateControls();
}

function headersFor(endpoint) {
  const headers = { "Content-Type": "application/json" };
  const key = apiKeys.get(endpoint.url);
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function updateControls() {
  const busy = Boolean(chatController);
  element("send").disabled = busy || refreshing || !element("model").value;
  element("send").hidden = busy;
  element("stop").hidden = !busy;
  for (const id of ["model", "new-chat", "settings", "connect", "history"]) element(id).disabled = busy || refreshing;
  element("refresh").disabled = busy || refreshing;
  element("refresh").textContent = refreshing ? "Refreshing…" : "Refresh";
  document.querySelectorAll(".retry").forEach((button) => { button.disabled = busy || refreshing || !element("model").value; });
}

async function refreshModels() {
  if (refreshing || chatController) return;
  refreshing = true;
  updateControls();
  setStatus(endpoints.length ? "Looking for models…" : "Add your OpenAI-compatible server in Endpoints.");
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const response = await fetch(`${endpoint.url}/models`, {
      headers: headersFor(endpoint), signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error("Expected a models list in data");
    return body.data.filter((model) => typeof model.id === "string").map((model) => ({
      id: model.id, endpoint, value: JSON.stringify([endpoint.url, model.id])
    }));
  }));
  models = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const select = element("model");
  select.replaceChildren();
  for (const model of models) select.add(new Option(`${model.id} · ${model.endpoint.name}`, model.value));
  if (!models.length) select.add(new Option("No models available", ""));
  if (models.some((model) => model.value === selectedModel)) select.value = selectedModel;
  else if (!selectedModel) select.value = (models.find((model) => model.id.startsWith("/")) || models[0])?.value || "";
  else {
    select.add(new Option("Previous model unavailable — choose a model", ""));
    select.value = "";
  }
  if (select.value) selectedModel = select.value;
  const unavailable = results.flatMap((result, index) => result.status === "rejected"
    ? [`${endpoints[index].name}: unavailable (${result.reason.message}). Check server, key, and CORS.`] : []);
  if (endpoints.length) setStatus([`${models.length} model${models.length === 1 ? "" : "s"} listed by servers. Download/load status is not provided.`, ...unavailable].join("\n"));
  refreshing = false;
  saveState();
  updateControls();
}

function appendMessage(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  const heading = document.createElement("h3");
  heading.textContent = message.role === "user" ? "You" : "Assistant";
  const content = document.createElement("div");
  content.className = "message-content";
  content.replaceChildren(renderMarkdown(message.content));
  article.append(heading, content);
  if (message.status === "failed" || message.status === "stopped") {
    const error = document.createElement("small");
    error.className = "message-error";
    error.textContent = message.error || "Reply interrupted. You can retry this message.";
    const retry = document.createElement("button");
    retry.className = "retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => retryMessage(index));
    article.append(error, retry);
  }
  element("messages").append(article);
  return content;
}

function renderMessages() {
  element("messages").replaceChildren();
  messages.forEach(appendMessage);
  // Older versions saved failed sends as an unanswered final user message.
  if (messages.at(-1)?.role === "user") {
    const retry = document.createElement("button");
    retry.className = "retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => generateReply());
    element("messages").lastElementChild.append(retry);
  }
  element("welcome").hidden = messages.length > 0;
}

function renderEndpoints() {
  element("endpoint-list").replaceChildren();
  for (const endpoint of endpoints) {
    const row = document.createElement("li");
    const info = document.createElement("div");
    info.className = "endpoint-info";
    const name = document.createElement("strong");
    name.textContent = endpoint.name;
    const url = document.createElement("small");
    url.textContent = endpoint.url;
    info.append(name, url);
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingEndpointUrl = endpoint.url;
      element("endpoint-name").value = endpoint.name;
      element("endpoint-url").value = endpoint.url;
      element("endpoint-key").value = apiKeys.get(endpoint.url) || "";
      element("endpoint-url").focus();
    });
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      endpoints = endpoints.filter((entry) => entry.url !== endpoint.url);
      apiKeys.delete(endpoint.url);
      saveState();
      renderEndpoints();
    });
    row.append(info, edit, remove);
    element("endpoint-list").append(row);
  }
}

function fillEndpointDefaults() {
  const endpoint = endpoints.find((entry) => entry.url === editingEndpointUrl) || endpoints.at(-1);
  editingEndpointUrl = endpoint?.url || null;
  element("endpoint-name").value = endpoint?.name || "Local server";
  element("endpoint-url").value = endpoint?.url || "http://localhost:8080/v1";
  element("endpoint-key").value = apiKeys.get(endpoint?.url) || "";
}

function openSettings() {
  fillEndpointDefaults();
  renderEndpoints();
  element("endpoint-dialog").showModal();
}

element("endpoint-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const name = element("endpoint-name").value.trim();
    if (!name) throw new Error("Enter a name for this endpoint.");
    const url = normalizeUrl(element("endpoint-url").value);
    const existing = endpoints.find((endpoint) => endpoint.url === editingEndpointUrl);
    if (endpoints.some((endpoint) => endpoint.url === url && endpoint !== existing)) throw new Error("That URL is already saved. Edit its existing entry.");
    if (existing) {
      apiKeys.delete(existing.url);
      existing.name = name;
      existing.url = url;
    } else endpoints.push({ name, url });
    editingEndpointUrl = url;
    apiKeys.set(url, element("endpoint-key").value.trim());
    saveState();
    fillEndpointDefaults();
    element("endpoint-error").textContent = "";
    renderEndpoints();
  } catch (error) {
    element("endpoint-error").textContent = error.message;
  }
});

// Decode complete SSE lines; network chunks can split both UTF-8 and JSON.
async function readCompletion(response, onText) {
  if (!response.body) throw new Error("This server returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];
  let finished = false;
  function dispatchEvent() {
    if (!dataLines.length) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (data === "[DONE]") { finished = true; return; }
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(chunk.error.message || "The server returned a stream error.");
    const choice = chunk.choices?.[0];
    const text = choice?.delta?.content;
    if (typeof text === "string") onText(text);
    if (choice?.finish_reason) finished = true;
  }
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      if (done && buffer) { lines.push(buffer); buffer = ""; }
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (!line) dispatchEvent();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        if (finished) break;
      }
      if (done) { dispatchEvent(); break; }
    }
    if (!finished) throw new Error("The stream ended early. Any partial reply has been kept.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const prompt = element("prompt").value.trim();
  if (!prompt || !element("model").value || chatController || refreshing) return;
  messages.push({ role: "user", content: prompt });
  element("prompt").value = "";
  await generateReply();
}

async function retryMessage(index) {
  if (chatController || refreshing || !element("model").value) return;
  if (index < messages.length - 1) {
    // Keep later turns intact by retrying an older failure in a separate chat.
    const prefix = messages.slice(0, index).map((message) => ({ ...message }));
    startChat();
    messages.push(...prefix);
  } else messages.splice(index);
  await generateReply();
}

async function generateReply() {
  const model = models.find((entry) => entry.value === element("model").value);
  if (!model || chatController || refreshing) return;
  chatController = new AbortController();
  const requestMessages = messages.filter((message) => message.content && !["failed", "stopped"].includes(message.status)).map(({ role, content }) => ({ role, content }));
  const reply = { role: "assistant", content: "", status: "pending" };
  messages.push(reply);
  renderMessages();
  const output = element("messages").lastElementChild.querySelector(".message-content");
  element("prompt").value = "";
  setStatus("Waiting for the model…");
  saveState();
  updateControls();
  try {
    const response = await fetch(`${model.endpoint.url}/chat/completions`, {
      method: "POST", headers: headersFor(model.endpoint), signal: chatController.signal,
      body: JSON.stringify({ model: model.id, messages: requestMessages, stream: true })
    });
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}. Check the model and API key.`);
    await readCompletion(response, (text) => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
      reply.content += text;
      output.replaceChildren(renderMarkdown(reply.content));
      setStatus("Receiving reply…");
      if (nearBottom) window.scrollTo(0, document.documentElement.scrollHeight);
    });
    if (!reply.content) throw new Error("The server finished without text. This client supports text content only.");
    reply.status = "complete";
    setStatus("");
  } catch (error) {
    reply.status = chatController.signal.aborted ? "stopped" : "failed";
    reply.error = chatController.signal.aborted ? "Stopped. Any partial reply has been kept." : `${error.message} Check server connectivity and CORS if needed.`;
    setStatus(reply.error);
  } finally {
    chatController = null;
    saveState();
    renderMessages();
    updateControls();
    element("prompt").focus();
  }
}

element("composer").addEventListener("submit", sendMessage);
element("prompt").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    element("composer").requestSubmit();
  }
});
element("stop").addEventListener("click", () => chatController?.abort());
element("refresh").addEventListener("click", refreshModels);
element("settings").addEventListener("click", openSettings);
element("connect").addEventListener("click", openSettings);
element("close-settings").addEventListener("click", () => element("endpoint-dialog").close());
element("endpoint-dialog").addEventListener("close", () => {
  element("endpoint-form").reset();
  refreshModels();
});
element("model").addEventListener("change", () => {
  selectedModel = element("model").value;
  updateControls();
  saveState();
});
element("new-chat").addEventListener("click", startChat);
element("history").addEventListener("click", () => {
  renderHistory();
  element("history-dialog").showModal();
});
element("close-history").addEventListener("click", () => element("history-dialog").close());
element("add-endpoint").addEventListener("click", () => {
  editingEndpointUrl = null;
  element("endpoint-form").reset();
  element("endpoint-name").value = "Local server";
  element("endpoint-url").value = "http://localhost:8080/v1";
  element("endpoint-name").focus();
});

loadState();
if (!chats.length) startChat();
renderMessages();
if (endpoints.length) refreshModels();
else updateControls();
