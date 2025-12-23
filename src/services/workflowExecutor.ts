/**
 * Serviço para executar workflows do MindClerky
 */

import { WorkflowService, Workflow, WorkflowNode, WorkflowEdge } from './workflowService';
import { sendMessage } from '../utils/evolutionAPI';
import Instance from '../models/Instance';
import { getIO } from '../socket/socketServer';
import { GoogleSheetsService } from './googleSheetsService';
import { callOpenAI } from './openaiService';
import { OpenAIMemoryService } from './openaiMemoryService';
import { replaceVariables, ContactData } from '../utils/variableReplacer';
import { normalizePhone } from '../utils/numberNormalizer';

interface ExecutionContext {
  workflow: Workflow;
  contactPhone: string;
  instanceId: string;
  messageText: string;
  userId: string;
  typebotVariables?: Record<string, any>; // Variáveis do Typebot (ex: { Name: "Marcos", Telefone: "+5562984049128" })
}

interface ExecutionState {
  visitedNodes: Set<string>;
  hasReachedEnd: boolean; // Indica se pelo menos um caminho chegou ao final
  conditionMatched: boolean; // Indica se uma condição foi atendida (para pular nós intermediários)
}

/**
 * Executa um workflow completo
 */
export async function executeWorkflow(
  workflow: Workflow,
  contactPhone: string,
  instanceId: string,
  messageText: string,
  userId: string
): Promise<void> {
  try {
    console.log(`🚀 Iniciando execução do workflow: ${workflow.name} (${workflow.id})`);
    console.log(`📱 Contato: ${contactPhone}, Instância: ${instanceId}`);

    // Verificar se o contato já entrou no workflow
    const hasEntered = await WorkflowService.hasContactEntered(
      workflow.id,
      contactPhone,
      instanceId
    );

    if (hasEntered) {
      console.log(`⏭️ Contato ${contactPhone} já entrou neste workflow. Pulando execução.`);
      return;
    }

    // Encontrar o nó de gatilho (whatsappTrigger)
    const triggerNode = workflow.nodes.find((node) => node.type === 'whatsappTrigger');

    if (!triggerNode) {
      console.log(`⚠️ Workflow ${workflow.id} não possui nó de gatilho. Pulando execução.`);
      return;
    }

    // Verificar se a instância do gatilho corresponde
    const triggerInstanceId = triggerNode.data?.instanceId;
    if (triggerInstanceId && triggerInstanceId !== instanceId) {
      console.log(`⏭️ Instância do gatilho (${triggerInstanceId}) não corresponde à instância da mensagem (${instanceId}). Pulando execução.`);
      return;
    }

    // Criar contexto de execução
    const context: ExecutionContext = {
      workflow,
      contactPhone,
      instanceId,
      messageText,
      userId,
    };

    // Criar estado de execução
    const state: ExecutionState = {
      visitedNodes: new Set(),
      hasReachedEnd: false,
      conditionMatched: false,
    };

    // Log do workflow para debug
    console.log(`📊 Workflow configurado:`);
    console.log(`   - Nós: ${workflow.nodes.length}`);
    console.log(`   - Arestas: ${workflow.edges.length}`);
    workflow.nodes.forEach((n) => {
      console.log(`   - Nó ${n.id}: ${n.type}`);
      if (n.type === 'condition') {
        console.log(`     Condições: ${JSON.stringify(n.data?.conditions || [])}`);
      }
    });

    // Verificar se o workflow contém nó OpenAI
    const hasOpenAINode = workflow.nodes.some((node) => node.type === 'openai');

    // Executar workflow começando pelo gatilho
    await executeNode(context, state, triggerNode.id);

    // Adicionar contato à lista APENAS se o workflow chegou ao final
    // Se o workflow tiver nó OpenAI, não adicionar à lista (permite múltiplas execuções)
    if (state.hasReachedEnd && !hasOpenAINode) {
      await WorkflowService.addWorkflowContact(workflow.id, contactPhone, instanceId);
      console.log(`✅ Contato ${contactPhone} adicionado ao workflow ${workflow.id} (após conclusão completa)`);
      
      // Emitir evento WebSocket para atualizar frontend em tempo real
      try {
        const io = getIO();
        io.to(userId).emit('workflow-contact-updated', {
          workflowId: workflow.id,
          contactPhone,
          instanceId,
        });
      } catch (error) {
        // Não falhar se o WebSocket não estiver disponível
        console.error('Erro ao emitir evento de contato do workflow:', error);
      }
    } else if (hasOpenAINode) {
      console.log(`🤖 Workflow com OpenAI: Contato ${contactPhone} não adicionado à lista (permite múltiplas interações)`);
    } else {
      console.log(`⏭️ Contato ${contactPhone} não adicionado ao workflow (fluxo não completou)`);
    }

    console.log(`✅ Workflow ${workflow.name} executado com sucesso`);
  } catch (error) {
    console.error(`❌ Erro ao executar workflow ${workflow.id}:`, error);
    throw error;
  }
}

