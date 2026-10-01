/* A URL do Apps Script agora vem do config.js (carregado antes deste arquivo no index.html) */
const sheetsConfigured = typeof SHEETS_API_URL !== "undefined" && SHEETS_API_URL.startsWith("http");

/* Identificador fixo da sua "conta" — o mesmo em todos os aparelhos garante que
   celular, computador etc. todos leiam e escrevam os MESMOS dados na planilha.
   Troque o texto abaixo por qualquer palavra/código só seu (ex: "familia-silva-2026"). */
const USER_ID = "meu-cofre-pessoal";

// Camada de armazenamento: usa a planilha (via Apps Script) se configurada, senão cai para localStorage (só neste navegador)
const store = {
  async get(key){
    if(sheetsConfigured){
      const url = `${SHEETS_API_URL}?action=get&user=${encodeURIComponent(USER_ID)}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('Falha ao ler da planilha');
      const json = await res.json();
      return json.value !== undefined ? json.value : null;
    } else {
      const v = localStorage.getItem('cofre_'+key);
      return v ? JSON.parse(v) : null;
    }
  },
  async set(key, value){
    if(sheetsConfigured){
      const res = await fetch(SHEETS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
        body: JSON.stringify({ action:'set', user: USER_ID, key, value })
      });
      if(!res.ok) throw new Error('Falha ao salvar na planilha');
    } else {
      localStorage.setItem('cofre_'+key, JSON.stringify(value));
    }
  },

  // ---- transações: cada uma vira uma linha na aba "transactions", não um JSON gigante numa célula ----
  async getTransactions(){
    if(sheetsConfigured){
      const url = `${SHEETS_API_URL}?action=getTransactions&user=${encodeURIComponent(USER_ID)}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('Falha ao ler transações da planilha');
      const json = await res.json();
      return json.value || [];
    } else {
      const v = localStorage.getItem('cofre_transactions');
      return v ? JSON.parse(v) : [];
    }
  },
  async addTransaction(tx){
    if(sheetsConfigured){
      const res = await fetch(SHEETS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action:'addTransaction', user: USER_ID, transaction: tx })
      });
      if(!res.ok) throw new Error('Falha ao salvar transação');
    } else {
      const list = JSON.parse(localStorage.getItem('cofre_transactions') || '[]');
      list.unshift(tx);
      localStorage.setItem('cofre_transactions', JSON.stringify(list));
    }
  },
  async deleteTransaction(id){
    if(sheetsConfigured){
      const res = await fetch(SHEETS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action:'deleteTransaction', user: USER_ID, id })
      });
      if(!res.ok) throw new Error('Falha ao apagar transação');
    } else {
      const list = JSON.parse(localStorage.getItem('cofre_transactions') || '[]');
      localStorage.setItem('cofre_transactions', JSON.stringify(list.filter(t=>t.id!==id)));
    }
  },
  async aiCall(action, payload={}){
    if(!sheetsConfigured) throw new Error('A IA requer o backend do Google Apps Script configurado.');
    const res = await fetch(SHEETS_API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action, user:USER_ID, ...payload })
    });
    if(!res.ok) throw new Error('Falha ao consultar a IA');
    const json = await res.json();
    if(json.error) throw new Error(json.error);
    return json;
  },
  async aiStatus(){
    if(!sheetsConfigured) return false;
    try{
      const res = await fetch(`${SHEETS_API_URL}?action=aiStatus&user=${encodeURIComponent(USER_ID)}`);
      const json = await res.json();
      return Boolean(json.configured);
    }catch(e){ return false; }
  }
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmt = n => (n<0?'-':'') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});
const fmtShort = n => (n<0?'-':'') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR',{maximumFractionDigits:0});

