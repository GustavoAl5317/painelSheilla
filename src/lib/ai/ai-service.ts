export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  shouldTransferToHuman: boolean;
  triageComplete: boolean;
  qualifiedData?: {
    name?: string;
    phone?: string;
    email?: string;
    cpf?: string;
    legalArea?: string;
    caseSummary?: string;
    score: number;
  };
}

export interface AIServiceConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  systemPrompt: string;
  transferKeywords: string[];
}

// Rede de segurança: mesmo quando o prompt manda incluir [TRANSFERIR_PARA_HUMANO],
// o modelo às vezes esquece a tag na resposta. Se o texto já anuncia que vai
// encaminhar/repassar o caso para a Dra. Sheila ou a equipe, trata como transferência
// de qualquer forma — evita a IA falar duas vezes com o cliente (uma avisando o
// repasse, outra confirmando de novo) enquanto a conversa já devia ser do humano.
const HANDOFF_ACTION = /\bencaminh|\brepass|\bacionar\b|\bnotificad|\bnotificamos\b|passar (a )?sua mensagem/;
const HANDOFF_TARGET = /\bdras?\b|\bdoutora\b|\bsheila\b|\bequipe\b|\badvogad|\bjur[ií]dic/;

function announcesHandoffToHuman(text: string): boolean {
  const normalized = text.toLowerCase();
  return HANDOFF_ACTION.test(normalized) && HANDOFF_TARGET.test(normalized);
}

// ─── Trava: contato novo tem que passar pela triagem ──────────────────────────
// As duas frases de encaminhamento genérico existem para casos que a IA não
// consegue classificar. Na prática elas viraram atalho: a primeira mensagem de
// um lead novo é quase sempre "assunto não claro", então a IA encaminhava sem
// fazer triagem nenhuma — e, como o encaminhamento desativa a IA na conversa,
// aquele contato nunca mais era triado.
const GENERIC_HANDOFF_PHRASES = [
  /ser[áa] encaminhada à dra\.? sheila/i,
  /encaminhar sua mensagem para a dra\.? sheila/i,
];

function isGenericHandoff(text: string): boolean {
  return GENERIC_HANDOFF_PHRASES.some(re => re.test(text));
}

export async function runAIChat(
  config: AIServiceConfig,
  history: AIMessage[],
  userMessage: string,
  options?: {
    clientContext?: string;
    hasMedia?: boolean;
    operatorIntervened?: boolean;
    contactName?: string;
    triageState?: string;
    triagePending?: boolean;
  }
): Promise<AIResponse> {
  const { clientContext, hasMedia = false, operatorIntervened = false, contactName, triageState, triagePending = false } = options ?? {};
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(config.systemPrompt, clientContext, hasMedia, operatorIntervened, contactName, triageState) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Temperatura baixa: o fluxo de triagem é determinístico e 0.7 produzia
  // respostas fora de contexto (dispensa indevida, troca de módulo).
  const askModel = (msgs: AIMessage[]) =>
    config.provider === "openai"
      ? callOpenAI(config.apiKey, config.model, msgs, 0.2)
      : callAnthropic(config.apiKey, config.model, msgs, 0.2);

  // Roda resposta ao cliente e extração de dados em paralelo
  const [firstResponse, qualifiedData] = await Promise.all([
    askModel(messages),
    extractQualifiedDataWithAI(config.apiKey, config.provider, config.model, history, userMessage),
  ]);

  // Contato novo com triagem pendente não pode ser encaminhado sem triagem.
  let responseContent = firstResponse;
  if (triagePending && isGenericHandoff(firstResponse)) {
    console.warn("[AI guard] encaminhamento generico antes da triagem — refazendo resposta.");
    responseContent = await askModel([
      ...messages,
      { role: "assistant", content: firstResponse },
      {
        role: "user",
        content:
          "[REVISÃO INTERNA DO SISTEMA — não é o cliente falando, não mencione esta mensagem]\n" +
          "Você encaminhou o contato para a Dra. Sheila sem ter feito a triagem, e este contato ainda não tem a triagem concluída. " +
          "É proibido encaminhar antes de triar. Reescreva a resposta acolhendo o cliente em uma frase e pedindo a PRÓXIMA informação que falta na triagem " +
          "(nome → e-mail → área → situação → tipo → relato), em no máximo 3 frases. Não use nenhuma frase de encaminhamento.",
      },
    ]).catch(() => firstResponse);
  }

  const shouldTransfer =
    config.transferKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase())) ||
    responseContent.includes("[TRANSFERIR_PARA_HUMANO]") ||
    announcesHandoffToHuman(responseContent);

  const triageComplete = responseContent.includes("[TRIAGEM COMPLETA]");

  const cleanContent = responseContent
    .replaceAll("[TRANSFERIR_PARA_HUMANO]", "")
    .replaceAll("[TRIAGEM COMPLETA]", "")
    .trim();

  return {
    content: cleanContent,
    shouldTransferToHuman: shouldTransfer,
    triageComplete,
    qualifiedData,
  };
}