/**
 * Executa um nó específico do workflow
 */
async function executeNode(
  context: ExecutionContext,
  state: ExecutionState,
  nodeId: string
): Promise<void> {
  // Prevenir loops infinitos
  if (state.visitedNodes.has(nodeId)) {
    console.log(`⚠️ Nó ${nodeId} já foi visitado. Prevenindo loop.`);
    return;
  }

  state.visitedNodes.add(nodeId);

  const node = context.workflow.nodes.find((n) => n.id === nodeId);

  if (!node) {
    console.log(`⚠️ Nó ${nodeId} não encontrado no workflow.`);
    return;
  }

  console.log(`🔷 Executando nó: ${node.type} (${node.id})`);

  // Executar lógica baseada no tipo do nó
  switch (node.type) {
    case 'whatsappTrigger':
      // O gatilho apenas inicia o fluxo
      // A lógica de verificar condições e pular nós intermediários é tratada em executeNextNodes
      await executeNextNodes(context, state, nodeId);
      break;

    case 'typebotTrigger':
      // O gatilho Typebot apenas inicia o fluxo
      // Os dados do webhook já estão disponíveis no messageText (JSON stringificado)
      await executeNextNodes(context, state, nodeId);
      break;

    case 'condition':
      await executeConditionNode(context, state, node);
      break;

    case 'delay':
      await executeDelayNode(context, state, node);
      break;

    case 'response':
      await executeResponseNode(context, state, node);
      break;

    case 'spreadsheet':
      await executeSpreadsheetNode(context, state, node);
      break;

    case 'openai':
      await executeOpenAINode(context, state, node);
      break;

    case 'end':
      console.log(`🏁 Workflow finalizado no nó End`);
      state.hasReachedEnd = true;
      return;

    default:
      console.log(`⚠️ Tipo de nó desconhecido: ${node.type}`);
      await executeNextNodes(context, state, nodeId);
  }
}

/**
 * Executa nó de condição
 */
async function executeConditionNode(
  context: ExecutionContext,
  state: ExecutionState,
  node: WorkflowNode
): Promise<void> {
  const conditions = node.data?.conditions || [];

  console.log(`🔍 Verificando ${conditions.length} condição(ões) na mensagem: "${context.messageText}"`);
  console.log(`📋 Condições configuradas:`, conditions.map((c: any) => `"${c.text}"`).join(', '));

  if (conditions.length === 0) {
    console.log(`⚠️ Nó de condição não possui condições configuradas. Continuando para próximo nó.`);
    await executeNextNodes(context, state, node.id);
    return;
  }

  // Verificar condições usando função auxiliar
  const match = checkConditions(context, node);

  if (match) {
    console.log(`✅ Condição encontrada: "${match.condition.text}"`);
    state.conditionMatched = true;
    console.log(`➡️ Seguindo para próximo nó: ${match.edge.target}`);
    await executeNode(context, state, match.edge.target);
  } else {
    console.log(`❌ Nenhuma condição foi atendida. Fluxo interrompido.`);
  }
}

/**
 * Executa nó de delay
 */
