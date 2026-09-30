# Cofre — Controle Financeiro Pessoal 💵🤖

Web app de finanças pessoais com lançamentos, visão mensal, previsão, investimentos e um assistente opcional com Groq.

## O que foi adicionado

### Categorias melhores

**Receitas**
- Salário
- Renda extra
- Reembolso
- Presente
- Rendimentos
- Transferência interna
- Outros

**Gastos**
- Alimentação
- Casa & utilidades
- Transporte
- Saúde & bem-estar
- Pessoal
- Estudos & carreira
- Tecnologia & projetos
- Lazer
- Presentes
- Taxas
- Outros

As opções mudam automaticamente conforme Receita/Gasto.

### Categorização automática

Ao preencher descrição e valor, o app:

1. tenta regras locais rápidas (`Uber` → Transporte, `OpenRouter` → Tecnologia & projetos etc.);
2. se o backend estiver configurado, pede uma classificação à Groq;
3. mostra categoria, confiança e justificativa curta;
4. ainda permite trocar a categoria manualmente.

A chave da Groq **não fica no navegador**.

### Aba IA

- perguntas em linguagem natural sobre os lançamentos;
- escopo do mês exibido ou todo o histórico;
- análise automática do mês;
- totais principais continuam sendo calculados pelo código, não pela LLM.

Exemplos:

- `Quanto gastei com a Yasmin?`
- `Qual foi meu maior gasto não recorrente?`
- `Onde mais gastei este mês?`
- `Quanto gastei com tecnologia?`

## Configurar Google Sheets

O frontend usa `SHEETS_API_URL`.

No Netlify, mantenha a variável de ambiente:

```text
SHEETS_API_URL=https://script.google.com/macros/s/SEU_DEPLOY/exec
```

O `netlify.toml` gera `config.js` durante o build.

Sem `config.js`, o app continua funcionando localmente com `localStorage`, mas a IA fica indisponível.

## Configurar Groq

1. Abra o projeto no **Google Apps Script** da planilha.
2. Substitua/atualize o código com `AppScript_code.gs` deste projeto.
3. Vá em **Configurações do projeto → Propriedades do script**.
4. Crie:

```text
GROQ_API_KEY = gsk_...
```

Opcionalmente, defina o modelo:

```text
GROQ_MODEL = openai/gpt-oss-120b
```

5. Faça um **novo deploy** da aplicação web do Apps Script para publicar o backend atualizado.

> Importante: editar o código do Apps Script sem atualizar o deploy pode deixar o site chamando a versão antiga.

## Compatibilidade com a planilha antiga

A aba `transactions` antiga tinha 8 colunas. A versão atual usa 10:

```text
user_id | id | type | valor | data | cat | desc | updated_at | cat_source | ai_confidence
```

O código atual atualiza os cabeçalhos automaticamente e mantém os lançamentos existentes. As novas colunas ficam vazias nos registros antigos, o que é esperado.

## Arquitetura da IA

```text
Frontend
   │
   ├─ regras locais de categoria
   │
   └─ Google Apps Script
          │
          ├─ lê os lançamentos da própria planilha
          ├─ calcula/compacta o contexto
          └─ Groq API
```

A `GROQ_API_KEY` é lida com `PropertiesService`, portanto não é enviada ao navegador.

## Arquivos

- `index.html` — interface
- `app.js` — lógica do frontend, categorias, regras e chamadas de IA
- `styles.css` — estilos
- `AppScript_code.gs` — backend da planilha + integração Groq
- `netlify.toml` — build do Netlify
## Screenshots

### Visão geral
<img width="1881" height="681" alt="Visão geral do Cofre" src="https://github.com/user-attachments/assets/d12b512b-410e-4616-83ec-e1193f2843dc" />

### Lançamentos
<img width="1882" height="904" alt="Tela de lançamentos" src="https://github.com/user-attachments/assets/a8552062-ca20-4c57-b2da-b22291042d48" />

### Assistente com IA
<img width="1850" height="966" alt="Assistente financeiro com IA" src="https://github.com/user-attachments/assets/eeb23981-ce84-44c4-948f-05f74fd4f2e9" />