const CATEGORIES = {
  income: ['Salário','Renda extra','Reembolso','Presente','Rendimentos','Transferência interna','Outros'],
  expense: ['Alimentação','Casa & utilidades','Transporte','Saúde & bem-estar','Pessoal','Estudos & carreira','Tecnologia & projetos','Lazer','Presentes','Taxas','Outros']
};
const LOCAL_CATEGORY_RULES = [
  {type:'expense', cat:'Transporte', re:/\b(uber|99|moto|onibus|ônibus|passagem|combustivel|combustível|gasolina)\b/i},
  {type:'expense', cat:'Alimentação', re:/\b(ifood|i-food|lanche|hamburg|pizza|esfiha|coxinha|espeto|pamonha|acai|açaí|restaurante|ru\b|mercado|padaria|pao|pão)\b/i},
  {type:'expense', cat:'Casa & utilidades', re:/\b(internet|energia|luz|agua|água|aluguel|condominio|condomínio|gas|gás)\b/i},
  {type:'expense', cat:'Saúde & bem-estar', re:/\b(academia|remedio|remédio|farmacia|farmácia|medico|médico|consulta)\b/i},
  {type:'expense', cat:'Estudos & carreira', re:/\b(concurso|curso|livro|prova|certificacao|certificação|faculdade)\b/i},
  {type:'expense', cat:'Tecnologia & projetos', re:/\b(openai|openrouter|groq|api|token|hostgator|dominio|domínio|cloudflare|github)\b/i},
  {type:'expense', cat:'Pessoal', re:/\b(tenis|tênis|roupa|cabelo|barbeiro|calcado|calçado)\b/i},
  {type:'expense', cat:'Lazer', re:/\b(jogo|steam|gog|cinema|dlc|netflix|spotify|crunchyroll)\b/i},
  {type:'income', cat:'Salário', re:/\b(salario|salário|bolsa|pagamento.*estagio|pagamento.*estágio)\b/i},
  {type:'income', cat:'Reembolso', re:/\b(reembolso|devolucao|devolução|pagou|mandou.*pix)\b/i},
  {type:'income', cat:'Presente', re:/\b(presente|bonus|bônus)\b/i}
];

let state = { transactions: [], assets: [], investPct: 50 };
let currentMonthOffset = 0; // 0 = current month
let aiCategorySuggestion = null;
let categoryTouched = false;
let categorizeTimer = null;

function showToast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

async function loadState(){
  if(sheetsConfigured){ showToast('Conectando à planilha...'); }
  try{ state.transactions = await store.getTransactions(); }
  catch(e){ console.error(e); state.transactions = []; showToast('Erro ao carregar (veja configuração)'); }
  try{ state.assets = await store.get('assets') || []; }
  catch(e){ state.assets = []; }
  try{ state.investPct = await store.get('investPct'); if(state.investPct==null) state.investPct = 50; }
  catch(e){ state.investPct = 50; }
  render();
}
async function saveAssets(){
  try{ await store.set('assets', state.assets); }
  catch(e){ console.error(e); showToast('Erro ao salvar'); }
}
async function saveInvestPct(){
  try{ await store.set('investPct', state.investPct); }catch(e){}
}

// ---- Tabs ----
$$('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $$('.view').forEach(v=>v.classList.remove('active'));
    tab.classList.add('active');
    $('#view-'+tab.dataset.view).classList.add('active');
    render();
    if(tab.dataset.view==='ia') refreshAiStatus();
  });
});

// ---- Transaction form ----
let txType = 'income';

function populateCategories(type, selected){
  const sel = $('#txCat');
  const cats = CATEGORIES[type] || CATEGORIES.expense;
  sel.innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if(selected && cats.includes(selected)) sel.value = selected;
  else sel.value = cats[cats.length-1];
}

function localCategory(desc, type){
  const rule = LOCAL_CATEGORY_RULES.find(r=>r.type===type && r.re.test(desc || ''));
  return rule ? {categoria:rule.cat, confianca:.82, motivo:'Regra local', source:'local'} : null;
}

function setCategorySuggestion(result){
  if(!result || !CATEGORIES[txType].includes(result.categoria)) return;
  aiCategorySuggestion = result;
  if(!categoryTouched) $('#txCat').value = result.categoria;
  const pct = Math.round((Number(result.confianca)||0)*100);
  const status = $('#aiCatStatus');
  status.textContent = result.source==='groq' ? `IA ${pct}%` : 'Regra local';
  status.className = 'ai-status ' + (result.source==='groq' ? 'good' : 'local');
  $('#aiCatHint').textContent = `${result.categoria}${result.subcategoria ? ' · '+result.subcategoria : ''}${result.motivo ? ' — '+result.motivo : ''}`;
}