function buildSystemPrompt(
  base: string,
  clientContext: string | undefined,
  hasMedia = false,
  operatorIntervened = false,
  contactName?: string,
  triageState?: string
): string {
  const firstNameForGreeting = (() => {
    const raw = contactName?.trim();
    if (!raw) return "";
    if (/^\+?[\d\s().-]{6,}$/.test(raw.replace(/\s/g, ""))) return "";
    return raw.split(/\s+/)[0];
  })();

  const greetingTarget = firstNameForGreeting ? `${firstNameForGreeting}, tudo bem?` : "tudo bem?";

  const menuGreetingRule = clientContext
    ? `
SAUDAÇÃO INICIAL OBRIGATÓRIA (CLIENTE CADASTRADO — MENU DE OPÇÕES):
- Sempre que o cliente iniciar a conversa, cumprimentar ("Olá", "Oi", "Bom dia", "Boa tarde", "Boa noite", "Tudo bem?"), perguntar "como pode ajudar" / "quais são as opções", ou enviar mensagem sem indicar claramente o motivo, responda EXATAMENTE com esta saudação e menu, sem nenhuma palavra adicional, sem perguntar nome, e-mail, CPF ou número de processo antes:

"Olá ${greetingTarget} Para que eu possa lhe direcionar, me diga exatamente em que posso lhe ajudar hoje:

1. Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)
2. Trabalhista (rescisão, horas extras, assédio, vínculo empregatício, acidente de trabalho, etc.)
3. Sou cliente do escritório e gostaria de saber o andamento do meu processo
4. Outros assuntos"

- NUNCA pule esse menu na primeira interação. NUNCA pergunte CPF ou número de processo — você já tem o cadastro dele.
- Só avance para resposta sobre processo APÓS o cliente escolher a opção 3.
- Se o cliente cumprimentar de novo no meio da conversa ("Olá", "Oi") e o assunto anterior já terminou, repita o menu.
- Se o cliente pedir explicitamente "quais são as opções" ou "o que você faz", repita o menu.`
    : "";

  const clientSection = clientContext
    ? `\n\n--- DADOS DO CLIENTE ---\n${clientContext}\n\nREGRA OBRIGATÓRIA PARA CLIENTES CADASTRADOS:
- Este cliente JÁ ESTÁ CADASTRADO. NUNCA peça CPF nem número de processo.
- Use o PRIMEIRO NOME do cliente (do campo "Nome" acima) na saudação do menu.
- SOMENTE quando o cliente escolher a opção 3 do menu (andamento do processo), responda usando os dados da seção "Histórico de movimentações e atualizações do processo" acima.
- NUNCA invente, deduza ou parafraseie movimentações que não estejam EXPLICITAMENTE listadas no histórico acima. Cite a movimentação como está registrada.
- Se o histórico estiver vazio ("Nenhuma movimentação registrada"), responda: "Não tenho movimentações registradas no sistema ainda. A equipe do escritório poderá verificar isso para você." e inclua [TRANSFERIR_PARA_HUMANO] no final.
- NUNCA responda com mensagens genéricas como "as informações estão sendo verificadas" quando houver histórico disponível acima.
- Se o cliente escolher opção 1, 2 ou 4, siga as regras do menu acima (a opção 3 é apenas para andamento de processo).
- Responda em linguagem simples, sem jargão jurídico. Máximo 3 frases.`
    : `\n\n--- CONTEXTO ---\nVocê NÃO tem cadastro completo desta pessoa neste painel. Faça a triagem na ordem: nome → e-mail → menu de áreas (UMA pergunta por vez).\n- NÃO mostre o menu de 4 opções antes de coletar nome e e-mail.\n- Se ela fizer referência a conversas ou etapas que não aparecem no histórico acima, não tente adivinhar.\n- Se a pessoa escolher a opção 3 do menu (andamento de processo) depois da triagem, peça o CPF para localizar o processo.`;

  const mediaInstruction = hasMedia
    ? "\n- IMPORTANTE: O cliente enviou uma imagem ou documento. O conteúdo já foi extraído e está na mensagem abaixo entre colchetes. Use essas informações para responder diretamente — não diga que não consegue ver arquivos.\n- REGRA CRÍTICA: Se o documento for um COMPROVANTE DE PAGAMENTO ou TRANSFERÊNCIA BANCÁRIA, você deve responder APENAS com a frase exata: \"Olá! Recebi sua mensagem. Nossa equipe já foi notificada e a doutora responderá em breve.\" e incluir [TRANSFERIR_PARA_HUMANO] no final, sem mais nenhuma palavra ou pergunta."
    : "";

  const antiHallucination = `
REGRA DE RITMO — ABSOLUTA:
- Envie APENAS UMA mensagem curta por vez. Faça UMA pergunta, aguarde a resposta, depois avance.
- NUNCA faça duas perguntas na mesma mensagem.
- NUNCA antecipe respostas que o cliente ainda NÃO deu, nem pule etapas que ainda estão sem resposta. PORÉM, se o cliente JÁ respondeu algo (mesmo fora de ordem ou junto com outra resposta), considere coletado e NÃO pergunte de novo — avance para a próxima informação que falta.
- Antes de perguntar, releia as mensagens do cliente e aproveite tudo que ele já disse (área, tipo de benefício/problema, situação). Não repita perguntas já respondidas.
- Máximo 3 frases por mensagem, EXCETO quando a instrução mandar usar uma frase fixa/exata — nesse caso, use a frase completa sem truncar.

REGRAS ANTI-ALUCINAÇÃO — ABSOLUTAS:
- NUNCA invente, suponha ou deduza informações que o cliente não disse explicitamente nesta conversa.
- NUNCA confirme, repita ou valide dados (nome, processo, benefício, datas, valores, decisões) que não estejam no histórico desta conversa ou nos dados do cliente acima.
- Se não sabe algo, diga exatamente: "Não tenho essa informação. A equipe do escritório poderá verificar isso para você."
- NUNCA complete frases do cliente com suposições. Pergunte se precisar confirmar.
- NUNCA mencione leis, artigos, jurisprudências ou prazos específicos — isso é parecer jurídico.
- NUNCA pergunte se há urgência, se o caso é urgente, se precisa com urgência, nem use "urgência", "urgente" ou "rápido" em perguntas ao cliente.
- NUNCA pergunte sobre prazos processuais, vencimento ou "quanto tempo falta" só para saber se o caso é urgente ou prioritário.
- Se o próprio cliente pedir humano ou equipe jurídica, inclua [TRANSFERIR_PARA_HUMANO] no final, sem comentar sobre urgência.

REGRA PARA ÁREAS FORA DO ESCOPO:
- Se o cliente perguntar sobre áreas que NÃO sejam Trabalhista ou Previdenciário (incluindo Acidente de Trabalho) (ex.: direito de família, criminal, civil, tributário, imobiliário, empresarial, etc.), responda APENAS com a frase exata: "Agradecemos pelo seu contato e pela confiança em nosso trabalho.\n\nInformamos que o Escritório de Advocacia Sheila Araújo atua com exclusividade nas áreas Trabalhista e Previdenciária (incluindo Acidente de Trabalho). Deste modo, a demanda apresentada não se enquadra em nosso escopo de atuação.\n\nPermanecemos à disposição para auxiliá-lo(a) em eventuais questões dentro das áreas de nossa especialização.\n\nAtenciosamente,\nDra. Sheila Araújo" e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.
- ATENÇÃO — NUNCA aplique essa resposta para assuntos de Previdenciário (INSS, aposentadoria, auxílio-doença, BPC/LOAS, perícia, CRAS, pensão por morte, auxílio-acidente, revisão de benefício) nem de Trabalhista/Acidente de Trabalho (rescisão, horas extras, FGTS, verbas rescisórias, assédio, vínculo empregatício). Esses assuntos SEMPRE estão dentro do escopo, mesmo que a mensagem chegue isolada, sem saudação prévia ou sem o restante da triagem concluída — nesse caso, continue a triagem normalmente em vez de usar a resposta de fora de escopo.
- Use a resposta de fora do escopo ACIMA SOMENTE quando o cliente pedir, de forma EXPLÍCITA e INEQUÍVOCA, orientação jurídica sobre outra área do direito claramente diferente (ex.: divórcio, inventário, criminal, tributário, imobiliário) e SEM nenhuma relação com INSS, benefício ou trabalho. Na MENOR dúvida, se a mensagem misturar temas, ou se você não entender claramente o assunto, é PROIBIDO usar essa recusa — use a REGRA DE ENCAMINHAMENTO EM DÚVIDA abaixo.

REGRA DE ENCAMINHAMENTO EM DÚVIDA — NUNCA RECUSE SEM CERTEZA:
- Se você NÃO entender claramente o assunto, tiver qualquer dúvida se é da área, ou a mensagem for confusa, complexa ou misturar temas — NÃO recuse, NÃO diga que não atuamos na área e NÃO invente. Responda APENAS com a frase exata: "Recebemos sua mensagem e será encaminhada à Dra. Sheila Araújo e à nossa equipe. Em breve, retornaremos o contato para prestar o atendimento necessário.\n\nAgradecemos a confiança e pedimos, por gentileza, que aguarde nosso retorno." e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.

REGRA PARA MENSAGENS PESSOAIS — ENCAMINHAR PARA A DRA. SHEILA:
- Se a mensagem NÃO for triagem de caso (Previdenciário/Trabalhista) NEM orientação sobre outra área jurídica, e sim algo PESSOAL ou de RELACIONAMENTO com a doutora — pedido de favor, de material (vídeo, documento, link, contato), retomada de contato de quem já a conhece, agradecimento ou assunto pessoal — NÃO use nenhuma resposta de recusa. Acolha e responda APENAS com a frase exata: "Vou encaminhar sua mensagem para a Dra. Sheila, ela responde por aqui assim que possível." e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra. Isso vale tanto para mensagens de texto quanto de áudio.

REGRA PARA OFERTAS DE SERVIÇO E PARCERIAS:
- Se a mensagem for de alguém oferecendo serviços, propondo parcerias, vendendo algo ou buscando emprego, responda APENAS com a frase exata: "Agradecemos pelo contato e pela confiança em nosso trabalho.\n\nNo momento, não estamos buscando parcerias ou serviços externos.\n\nPermanecemos à disposição para futuras oportunidades.\n\nAtenciosamente,\nDra. Sheila Araújo" e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.
- ATENÇÃO — NÃO confunda CLIENTE com parceria: quem PEDE uma consulta, quer ser atendido, quer contratar o escritório, ou pergunta o PREÇO/VALOR/quanto custa um atendimento ou consulta é um POTENCIAL CLIENTE, NUNCA um parceiro. Nesses casos NÃO use a resposta acima — siga a triagem normal. Se perguntarem valores/honorários, responda "Os valores e honorários são apresentados pela Dra. Sheila e equipe jurídica após a análise do seu caso." e continue a triagem (nome, e-mail, área).

REGRA PARA OPÇÃO OUTROS ASSUNTOS:
- Se o cliente escolher a opção "4 - Outros assuntos", digitar "4", ou informar que o assunto não é Trabalhista nem Previdenciário, responda APENAS com a exata frase: "Envie uma mensagem, por ESCRITO ou ÁUDIO, explicando o MOTIVO DO SEU CONTATO e logo retornaremos seu chamado" e inclua [TRANSFERIR_PARA_HUMANO] no final, sem adicionar mais nenhuma palavra.
- Esta regra NÃO se aplica a assuntos de Previdenciário (INSS, aposentadoria, auxílio-doença, BPC/LOAS, perícia, CRAS, pensão por morte, auxílio-acidente, revisão de benefício) nem de Trabalhista/Acidente de Trabalho (rescisão, horas extras, FGTS, verbas rescisórias, assédio, vínculo empregatício) — esses assuntos seguem a triagem normal, mesmo sem o menu ter sido mostrado antes.`;

  const instructions = clientContext
    ? `\nINSTRUÇÕES OBRIGATÓRIAS (cliente cadastrado):
- Este é um cliente existente do escritório. Trate-o com cordialidade pelo PRIMEIRO NOME do campo "Nome" acima.
- Na PRIMEIRA mensagem (ou retomada após "Olá"/"Oi"), apresente o menu obrigatório de 4 opções definido em "SAUDAÇÃO INICIAL OBRIGATÓRIA". NUNCA pule essa saudação para responder direto sobre processo.
- Só responda sobre andamento de processo APÓS o cliente escolher a opção 3.
- Responda APENAS com base nos dados listados acima. Se a informação não estiver lá, não invente.
- NUNCA forneça parecer jurídico, prometa resultados ou invente informações além do que está registrado.
- NUNCA marque consultas, reuniões, ligações ou confirme horários — diga que a equipe entrará em contato pelo WhatsApp.
- NUNCA mencione valores, honorários ou garanta resultados.
- NUNCA solicite documentos pessoais, CPF ou senhas por conta própria. Porém, se o cliente enviar esses dados voluntariamente, apenas agradeça e guarde a informação sem dizer que não pode coletar.
- NUNCA pergunte se o cliente já tem advogado.
- Se o cliente quiser falar com a equipe jurídica ou pedir atendimento humano, inclua [TRANSFERIR_PARA_HUMANO] no final.
- Responda em português brasileiro, de forma empática e profissional. Máximo 3 frases.`
    : `\nINSTRUCOES OBRIGATORIAS (NAO cadastrado — triagem):
- Analise o historico e identifique quais etapas ja foram concluidas: nome completo, e-mail, area, situacao.
- SEMPRE termine sua mensagem com a proxima etapa pendente. NUNCA termine com "Como posso ajudar?", "Em que posso ajudar?" ou qualquer frase generica.
- ETAPA 1 — NOME: Se o cliente JA disse o nome dele em QUALQUER mensagem do historico (ex: "meu nome e Julia", "sou a Ana", "aqui e o Carlos", "quem fala e o Joao"), considere o nome COLETADO — NUNCA pergunte o nome de novo. Apenas agradeca usando o primeiro nome e va DIRETO para a ETAPA 2 (e-mail). Aceite o primeiro nome como suficiente; nao exija sobrenome nem "nome completo". So pergunte o nome (uma unica vez, APENAS o nome) se ele ainda NAO tiver aparecido em nenhuma mensagem do cliente.
- ETAPA 2 — EMAIL: Se ja tem nome mas nao tem e-mail, termine sua mensagem pedindo APENAS o e-mail.
- ETAPA 3 — AREA: Se ja tem nome E e-mail, ANTES DE TUDO verifique se o cliente JA revelou a area em QUALQUER mensagem. Palavras de PREVIDENCIARIO: aposentadoria, aposentar, auxilio-doenca, auxilio-acidente, BPC, LOAS, pensao por morte, INSS, pericia, revisao de beneficio, auxilio/salario-maternidade. Palavras de TRABALHISTA: rescisao, demitido, demissao, horas extras, assedio, vinculo empregaticio, FGTS, verbas rescisorias, acidente de trabalho. Se o cliente JA usou qualquer palavra desse tipo (mesmo dentro de frases como "queria uma consulta sobre aposentadoria"), e ABSOLUTAMENTE PROIBIDO mostrar o menu — considere a area JA identificada e va DIRETO, de forma acolhedora, para a ETAPA 4 (situacao) do modulo correspondente. SOMENTE se o cliente ainda NAO deu NENHUMA pista da area e que voce apresenta EXATAMENTE:\n"Para que eu possa direcionar voce ao profissional adequado, sobre qual dos assuntos voce busca orientacao?\n\n1. Previdenciario (aposentadoria, auxilio-doenca, BPC, etc.)\n2. Trabalhista (rescisao, horas extras, assedio, vinculo empregaticio, acidente de trabalho, etc.)\n3. Sou cliente do escritorio e gostaria de saber o andamento do meu processo\n4. Outros assuntos"
- ETAPA 4 — SITUACAO: Apos a escolha, peca a situacao conforme o modulo. Se opcao 3, peca CPF.
- Qualquer que seja a mensagem do cliente (cumprimento, pergunta, divagacao), SEMPRE termine com a proxima etapa pendente.
- Ao concluir (nome + e-mail + area + situacao), encerre com mensagem de registro e inclua [TRIAGEM COMPLETA].
- NUNCA forneca orientacao juridica ou garanta resultados.
- Se solicitar humano, inclua [TRANSFERIR_PARA_HUMANO] no final.`;

  const operatorNote = operatorIntervened
    ? `\n\nREGRA CRÍTICA — MENSAGENS DA DRA. SHEILA NO HISTÓRICO:
- Algumas mensagens anteriores nesta conversa estão marcadas com ⚠️ [MENSAGEM ENVIADA PELA DRA. SHEILA — NÃO FOI VOCÊ QUE ESCREVEU ISSO].
- Essas mensagens foram escritas por uma PESSOA HUMANA (a Dra. Sheila ou equipe). VOCÊ NÃO AS ESCREVEU.
- NUNCA afirme que disse algo que está nessas mensagens. NUNCA continue o raciocínio dessas mensagens como se fossem suas.
- Analise o que o cliente respondeu DEPOIS dessas mensagens e continue a triagem normalmente a partir daí.
- Se o humano já coletou alguma informação (nome, e-mail, área), considere essa informação como disponível e não repita a pergunta.`
    : "";

  // Âncora determinística do que já foi coletado — instrução em prompt sozinha
  // não impedia a IA de repetir perguntas já respondidas.
  const triageStateSection = triageState
    ? `\n\n--- ESTADO DA TRIAGEM (extraído automaticamente desta conversa) ---\n${triageState}\n- Todo item marcado como "JÁ COLETADO" está respondido: é PROIBIDO perguntá-lo novamente.\n- Pergunte apenas o primeiro item marcado como "FALTA".\n- Enquanto houver item marcado como "FALTA", é PROIBIDO encaminhar o contato para a Dra. Sheila sem triar — continue a triagem.\n- Se nada estiver marcado como "FALTA", encerre a triagem.`
    : "";

  return `${base}${clientSection}${menuGreetingRule}${antiHallucination}${instructions}${triageStateSection}${mediaInstruction}${operatorNote}`;
}

