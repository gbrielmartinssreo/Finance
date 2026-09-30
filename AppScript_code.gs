/**
 * COFRE — API da planilha + IA (Groq)
 *
 * Configure a chave Groq em:
 * Apps Script > Configurações do projeto > Propriedades do script
 * Nome: GROQ_API_KEY
 * Valor: sua chave gsk_...
 *
 * Opcional:
 * GROQ_MODEL = llama-3.3-70b-versatile
 */

const SHEET_NAME = "dados";
const TX_SHEET_NAME = "transactions";
const TX_HEADERS = [
  "user_id", "id", "type", "valor", "data", "cat", "desc", "updated_at",
  "cat_source", "ai_confidence"
];

const CATEGORIES = {
  income: ["Salário", "Renda extra", "Reembolso", "Presente", "Rendimentos", "Transferência interna", "Outros"],
  expense: ["Alimentação", "Casa & utilidades", "Transporte", "Saúde & bem-estar", "Pessoal", "Estudos & carreira", "Tecnologia & projetos", "Lazer", "Presentes", "Taxas", "Outros"]
};

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["user_id", "key", "value", "updated_at"]);
  }
  return sheet;
}

function findRow_(sheet, userId, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][1] === key) return i + 1;
  }
  return -1;
}

function getTxSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TX_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TX_SHEET_NAME);
    sheet.getRange(1, 1, 1, TX_HEADERS.length).setValues([TX_HEADERS]);
  } else {
    // Mantém compatibilidade com planilhas antigas de 8 colunas.
    sheet.getRange(1, 1, 1, TX_HEADERS.length).setValues([TX_HEADERS]);
  }
  return sheet;
}

function findTxRow_(sheet, userId, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === userId && String(data[i][1]) === String(id)) return i + 2;
  }
  return -1;
}

function addTransaction_(userId, tx) {
  const sheet = getTxSheet_();
  const now = new Date().toISOString();
  const row = findTxRow_(sheet, userId, tx.id);
  const values = [
    userId, tx.id, tx.type || "", Number(tx.valor) || 0, tx.data || "",
    tx.cat || "Outros", tx.desc || "", now, tx.catSource || "manual",
    Number(tx.aiConfidence) || ""
  ];
  if (row === -1) sheet.appendRow(values);
  else sheet.getRange(row, 1, 1, TX_HEADERS.length).setValues([values]);
}

function deleteTransaction_(userId, id) {
  const sheet = getTxSheet_();
  const row = findTxRow_(sheet, userId, id);
  if (row !== -1) {
    sheet.deleteRow(row);
    return true;
  }
  return false;
}

function getTransactions_(userId) {
  const sheet = getTxSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, TX_HEADERS.length).getValues();
  return data.filter(r => r[0] === userId).map(r => ({
    id: String(r[1]), type: r[2], valor: Number(r[3]) || 0,
    data: normalizeDate_(r[4]), cat: r[5], desc: r[6], updated_at: r[7],
    catSource: r[8] || "manual", aiConfidence: Number(r[9]) || null
  }));
}

function normalizeDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v || "").slice(0, 10);
}

function doGet(e) {
  const action = e.parameter.action;
  const userId = e.parameter.user;

  if (action === "getTransactions") {
    if (!userId) return jsonOutput_({ error: "parâmetros inválidos" });
    return jsonOutput_({ value: getTransactions_(userId) });
  }

  if (action === "aiStatus") {
    return jsonOutput_({ configured: Boolean(getGroqApiKey_()) });
  }

  const key = e.parameter.key;
  if (action !== "get" || !userId || !key) return jsonOutput_({ error: "parâmetros inválidos" });

  const sheet = getSheet_();
  const row = findRow_(sheet, userId, key);
  if (row === -1) return jsonOutput_({ value: null });
  const rawValue = sheet.getRange(row, 3).getValue();
  let value;
  try { value = JSON.parse(rawValue); } catch (err) { value = rawValue; }
  return jsonOutput_({ value });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOutput_({ error: "corpo inválido" }); }

  const action = body.action;
  const userId = body.user;

  if (action === "addTransaction") {
    if (!userId || !body.transaction || !body.transaction.id) return jsonOutput_({ error: "parâmetros inválidos" });
    addTransaction_(userId, body.transaction);
    return jsonOutput_({ ok: true });
  }

  if (action === "deleteTransaction") {
    if (!userId || !body.id) return jsonOutput_({ error: "parâmetros inválidos" });
    return jsonOutput_({ ok: deleteTransaction_(userId, body.id) });
  }

  if (action === "aiCategorize") {
    try {
      return jsonOutput_(aiCategorize_(body.transaction || {}));
    } catch (err) {
      return jsonOutput_({ error: err.message || String(err) });
    }
  }

  if (action === "aiMonthlyAnalysis") {
    if (!userId || !body.month) return jsonOutput_({ error: "parâmetros inválidos" });
    try {
      return jsonOutput_(aiMonthlyAnalysis_(userId, body.month));
    } catch (err) {
      return jsonOutput_({ error: err.message || String(err) });
    }
  }

  if (action === "aiAsk") {
    if (!userId || !body.question) return jsonOutput_({ error: "parâmetros inválidos" });
    try {
      return jsonOutput_(aiAsk_(userId, body.question, body.month || ""));
    } catch (err) {
      return jsonOutput_({ error: err.message || String(err) });
    }
  }

  const key = body.key;
  const value = body.value;
  if (action !== "set" || !userId || !key) return jsonOutput_({ error: "parâmetros inválidos" });

  const sheet = getSheet_();
  const row = findRow_(sheet, userId, key);
  const valueStr = JSON.stringify(value);
  const now = new Date().toISOString();
  if (row === -1) sheet.appendRow([userId, key, valueStr, now]);
  else {
    sheet.getRange(row, 3).setValue(valueStr);
    sheet.getRange(row, 4).setValue(now);
  }
  return jsonOutput_({ ok: true });
}