async function inferCategory(){
  const desc = $('#txDesc').value.trim();
  const valor = parseFloat($('#txValor').value);
  if(desc.length < 3) return;

  const local = localCategory(desc, txType);
  if(local) setCategorySuggestion(local);

  if(!sheetsConfigured) return;
  $('#aiCatStatus').textContent = 'Pensando...';
  $('#aiCatStatus').className = 'ai-status';
  try{
    const result = await store.aiCall('aiCategorize', {transaction:{desc, valor:isNaN(valor)?0:valor, type:txType}});
    result.source = 'groq';
    setCategorySuggestion(result);
  }catch(err){
    console.warn('Categorização IA indisponível:', err);
    if(!local){
      $('#aiCatStatus').textContent = 'Manual';
      $('#aiCatStatus').className = 'ai-status warn';
      $('#aiCatHint').textContent = 'IA indisponível. Escolha a categoria manualmente.';
    }
  }
}

function scheduleCategorization(){
  clearTimeout(categorizeTimer);
  categorizeTimer = setTimeout(inferCategory, 550);
}

populateCategories(txType);
$('#typeSeg').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  txType = btn.dataset.type;
  $$('#typeSeg button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  categoryTouched = false;
  aiCategorySuggestion = null;
  populateCategories(txType);
  scheduleCategorization();
});
$('#txDesc').addEventListener('input', ()=>{ categoryTouched=false; scheduleCategorization(); });
$('#txValor').addEventListener('input', scheduleCategorization);
$('#txCat').addEventListener('change', ()=>{
  categoryTouched = true;
  $('#aiCatStatus').textContent = 'Manual';
  $('#aiCatStatus').className = 'ai-status local';
});
$('#txData').valueAsDate = new Date();

$('#txForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const tx = {
    id: Date.now().toString(),
    type: txType,
    desc: $('#txDesc').value.trim(),
    valor: parseFloat($('#txValor').value),
    data: $('#txData').value,
    cat: $('#txCat').value,
    catSource: categoryTouched ? 'manual' : (aiCategorySuggestion?.source || 'manual'),
    aiConfidence: (!categoryTouched && aiCategorySuggestion) ? Number(aiCategorySuggestion.confianca)||null : null
  };
  if(!tx.desc || isNaN(tx.valor)) return;

  state.transactions.unshift(tx);
  try{ await store.addTransaction(tx); }
  catch(e){ console.error(e); showToast('Erro ao salvar'); }

  $('#txForm').reset();
  txType = 'income';
  $$('#typeSeg button').forEach(b=>b.classList.toggle('on', b.dataset.type==='income'));
  populateCategories(txType);
  $('#txData').valueAsDate = new Date();
  categoryTouched = false;
  aiCategorySuggestion = null;
  $('#aiCatStatus').textContent = 'Automática';
  $('#aiCatStatus').className = 'ai-status';
  $('#aiCatHint').textContent = 'Preencha a descrição e o valor. O Cofre tenta classificar sozinho.';
  showToast('Lançamento adicionado');
  render();
});

async function deleteTx(id){
  state.transactions = state.transactions.filter(t=>t.id!==id);
  try{ await store.deleteTransaction(id); }
  catch(e){ console.error(e); showToast('Erro ao apagar'); }
  render();
}

// ---- Asset form ----
$('#assetForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const asset = {
    id: Date.now().toString(),
    nome: $('#aNome').value.trim(),
    ticker: $('#aTicker').value.trim().toUpperCase(),
    qtd: parseFloat($('#aQtd').value),
    precoCompra: parseFloat($('#aPrecoCompra').value),
    precoAtual: parseFloat($('#aPrecoAtual').value)
  };
  if(!asset.nome || isNaN(asset.qtd)) return;
  state.assets.push(asset);
  await saveAssets();
  $('#assetForm').reset();
  showToast('Ativo adicionado');
  render();
});