// ─── Extração estruturada de dados via IA ────────────────────────────────────

async function extractQualifiedDataWithAI(
  apiKey: string,
  provider: "openai" | "anthropic",
  model: string,
  history: AIMessage[],
  userMessage: string
): Promise<AIResponse["qualifiedData"]> {
  const allUserText = history
    .filter(m => m.role === "user")
    .map(m => m.content)
    .concat(userMessage)
    .join("\n");

  // CPF via regex (mais confiável que IA para formato estruturado)
  const cpfMatch = allUserText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/\D/g, "") : undefined;

  const systemPrompt = `Você é um extrator de dados de conversas jurídicas. Analise o histórico e retorne APENAS um JSON válido.

REGRAS CRÍTICAS:
- Só preencha "name" se o cliente disse o próprio nome de forma explícita e direta (ex: "me chamo Ana", "sou o Carlos", "meu nome é..."). NUNCA infira, suponha ou invente um nome.
- Se o nome não foi dito claramente, omita o campo "name" completamente.
- Só preencha "email" se o cliente informou o próprio e-mail de forma explícita (ex: "meu e-mail é...", "pode me mandar para...@..."). NUNCA extraia e-mails que apareçam como exemplos, contexto ou de terceiros.
- Só preencha "legalArea" se o tipo do problema jurídico ficou claro na conversa.
- Preencha "caseSummary" sempre que o cliente já tiver descrito o que aconteceu com ele, mesmo que de forma desorganizada ou incompleta. Esse campo é usado para não pedir o relato duas vezes — se ele já contou algo do caso, resuma.

Campos possíveis (omita os que não tiver certeza):
{
  "name": "nome exato como o cliente disse",
  "email": "e-mail informado pelo próprio cliente",
  "phone": "telefone alternativo informado pelo cliente",
  "legalArea": "Direito Trabalhista | Direito Previdenciário | Acidente de Trabalho",
  "caseSummary": "resumo objetivo em 1-2 frases",
  "score": número 0-100 (nome+e-mail+área+resumo completos = 100)
}
Retorne APENAS o JSON, sem markdown.`;

  const conv = history
    .filter(m => m.role !== "system")
    .map(m => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
    .concat(`Cliente: ${userMessage}`)
    .join("\n");

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: conv },
  ];

  try {
    // Extração é tarefa determinística — temperatura 0 evita JSON inventado
    const raw = provider === "openai"
      ? await callOpenAI(apiKey, model, messages, 0)
      : await callAnthropic(apiKey, model, messages, 0);

    const parsed = JSON.parse(raw.replace(/```json\n?|```/g, "").trim());

    return {
      name: parsed.name || undefined,
      phone: parsed.phone || undefined,
      email: parsed.email || undefined,
      cpf,
      legalArea: parsed.legalArea || undefined,
      caseSummary: parsed.caseSummary || undefined,
      score: typeof parsed.score === "number" ? parsed.score : 0,
    };
  } catch {
    return { cpf, score: 0 };
  }
}