// ---------------- IA / GROQ ----------------

function getGroqApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY") || "";
}

function getGroqModel_() {
  return PropertiesService.getScriptProperties().getProperty("GROQ_MODEL") || "openai/gpt-oss-120b";
}

function callGroq_(messages, jsonMode) {
  const apiKey = getGroqApiKey_();
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada nas Propriedades do script.");

  const payload = {
    model: getGroqModel_(),
    messages: messages,
    temperature: 0.15,
    max_completion_tokens: 900
  };
  if (jsonMode) payload.response_format = { type: "json_object" };
  if (String(payload.model).indexOf("openai/gpt-oss-") === 0) {
    payload.reasoning_effort = "low";
    payload.reasoning_format = "hidden";
  }

  const response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) throw new Error("Groq respondeu HTTP " + status + ": " + text.slice(0, 300));

  const data = JSON.parse(text);
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("Resposta vazia da Groq.");
  return content;
}

function parseJsonLoose_(text) {
  try { return JSON.parse(text); } catch (e) {}
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("A IA não retornou JSON válido.");
  return JSON.parse(match[0]);
}

function aiCategorize_(tx) {
  const type = tx.type === "income" ? "income" : "expense";
  const allowed = CATEGORIES[type];
  const prompt = [
    "Você classifica transações financeiras pessoais brasileiras.",
    "Escolha EXATAMENTE uma categoria da lista permitida.",
    "Não invente categorias. Use 'Outros' somente quando realmente não houver opção melhor.",
    "Categorias: " + allowed.join(" | "),
    "Transação: " + JSON.stringify({ descricao: tx.desc || "", valor: Number(tx.valor) || 0, tipo: type }),
    "Retorne somente JSON no formato:",
    '{"categoria":"...","subcategoria":"...","confianca":0.0,"motivo":"frase curta"}'
  ].join("\n");

  const obj = parseJsonLoose_(callGroq_([
    { role: "system", content: "Responda apenas JSON válido. A confiança deve estar entre 0 e 1." },
    { role: "user", content: prompt }
  ], true));

  if (!allowed.includes(obj.categoria)) obj.categoria = "Outros";
  obj.confianca = Math.max(0, Math.min(1, Number(obj.confianca) || 0));
  return obj;
}

function txSummary_(txs) {
  const income = txs.filter(t => t.type === "income").reduce((s,t) => s + Number(t.valor || 0), 0);
  const expense = txs.filter(t => t.type === "expense").reduce((s,t) => s + Number(t.valor || 0), 0);
  const categories = {};
  txs.filter(t => t.type === "expense").forEach(t => categories[t.cat || "Outros"] = (categories[t.cat || "Outros"] || 0) + Number(t.valor || 0));
  return { income, expense, result: income - expense, categories };
}

function compactTransactions_(txs, maxItems) {
  return txs.slice(0, maxItems || 180).map(t => ({
    data: t.data, tipo: t.type, descricao: t.desc, valor: t.valor, categoria: t.cat
  }));
}

function aiMonthlyAnalysis_(userId, month) {
  const all = getTransactions_(userId);
  const txs = all.filter(t => String(t.data).slice(0,7) === month);
  if (!txs.length) return { text: "Não há lançamentos nesse mês para analisar." };
  const summary = txSummary_(txs);
  const content = callGroq_([
    { role: "system", content: "Você é um analista financeiro pessoal. Seja objetivo, não dê aconselhamento financeiro profissional e não invente dados. Valores estão em reais." },
    { role: "user", content:
      "Analise o mês " + month + ". Destaque: 1) panorama, 2) maiores gastos/categorias, 3) padrões ou gastos incomuns, 4) uma ação prática. " +
      "Não faça cálculos novos se puder usar os totais fornecidos.\nResumo calculado pelo sistema: " + JSON.stringify(summary) +
      "\nLançamentos: " + JSON.stringify(compactTransactions_(txs, 120))
    }
  ], false);
  return { text: content };
}

function aiAsk_(userId, question, month) {
  let txs = getTransactions_(userId).sort((a,b) => String(b.data).localeCompare(String(a.data)));
  if (month) txs = txs.filter(t => String(t.data).slice(0,7) === month);
  const summary = txSummary_(txs);
  const content = callGroq_([
    { role: "system", content:
      "Você responde perguntas sobre as finanças pessoais usando SOMENTE os dados fornecidos. " +
      "Se não houver dados suficientes, diga isso claramente. Não invente transações. " +
      "Faça contas simples com cuidado e cite os lançamentos relevantes de forma curta quando ajudar. Valores estão em reais."
    },
    { role: "user", content:
      "Pergunta: " + question +
      "\nEscopo do mês (vazio significa histórico disponível): " + (month || "todos") +
      "\nResumo calculado: " + JSON.stringify(summary) +
      "\nLançamentos: " + JSON.stringify(compactTransactions_(txs, 180))
    }
  ], false);
  return { text: content };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- migração única do JSON antigo ----------
function migrateExistingTransactions() {
  const dataSheet = getSheet_();
  const data = dataSheet.getDataRange().getValues();
  let migrated = 0;
  for (let i = 1; i < data.length; i++) {
    const userId = data[i][0];
    if (data[i][1] !== "transactions") continue;
    let list;
    try { list = JSON.parse(data[i][2]); } catch (err) { continue; }
    if (!Array.isArray(list)) continue;
    list.forEach(tx => { addTransaction_(userId, tx); migrated++; });
  }
  Logger.log("Transações migradas: " + migrated);
}