async function executeDelayNode(
  context: ExecutionContext,
  state: ExecutionState,
  node: WorkflowNode
): Promise<void> {
  const delay = node.data?.delay || 0;
  const delayUnit = node.data?.delayUnit || 'seconds';

  if (delay <= 0) {
    console.log(`⏭️ Delay configurado como 0. Pulando delay.`);
    await executeNextNodes(context, state, node.id);
    return;
  }

  // Converter para milissegundos
  let delayMs = delay;
  switch (delayUnit) {
    case 'minutes':
      delayMs = delay * 60 * 1000;
      break;
    case 'hours':
      delayMs = delay * 60 * 60 * 1000;
      break;
    default: // seconds
      delayMs = delay * 1000;
  }

  console.log(`⏳ Aguardando ${delay} ${delayUnit} (${delayMs}ms)...`);

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  console.log(`✅ Delay concluído. Continuando execução.`);

  await executeNextNodes(context, state, node.id);
}

/**
 * Executa nó de resposta
 */
async function executeResponseNode(
  context: ExecutionContext,
  state: ExecutionState,
  node: WorkflowNode
): Promise<void> {
  // Verificar se o próximo nó é uma condição
  // Se for, verificar a condição ANTES de enviar a resposta
  const nextEdges = context.workflow.edges.filter((e) => e.source === node.id);
  const nextNodes = nextEdges.map((e) => context.workflow.nodes.find((n) => n.id === e.target)).filter(Boolean);
  const conditionNode = nextNodes.find((n) => n?.type === 'condition');

  if (conditionNode && !state.conditionMatched) {
    console.log(`🔍 Condição detectada após resposta. Verificando condição antes de enviar resposta.`);
    
    const match = checkConditions(context, conditionNode);

    if (match) {
      console.log(`✅ Condição encontrada ANTES de enviar resposta: "${match.condition.text}"`);
      console.log(`⏭️ Pulando resposta "${node.id}" pois condição foi atendida. Seguindo pelo caminho da condição.`);
      state.conditionMatched = true;
      state.visitedNodes.add(conditionNode.id);
      await executeNode(context, state, match.edge.target);
      return; // Não enviar a resposta
    } else {
      console.log(`❌ Condição não atendida. Enviando resposta normalmente.`);
    }
  }
  const responseType = node.data?.responseType || 'text';
  
  // Criar dados do contato para replaceVariables
  const contactData: ContactData = {
    phone: context.contactPhone,
    name: context.typebotVariables?.Name || undefined, // Usar nome do Typebot se disponível
  };

  // Se for tipo texto e não houver conteúdo configurado, usar messageText do contexto
  // (que pode ter sido atualizado pelo nó OpenAI)
  let content = responseType === 'text' && !node.data?.content 
    ? context.messageText 
    : (node.data?.content || '');
  
  // Substituir variáveis no conteúdo (incluindo variáveis do Typebot)
  content = replaceVariables(content, contactData, 'Cliente', context.typebotVariables);
  
  const mediaUrl = node.data?.mediaUrl || '';
  let caption = node.data?.caption || '';
  // Substituir variáveis na legenda também
  caption = replaceVariables(caption, contactData, 'Cliente', context.typebotVariables);
  
  let fileName = node.data?.fileName || '';
  // Substituir variáveis no nome do arquivo também
  fileName = replaceVariables(fileName, contactData, 'Cliente', context.typebotVariables);

  console.log(`📤 Enviando resposta do tipo: ${responseType}`);

  try {
    // Usar responseInstanceId do nó de resposta se fornecido, senão usar do contexto
    const responseInstanceId = node.data?.responseInstanceId || context.instanceId;
    
    // Buscar instância
    const instance = await Instance.findById(responseInstanceId);

    if (!instance) {
      console.error(`❌ Instância ${responseInstanceId} não encontrada.`);
      await executeNextNodes(context, state, node.id);
      return;
    }

    const instanceName = instance.instanceName;

    // Preparar payload baseado no tipo
    // O número precisa estar no formato completo (com DDI) para a Evolution API
    // Se o número não começar com 55, adicionar
    let phoneNumber = context.contactPhone;
    if (!phoneNumber.startsWith('55') && phoneNumber.length >= 10) {
      phoneNumber = `55${phoneNumber}`;
    }

    let payload: any = {
      number: phoneNumber,
    };

    switch (responseType) {
      case 'text':
        payload.text = content;
        break;

      case 'image':
        payload.image = mediaUrl;
        break;

      case 'image_caption':
        payload.image = mediaUrl;
        payload.caption = caption;
        break;

      case 'video':
        payload.video = mediaUrl;
        break;

      case 'video_caption':
        payload.video = mediaUrl;
        payload.caption = caption;
        break;

      case 'audio':
        payload.audio = mediaUrl;
        break;

      case 'file':
        payload.document = mediaUrl;
        payload.fileName = fileName || 'arquivo';
        break;

      default:
        console.error(`❌ Tipo de resposta desconhecido: ${responseType}`);
        await executeNextNodes(context, state, node.id);
        return;
    }

    // Enviar mensagem via Evolution API
    const response = await sendMessage(instanceName, payload);

    if (response) {
      console.log(`✅ Resposta enviada com sucesso para ${context.contactPhone}`);
    } else {
      console.error(`❌ Falha ao enviar resposta para ${context.contactPhone}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao enviar resposta:`, error);
  }

  // Continuar para o próximo nó
  await executeNextNodes(context, state, node.id);
}

/**
 * Executa nó de planilha
 */
async function executeSpreadsheetNode(
  context: ExecutionContext,
  state: ExecutionState,
  node: WorkflowNode
): Promise<void> {
  const spreadsheetId = node.data?.spreadsheetId;
  const spreadsheetName = node.data?.spreadsheetName || 'Dados do Workflow';
  const sheetName = node.data?.sheetName || 'Sheet1';

  console.log(`📊 Executando nó de planilha: ${spreadsheetName}`);

  if (!spreadsheetId) {
    console.log(`⚠️ Planilha não configurada. Criando nova planilha...`);
    
    try {
      // Criar nova planilha
      const spreadsheet = await GoogleSheetsService.createSpreadsheet(
        context.userId,
        spreadsheetName,
        sheetName
      );

      console.log(`✅ Planilha criada: ${spreadsheet.id}`);

      // Adicionar dados à planilha
      await GoogleSheetsService.appendData(
        context.userId,
        spreadsheet.id,
        sheetName,
        [extractDataFromContext(context)]
      );

      console.log(`✅ Dados adicionados à planilha`);
    } catch (error) {
      console.error(`❌ Erro ao criar/adicionar dados à planilha:`, error);
      // Continuar o fluxo mesmo se houver erro
    }
  } else {
    try {
      // Adicionar dados à planilha existente
      await GoogleSheetsService.appendData(
        context.userId,
        spreadsheetId,
        sheetName,
        [extractDataFromContext(context)]
      );

      console.log(`✅ Dados adicionados à planilha existente`);
    } catch (error) {
      console.error(`❌ Erro ao adicionar dados à planilha:`, error);
      // Continuar o fluxo mesmo se houver erro
    }
  }

  // Continuar para o próximo nó
  await executeNextNodes(context, state, node.id);
}

/**
 * Executa nó OpenAI
 */
async function executeOpenAINode(
  context: ExecutionContext,
  state: ExecutionState,
  node: WorkflowNode
): Promise<void> {
  const apiKey = node.data?.apiKey;
  const model = node.data?.model || 'gpt-3.5-turbo';
  const systemPrompt = node.data?.prompt || 'Você é um assistente útil. Responda à mensagem do usuário de forma clara e objetiva.';

  console.log(`🤖 Executando nó OpenAI: ${model}`);

  if (!apiKey) {
    console.log(`⚠️ API Key da OpenAI não configurada. Pulando processamento.`);
    // Continuar o fluxo mesmo sem API key
    await executeNextNodes(context, state, node.id);
    return;
  }

  try {
    // Substituir variáveis no prompt (incluindo variáveis do Typebot)
    // Criar dados do contato para replaceVariables
    const contactData: ContactData = {
      phone: context.contactPhone,
      name: undefined, // Será obtido se necessário
    };

    // Substituir variáveis no prompt
    const processedPrompt = replaceVariables(
      systemPrompt,
      contactData,
      'Cliente',
      context.typebotVariables
    );

    console.log(`📝 Prompt processado com variáveis: ${processedPrompt.substring(0, 100)}...`);

    // Obter histórico de conversa do contato
    const conversationHistory = await OpenAIMemoryService.getMessages(
      context.workflow.id,
      context.contactPhone,
      context.instanceId
    );

    console.log(`💭 Histórico de conversa: ${conversationHistory.length} mensagens anteriores`);

    // Processar mensagem com OpenAI (incluindo histórico)
    const aiResponse = await callOpenAI(
      apiKey,
      model,
      processedPrompt, // Usar prompt processado com variáveis
      context.messageText,
      conversationHistory
    );

    console.log(`✅ OpenAI processou mensagem: ${aiResponse.substring(0, 50)}...`);

    // Salvar mensagem do usuário na memória
    await OpenAIMemoryService.addMessage(
      context.workflow.id,
      context.contactPhone,
      context.instanceId,
      'user',
      context.messageText
    );

    // Salvar resposta da IA na memória
    await OpenAIMemoryService.addMessage(
      context.workflow.id,
      context.contactPhone,
      context.instanceId,
      'assistant',
      aiResponse
    );

    // Atualizar messageText no contexto com a resposta da IA
    // Isso permite que o próximo nó (resposta) use a resposta gerada
    context.messageText = aiResponse;

    // Continuar para o próximo nó
    await executeNextNodes(context, state, node.id);
  } catch (error) {
    console.error(`❌ Erro ao processar com OpenAI:`, error);
    // Continuar o fluxo mesmo se houver erro
    await executeNextNodes(context, state, node.id);
  }
}

/**
 * Extrai dados do contexto para adicionar à planilha
 */
function extractDataFromContext(context: ExecutionContext): any {
  // Tentar parsear messageText como JSON (vindo do Typebot)
  // Usar parseJsonbField para parsing seguro
  try {
    const parsed = typeof context.messageText === 'string' 
      ? JSON.parse(context.messageText)
      : context.messageText;
    
    // Se os dados vieram do Typebot, retornar diretamente
    // O formato esperado: { submittedAt, Name, Telefone, Idade }
    if (parsed.submittedAt || parsed.Name || parsed.Telefone || parsed.Idade) {
      return parsed;
    }
    
    // Se não for formato Typebot, retornar dados básicos
    return {
      submittedAt: new Date().toISOString(),
      Name: '',
      Telefone: context.contactPhone,
      Idade: '',
    };
  } catch {
    // Se não for JSON, retornar dados básicos
    return {
      submittedAt: new Date().toISOString(),
      Name: '',
      Telefone: context.contactPhone,
      Idade: '',
    };
  }
}

/**
 * Normaliza texto para comparação (lowercase e trim)
 */
function normalizeText(text: string): string {
  return (text || '').toLowerCase().trim();
}

/**
 * Verifica se uma condição é atendida na mensagem
 */
function checkConditionMatch(
  condition: { text: string; outputId: string },
  messageText: string
): boolean {
  const conditionText = normalizeText(condition.text);
  const normalizedMessage = normalizeText(messageText);
  return conditionText.length > 0 && normalizedMessage.includes(conditionText);
}

/**
 * Encontra a aresta correspondente a uma condição atendida
 */
function findConditionEdge(
  workflow: Workflow,
  conditionNode: WorkflowNode,
  condition: { text: string; outputId: string }
): WorkflowEdge | null {
  return (
    workflow.edges.find(
      (e) => e.source === conditionNode.id && e.sourceHandle === condition.outputId
    ) || null
  );
}

/**
 * Busca uma condição no caminho a partir de um nó (busca em profundidade)
 */
function findConditionInPath(
  workflow: Workflow,
  startNodeId: string,
  visited: Set<string> = new Set()
): WorkflowNode | null {
  if (visited.has(startNodeId)) {
    return null; // Evitar loops
  }
  visited.add(startNodeId);

  const node = workflow.nodes.find((n) => n.id === startNodeId);
  if (!node) {
    return null;
  }

  // Se este nó é uma condição, retornar
  if (node.type === 'condition') {
    return node;
  }

  // Buscar nos próximos nós
  const outgoingEdges = workflow.edges.filter((e) => e.source === startNodeId);
  for (const edge of outgoingEdges) {
    const found = findConditionInPath(workflow, edge.target, visited);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Verifica condições de um nó e retorna a condição atendida e sua aresta
 */
function checkConditions(
  context: ExecutionContext,
  conditionNode: WorkflowNode
): { condition: { text: string; outputId: string }; edge: WorkflowEdge } | null {
  const conditions = conditionNode.data?.conditions || [];
  const messageText = context.messageText;

  for (const condition of conditions) {
    if (checkConditionMatch(condition, messageText)) {
      const edge = findConditionEdge(context.workflow, conditionNode, condition);
      if (edge) {
        return { condition, edge };
      }
    }
  }

  return null;
}

/**
 * Executa os próximos nós conectados ao nó atual
 */
async function executeNextNodes(
  context: ExecutionContext,
  state: ExecutionState,
  currentNodeId: string
): Promise<void> {
  // Encontrar todas as arestas que saem deste nó
  const outgoingEdges = context.workflow.edges.filter((e) => e.source === currentNodeId);

  if (outgoingEdges.length === 0) {
    console.log(`🏁 Nenhum próximo nó encontrado. Fluxo finalizado neste caminho.`);
    // Se não há mais nós e chegamos aqui, consideramos que o caminho foi completado
    state.hasReachedEnd = true;
    return;
  }

  // Verificar se há uma condição no caminho a partir dos próximos nós
  // Se houver e for atendida, pular todos os nós intermediários
  for (const edge of outgoingEdges) {
    const conditionNode = findConditionInPath(context.workflow, edge.target, new Set(state.visitedNodes));
    
    if (conditionNode && !state.conditionMatched) {
      const match = checkConditions(context, conditionNode);

      if (match) {
        console.log(`✅ Condição encontrada no caminho: "${match.condition.text}". Pulando nós intermediários.`);
        console.log(`⏭️ Pulando nós intermediários e indo direto para o caminho da condição.`);
        state.conditionMatched = true;
        state.visitedNodes.add(conditionNode.id);
        await executeNode(context, state, match.edge.target);
        continue; // Não executar os nós intermediários
      }
    }

    // Se não há condição ou ela não foi atendida, executar normalmente
    await executeNode(context, state, edge.target);
  }
}

/**
 * Processa mensagem recebida e executa workflows ativos
 */
export async function processMessageForWorkflows(
  instanceId: string,
  userId: string,
  contactPhone: string,
  messageText: string,
  fromMe: boolean
): Promise<void> {
  // Só processar mensagens recebidas (FromMe: false)
  if (fromMe) {
    return;
  }

  try {
    console.log(`🔍 Verificando workflows ativos para instância ${instanceId}...`);

    // Buscar todos os workflows ativos do usuário
    const workflows = await WorkflowService.getWorkflowsByUserId(userId);

    // Filtrar apenas workflows ativos
    const activeWorkflows = workflows.filter((w) => w.isActive);

    console.log(`📋 Encontrados ${activeWorkflows.length} workflow(s) ativo(s)`);

    // Executar cada workflow
    for (const workflow of activeWorkflows) {
      try {
        await executeWorkflow(workflow, contactPhone, instanceId, messageText, userId);
      } catch (error) {
        console.error(`❌ Erro ao executar workflow ${workflow.id}:`, error);
        // Continuar com outros workflows mesmo se um falhar
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar mensagem para workflows:`, error);
  }
}

/**
 * Executa workflow a partir de um webhook do Typebot
 */
export async function executeWorkflowFromTypebot(
  workflow: Workflow,
  contactPhone: string,
  bodyData: any,
  userId: string
): Promise<void> {
  try {
    console.log(`🚀 Iniciando execução do workflow Typebot: ${workflow.name} (${workflow.id})`);
    console.log(`📱 Contato: ${contactPhone}`);

    // Encontrar o nó de gatilho typebotTrigger
    const triggerNode = workflow.nodes.find((node) => node.type === 'typebotTrigger');

    if (!triggerNode) {
      console.log(`⚠️ Workflow ${workflow.id} não possui nó de gatilho Typebot. Pulando execução.`);
      return;
    }

    // Para workflows Typebot, permitir múltiplas execuções do mesmo contato
    // Cada webhook pode trazer dados diferentes, então não verificamos se já entrou
    // Isso permite que o mesmo telefone envie formulários múltiplas vezes

    // Extrair variáveis do body do Typebot
    // O body pode vir como objeto direto ou dentro de um array
    let typebotVariables: Record<string, any> = {};
    
    if (bodyData && typeof bodyData === 'object') {
      // Se bodyData é um objeto, usar diretamente
      if (Array.isArray(bodyData) && bodyData.length > 0 && bodyData[0].body) {
        // Formato: [{ body: { Name: "...", Telefone: "..." } }]
        typebotVariables = bodyData[0].body || {};
      } else if (bodyData.body) {
        // Formato: { body: { Name: "...", Telefone: "..." } }
        typebotVariables = bodyData.body;
      } else {
        // Formato: { Name: "...", Telefone: "..." } (direto)
        typebotVariables = bodyData;
      }
    }

    console.log(`📋 Variáveis do Typebot extraídas:`, Object.keys(typebotVariables));

    // Se o Typebot tiver um campo "Telefone" no body, usar ele ao invés do contactPhone padrão
    let finalContactPhone = contactPhone;
    if (typebotVariables && typebotVariables.Telefone) {
      const typebotPhone = typebotVariables.Telefone;
      // Normalizar o telefone do Typebot
      const normalizedTypebotPhone = normalizePhone(String(typebotPhone), '55');
      if (normalizedTypebotPhone) {
        finalContactPhone = normalizedTypebotPhone;
        console.log(`📱 Usando telefone do Typebot: ${finalContactPhone} (original: ${typebotPhone})`);
      } else {
        console.log(`⚠️ Telefone do Typebot inválido: ${typebotPhone}. Usando telefone padrão: ${contactPhone}`);
      }
    }

    // Criar contexto de execução
    // Para Typebot, usamos os dados do body como mensagem
    const messageText = JSON.stringify(bodyData);

    const context: ExecutionContext = {
      workflow,
      contactPhone: finalContactPhone, // Usar telefone do Typebot se disponível
      instanceId: workflow.instanceId,
      messageText,
      userId,
      typebotVariables, // Adicionar variáveis do Typebot ao contexto
    };

    // Criar estado de execução
    const state: ExecutionState = {
      visitedNodes: new Set(),
      hasReachedEnd: false,
      conditionMatched: false,
    };

    // Executar workflow começando pelo gatilho
    await executeNode(context, state, triggerNode.id);

    // Para workflows Typebot, adicionar contato à lista APENAS se o workflow chegou ao final
    // Usar ON CONFLICT DO NOTHING para não gerar erro se o contato já estiver na lista
    if (state.hasReachedEnd) {
      try {
        await WorkflowService.addWorkflowContact(workflow.id, contactPhone, workflow.instanceId);
        console.log(`✅ Contato ${contactPhone} adicionado ao workflow ${workflow.id} (após conclusão completa)`);
      } catch (error) {
        // Se já estiver na lista, apenas logar (não é um erro crítico)
        console.log(`ℹ️ Contato ${contactPhone} já estava na lista do workflow ${workflow.id}`);
      }
      
      // Emitir evento WebSocket para atualizar frontend em tempo real
      try {
        const io = getIO();
        io.to(userId).emit('workflow-contact-updated', {
          workflowId: workflow.id,
          contactPhone,
          instanceId: workflow.instanceId,
        });
      } catch (error) {
        console.error('Erro ao emitir evento de contato do workflow:', error);
      }
    } else {
      console.log(`⏭️ Contato ${contactPhone} não adicionado ao workflow (fluxo não completou)`);
    }

    console.log(`✅ Workflow ${workflow.name} executado com sucesso`);
  } catch (error) {
    console.error(`❌ Erro ao executar workflow Typebot ${workflow.id}:`, error);
    throw error;
  }
}