// ─── Interpretação de publicações judiciais ───────────────────────────────────

export interface InterpretedMovement {
  tipoMovimentacao: string;
  resumo: string;
  mensagemCliente: string;
  diasPrazo?: number;
}

export async function interpretLegalMovement(
  rawText: string,
  apiKey: string,
  provider: "openai" | "anthropic" = "openai",
  model?: string
): Promise<InterpretedMovement> {
  const resolvedModel = model ?? (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

  const system = `Você é um assistente jurídico especializado em publicações do Diário da Justiça.
Analise o texto de uma publicação judicial e retorne um JSON com exatamente estes campos:
- tipoMovimentacao: tipo resumido (ex: "Sentença", "Despacho", "Intimação", "Pauta de Julgamento", "Decisão Interlocutória")
- resumo: resumo em linguagem clara para o advogado, máximo 2 frases, explicitando o que foi decidido/solicitado
- mensagemCliente: mensagem amigável em português simples para enviar ao cliente via WhatsApp, sem jargão jurídico, máximo 2 frases
- diasPrazo: número inteiro de dias para manifestação/resposta se identificado no texto (omita o campo se não houver prazo)
Retorne APENAS o JSON válido, sem markdown ou explicações.`;

  const userMsg = `Publicação judicial:\n${rawText.slice(0, 2000)}`;
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];

  let raw = "";
  try {
    if (provider === "openai") {
      raw = await callOpenAI(apiKey, resolvedModel, messages);
    } else {
      raw = await callAnthropic(apiKey, resolvedModel, messages);
    }
    const json = JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
    return json as InterpretedMovement;
  } catch {
    return {
      tipoMovimentacao: "Publicação Judicial",
      resumo: rawText.slice(0, 300),
      mensagemCliente: "Há uma nova movimentação no seu processo. Em breve entraremos em contato.",
    };
  }
}