async function deleteAsset(id){
  state.assets = state.assets.filter(a=>a.id!==id);
  await saveAssets();
  render();
}

// ---- Month helpers ----
function monthKey(offset){
  const d = new Date();
  d.setMonth(d.getMonth()+offset);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabel(offset){
  const d = new Date();
  d.setMonth(d.getMonth()+offset);
  return d.toLocaleDateString('pt-BR',{month:'long', year:'numeric'});
}
function txMonthKey(tx){ return tx.data.slice(0,7); }

function getAllMonthKeys(){
  const keys = new Set(state.transactions.map(txMonthKey));
  return [...keys].sort();
}

// Saldo que chega de todos os meses anteriores a `key`. Derivado dos lançamentos
// a cada render, então nunca desatualiza quando você edita ou apaga algo antes.
function carriedBalance(key){
  let sum = 0;
  for(const t of state.transactions){
    if(txMonthKey(t) >= key) continue;
    sum += t.type==='income' ? t.valor : -t.valor;
  }
  return sum;
}

function monthTotals(key){
  const txs = state.transactions.filter(t=>txMonthKey(t)===key);
  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.valor,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.valor,0);
  const startingBalance = carriedBalance(key);
  return {income, expense, balance: startingBalance + income - expense, txs, startingBalance};
}

// ---- IA ----
function activeMonthKey(){ return monthKey(currentMonthOffset); }

async function refreshAiStatus(){
  const el = $('#aiBackendStatus');
  if(!el) return;
  if(!sheetsConfigured){
    el.textContent = 'Backend ausente'; el.className='pill warn'; return;
  }
  const ok = await store.aiStatus();
  el.textContent = ok ? 'Groq conectada' : 'Configure GROQ_API_KEY';
  el.className = 'pill ' + (ok ? 'good' : 'warn');
}

function setAiLoading(el, text){ el.className='ai-answer'; el.textContent=text; }