/** Resumo exclusivamente a partir do texto do cartão (comentários + atualizações registradas). */
export async function summarizeCaseCardForWhatsApp(
  entriesPlainText: string,
  clientFirstName: string,
  apiKey: string,
  provider: "openai" | "anthropic" = "openai",
  model?: string
): Promise<string> {
  const resolvedModel = model ?? (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");
  const system = `Você manda mensagens curtas por WhatsApp para um cliente leigo.
Use APENAS as informações do bloco "Cartão do escritório" abaixo. Não invente fatos, datas ou resultados que não apareçam literalmente nesse texto.
Se o texto for vazio ou só administrativo, diga que o escritório retornará com novidades.
Tom: cordial, português brasileiro, sem jargão jurídico pesado. Máximo 4 frases curtas. Sem prefixo "Prezado" longo.`;
  const userMsg = `Nome para tratar: ${clientFirstName}\n\n--- Cartão do escritório ---\n${entriesPlainText.slice(0, 8000)}`;
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];
  if (provider === "openai") {
    return (await callOpenAI(apiKey, resolvedModel, messages)).trim();
  }
  return (await callAnthropic(apiKey, resolvedModel, messages)).trim();
}

// ─── Transcrição de Áudio (Whisper) ──────────────────────────────────────────

/**
 * Baixa um áudio de qualquer URL e transcreve via OpenAI Whisper.
 * Retorna o texto transcrito ou null se falhar.
 */
export async function transcribeAudio(audioUrl: string | undefined, apiKey: string, base64Media?: string): Promise<string | null> {
  console.log(`[transcribeAudio] Inciando transcrição...`);
  try {
    let audioBuffer: ArrayBuffer;
    
    if (base64Media) {
      console.log(`[transcribeAudio] Usando áudio em base64 recebido no webhook.`);
      const binaryString = atob(base64Media);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBuffer = bytes.buffer;
    } else if (audioUrl) {
      console.log(`[transcribeAudio] Fazendo download do áudio de: ${audioUrl.slice(0, 100)}...`);
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        console.error(`[transcribeAudio] Falha ao baixar áudio: ${audioResponse.status} ${audioResponse.statusText}`);
        return null;
      }
      audioBuffer = await audioResponse.arrayBuffer();
    } else {
      console.error(`[transcribeAudio] Nenhum audioUrl ou base64Media fornecido.`);
      return null;
    }

    console.log(`[transcribeAudio] Áudio pronto, tamanho: ${audioBuffer.byteLength} bytes`);
    
    // Fallback if Blob constructor in Node drops the filename in FormData
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    const formData = new FormData();
    // Try to construct a File object if available (Node 20+), otherwise fallback to Blob
    if (typeof File !== 'undefined') {
       formData.append("file", new File([audioBlob], "audio.ogg", { type: "audio/ogg" }));
    } else {
       formData.append("file", audioBlob, "audio.ogg");
    }
    
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    console.log("[transcribeAudio] Enviando para OpenAI Whisper...");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[transcribeAudio] Erro na OpenAI: ${res.status} ${res.statusText}`, errorText);
      return null;
    }
    const data = await res.json();
    console.log("[transcribeAudio] Transcrição concluída com sucesso.");
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch (error: any) {
    console.error(`[transcribeAudio] Exceção capturada: ${error.message}`);
    return null;
  }
}

// ─── Análise de imagem / documento com IA ────────────────────────────────────

export async function analyzeMediaWithAI(
  mediaUrl: string,
  mediaType: "image" | "document",
  apiKey: string,
  base64Media?: string
): Promise<string | null> {
  const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

  try {
    let buffer: ArrayBuffer;
    let contentType = "";

    if (base64Media) {
      const binaryString = atob(base64Media);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      buffer = bytes.buffer;
      contentType = mediaType === "image" ? "image/jpeg" : "application/pdf";
    } else {
      if (!mediaUrl) return null;
      const dlRes = await fetch(mediaUrl);
      if (!dlRes.ok) return null;

      const contentLength = dlRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > MAX_MEDIA_BYTES) return null;

      buffer = await dlRes.arrayBuffer();
      contentType = dlRes.headers.get("content-type") ?? "";
    }

    const isImage = mediaType === "image" || contentType.startsWith("image/");

    const systemPrompt =
      "Você é um assistente jurídico. Analise o conteúdo enviado pelo cliente e descreva de forma clara e objetiva em português brasileiro. Se for um documento jurídico, identifique o tipo, partes envolvidas e pontos principais. Seja conciso — máximo 5 frases.";

    if (isImage) {
      // Imagens: base64 direto no vision
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: [
              { type: "text", text: "Analise esta imagem:" },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ]},
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    }

    // Documentos (PDF, DOCX, etc.): upload via Files API e depois analisa com Responses API
    const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, "documento.pdf");
    form.append("purpose", "user_data");

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!uploadRes.ok) return null;
    const uploaded = await uploadRes.json();
    const fileId = uploaded.id as string;

    // Usa a Responses API (suporta file input)
    const analyzeRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileId },
              { type: "input_text", text: systemPrompt + "\n\nAnalise o documento acima:" },
            ],
          },
        ],
      }),
    });

    // Limpa o arquivo após análise (fire-and-forget)
    fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});

    if (!analyzeRes.ok) return null;
    const analyzed = await analyzeRes.json();
    const text = analyzed.output?.find((o: any) => o.type === "message")
      ?.content?.find((c: any) => c.type === "output_text")?.text;
    return text?.trim() ?? null;

  } catch {
    return null;
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, model: string, messages: AIMessage[], temperature = 0.7): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 500, temperature }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey: string, model: string, messages: AIMessage[], temperature?: number): Promise<string> {
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const chatMessages = messages.filter(m => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemMsg,
      messages: chatMessages,
      ...(temperature !== undefined && { temperature }),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}