function renderAiMarkdown(text) {
  const safe = escapeHtml(String(text || 'Sem resposta.'))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = safe.split(/\r?\n/);
  const html = [];

  let inList = false;
  let inTable = false;
  let tableRows = [];

  function closeList() {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  }

  function flushTable() {
    if (!inTable || !tableRows.length) return;

    const rows = tableRows.filter(row => {
      return !row.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
    });

    if (!rows.length) {
      inTable = false;
      tableRows = [];
      return;
    }

    html.push('<div class="ai-table-wrap"><table class="ai-table">');

    rows.forEach((row, index) => {
      html.push('<tr>');

      row.forEach(cell => {
        const tag = index === 0 ? 'th' : 'td';
        html.push(`<${tag}>${cell.trim()}</${tag}>`);
      });

      html.push('</tr>');
    });

    html.push('</table></div>');

    inTable = false;
    tableRows = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      flushTable();
      continue;
    }

    // tabela markdown
    if (line.startsWith('|') && line.endsWith('|')) {
      closeList();

      const cells = line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim());

      tableRows.push(cells);
      inTable = true;
      continue;
    }

    flushTable();

    // separador ---
    if (/^-{3,}$/.test(line)) {
      closeList();
      html.push('<hr>');
      continue;
    }

    // títulos
    const heading = line.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      closeList();

      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${heading[2]}</h${level}>`);
      continue;
    }

    // citação
    const quote = line.match(/^&gt;\s*(.+)$/);

    if (quote) {
      closeList();
      html.push(`<blockquote>${quote[1]}</blockquote>`);
      continue;
    }

    // lista
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (bullet) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }

      html.push(`<li>${bullet[1]}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${line}</p>`);
  }

  closeList();
  flushTable();

  return html.join('');
}

function setAiResult(el, text) {
  el.className = 'ai-answer';
  el.innerHTML = renderAiMarkdown(text);
}

$('#aiAskForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const question = $('#aiQuestion').value.trim();
  if(!question) return;
  const answer = $('#aiAnswer');
  setAiLoading(answer, 'Analisando seus lançamentos...');
  $('#aiAskBtn').disabled = true;
  try{
    const month = $('#aiScope').value==='month' ? activeMonthKey() : '';
    const res = await store.aiCall('aiAsk', {question, month});
    setAiResult(answer, res.text);
  }catch(err){ setAiResult(answer, 'Não consegui consultar a IA: '+err.message); }
  finally{ $('#aiAskBtn').disabled = false; }
});

$('#aiAnalyzeMonth').addEventListener('click', async ()=>{
  const answer = $('#aiMonthAnswer');
  setAiLoading(answer, 'Lendo o mês e procurando padrões...');
  try{
    const res = await store.aiCall('aiMonthlyAnalysis', {month:activeMonthKey()});
    setAiResult(answer, res.text);
  }catch(err){ setAiResult(answer, 'Não consegui gerar a análise: '+err.message); }
});

// ---- Render ----
function render(){
  renderRecent();
  renderMonth();
  renderForecast();
  renderInvest();
}

function renderRecent(){
  const list = state.transactions.slice(0,8);
  const el = $('#recentList');
  if(!list.length){ el.innerHTML = '<div class="empty">Nenhum lançamento ainda.</div>'; return; }
  el.innerHTML = list.map(t=>`
    <div class="tx">
      <div>
        <div class="desc">${escapeHtml(t.desc)}</div>
        <div class="cat">${t.cat} · ${formatDate(t.data)}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="amt ${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.valor)}</div>
        <div class="del" onclick="deleteTx('${t.id}')">✕</div>
      </div>
    </div>`).join('');
}

function renderMonth(){
  const key = monthKey(currentMonthOffset);
  $('#mLabel').textContent = capitalize(monthLabel(currentMonthOffset));
  const {income, expense, balance, txs, startingBalance} = monthTotals(key);
  const balEl = $('#mBalance');
  balEl.textContent = fmt(balance);
  balEl.className = 'num ' + (balance>=0?'pos':'neg');
  const inhEl = $('#mInherited');
  inhEl.textContent = startingBalance ? 'Saldo anterior: ' + fmt(startingBalance) : '';
  inhEl.style.display = startingBalance ? 'block' : 'none';
  $('#mIncome').textContent = fmtShort(income);
  $('#mExpense').textContent = fmtShort(expense);
  $('#mRate').textContent = income>0 ? Math.round(((income-expense)/income)*100)+'%' : '—';

  // categories
  const cats = {};
  txs.filter(t=>t.type==='expense').forEach(t=>{ cats[t.cat] = (cats[t.cat]||0)+t.valor; });
  const catEl = $('#catBars');
  const entries = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){ catEl.innerHTML = '<div class="empty">Sem gastos neste mês.</div>'; }
  else{
    const max = entries[0][1];
    catEl.innerHTML = entries.map(([cat,val])=>`
      <div class="bar-row">
        <div class="top"><span>${cat}</span><span>${fmt(val)}</span></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${(val/max*100).toFixed(0)}%"></div></div>
      </div>`).join('');
  }

  const listEl = $('#mList');
  if(!txs.length){ listEl.innerHTML = '<div class="empty">Nada por aqui ainda.</div>'; }
  else{
    listEl.innerHTML = txs.map(t=>`
      <div class="tx">
        <div>
          <div class="desc">${escapeHtml(t.desc)}</div>
          <div class="cat">${t.cat} · ${formatDate(t.data)}</div>
        </div>
        <div style="display:flex;align-items:center;">
          <div class="amt ${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.valor)}</div>
          <div class="del" onclick="deleteTx('${t.id}')">✕</div>
        </div>
      </div>`).join('');
  }
}

$('#mPrev').addEventListener('click', ()=>{ currentMonthOffset--; renderMonth(); });
$('#mNext').addEventListener('click', ()=>{ if(currentMonthOffset<0){ currentMonthOffset++; renderMonth(); } });

function renderForecast(){
  const keys = getAllMonthKeys();
  const thisKey = monthKey(0);
  const pastKeys = keys.filter(k=>k<=thisKey); // include months up to now
  let avgIncome=0, avgExpense=0;
  if(pastKeys.length){
    const totals = pastKeys.map(monthTotals);
    avgIncome = totals.reduce((s,t)=>s+t.income,0)/totals.length;
    avgExpense = totals.reduce((s,t)=>s+t.expense,0)/totals.length;
  }
  const free = avgIncome - avgExpense;
  $('#pIncome').textContent = pastKeys.length? fmtShort(avgIncome) : '—';
  $('#pExpense').textContent = pastKeys.length? fmtShort(avgExpense) : '—';
  $('#pFree').textContent = pastKeys.length? fmtShort(free) : '—';

  const pct = state.investPct;
  $('#investPct').value = pct;
  $('#pctLabel').textContent = pct+'%';
  const investAmt = Math.max(free,0) * (pct/100);
  const reserveAmt = Math.max(free,0) - investAmt;
  $('#pInvest').textContent = pastKeys.length? fmtShort(investAmt) : '—';
  $('#pReserve').textContent = pastKeys.length? fmtShort(reserveAmt) : '—';

  const histEl = $('#histList');
  if(!keys.length){ histEl.innerHTML = '<div class="empty">Registre alguns meses para ver o histórico.</div>'; }
  else{
    const sorted = [...keys].sort().reverse().slice(0,6);
    histEl.innerHTML = sorted.map(k=>{
      const t = monthTotals(k);
      const [y,m] = k.split('-');
      const label = capitalize(new Date(y, m-1, 1).toLocaleDateString('pt-BR',{month:'long', year:'numeric'}));
      return `<div class="tx">
        <div class="desc">${label}</div>
        <div class="amt ${t.balance>=0?'income':'expense'}">${fmt(t.balance)}</div>
      </div>`;
    }).join('');
  }
}

$('#investPct').addEventListener('input', async e=>{
  state.investPct = parseInt(e.target.value);
  $('#pctLabel').textContent = state.investPct+'%';
  await saveInvestPct();
  renderForecast();
});

function renderInvest(){
  let totalInvested=0, totalCurrent=0;
  const el = $('#assetList');
  if(!state.assets.length){
    el.innerHTML = '<div class="empty">Nenhum ativo cadastrado ainda.</div>';
  } else {
    el.innerHTML = state.assets.map(a=>{
      const investedVal = a.qtd*a.precoCompra;
      const currentVal = a.qtd*a.precoAtual;
      totalInvested += investedVal; totalCurrent += currentVal;
      const pnl = currentVal-investedVal;
      const pnlPct = investedVal? (pnl/investedVal*100) : 0;
      return `<div class="asset">
        <div class="head">
          <div><span class="name">${escapeHtml(a.nome)}</span> <span class="ticker">${a.ticker}</span></div>
          <div class="del" onclick="deleteAsset('${a.id}')">✕</div>
        </div>
        <div class="pnl ${pnl>=0?'pos':'neg'}">${pnl>=0?'+':''}${fmt(pnl)} (${pnl>=0?'+':''}${pnlPct.toFixed(1)}%)</div>
        <div class="meta">
          <span>Qtd: ${a.qtd}</span>
          <span>Investido: ${fmt(investedVal)}</span>
          <span>Atual: ${fmt(currentVal)}</span>
        </div>
      </div>`;
    }).join('');
  }
  $('#totalInvested').textContent = fmt(totalCurrent);
  const totalPnl = totalCurrent-totalInvested;
  const pnlPctTotal = totalInvested? (totalPnl/totalInvested*100):0;
  const pnlEl = $('#totalPnl');
  pnlEl.textContent = state.assets.length ? `${totalPnl>=0?'+':''}${fmt(totalPnl)} (${totalPnl>=0?'+':''}${pnlPctTotal.toFixed(1)}%)` : '—';
  pnlEl.style.color = totalPnl>=0 ? 'var(--green)' : 'var(--red)';
}

function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatDate(d){ const [y,m,day]=d.split('-'); return `${day}/${m}`; }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

if(!sheetsConfigured){ document.getElementById('configWarning').style.display = 'block'; }
loadState();
refreshAiStatus();
