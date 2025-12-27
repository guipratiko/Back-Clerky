import { Request, Response, NextFunction } from 'express';
import Instance from '../models/Instance'; // Ainda no MongoDB
import { getIO } from '../socket/socketServer';
import { formatWhatsAppPhone, normalizeWhatsAppTimestamp } from '../utils/formatters';
import { fetchProfilePictureUrl } from '../utils/evolutionAPI';
import { extractMessageData } from '../utils/messageExtractors';
import { uploadMediaToService } from '../utils/mediaService';
import { CRMColumnService } from '../services/crmColumnService';
import { ContactService } from '../services/contactService';
import { MessageService } from '../services/messageService';
import { processMessageForWorkflows } from '../services/workflowExecutor';
import { AIAgentService } from '../services/aiAgentService';
import {
  addMessageToBuffer,
  scheduleMessageProcessing,
} from '../services/aiAgentProcessor';

/**
 * Extrai e exibe informações relevantes do payload de forma limpa
 */
function logWebhookEvent(instanceName: string, eventData: any): void {
  // Verificar se é um array de mensagens
  const messages = eventData.messages || eventData.data?.messages || (Array.isArray(eventData) ? eventData : null);
  
  if (messages && Array.isArray(messages) && messages.length > 0) {
    // Processar múltiplas mensagens
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📥 WEBHOOK RECEBIDO - ${messages.length} mensagem(ns)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    messages.forEach((msg: any, index: number) => {
      if (index > 0) console.log(''); // Espaço entre mensagens
      console.log(`📨 Mensagem ${index + 1}/${messages.length}:`);
      logSingleMessage(instanceName, msg);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    // Processar mensagem única
    // Se os dados estão em eventData.data, usar isso, senão usar eventData diretamente
    const messageData = eventData.data || eventData;
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📥 WEBHOOK RECEBIDO`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // Passar eventData completo para preservar event e instance do nível superior
    logSingleMessage(instanceName, { ...eventData, ...messageData });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/**
 * Exibe informações de uma única mensagem
 */
function logSingleMessage(instanceName: string, msg: any): void {
  // Os dados podem estar em msg.data ou diretamente em msg
  const data = msg.data || msg;
  
  const event = msg.event || data.event || msg.type || msg.action || 'UNKNOWN';
  const instance = msg.instance || data.instance || instanceName;
  
  // Extrair dados usando função utilitária
  const extracted = extractMessageData(msg);

  console.log(`  📌 Event:        ${event}`);
  console.log(`  📱 Instance:     ${instance}`);
  
  if (extracted.remoteJid) {
    console.log(`  👤 RemoteJid:    ${extracted.remoteJid}`);
  }
  
  if (extracted.fromMe !== null && extracted.fromMe !== undefined) {
    console.log(`  📤 FromMe:       ${extracted.fromMe ? 'Sim' : 'Não'}`);
  }
  
  if (extracted.pushName) {
    console.log(`  🏷️  PushName:     ${extracted.pushName}`);
  }
  
  if (extracted.conversation) {
    console.log(`  💬 Conversation: ${extracted.conversation}`);
  }
  
  if (extracted.base64) {
    const base64Preview = extracted.base64.length > 50 ? `${extracted.base64.substring(0, 50)}...` : extracted.base64;
    console.log(`  📎 Base64:       ${base64Preview} (${extracted.base64.length} caracteres)`);
  }
  
  if (extracted.messageType) {
    console.log(`  📄 MessageType:  ${extracted.messageType}`);
  }
}

export const receiveWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { instanceName } = req.params;
    const eventData = req.body;

    // Exibir informações relevantes do webhook
    logWebhookEvent(instanceName, eventData);

    // Buscar instância pelo instanceName
    const instance = await Instance.findOne({ instanceName });

    if (!instance) {
      console.warn(`⚠️ Instância não encontrada: ${instanceName}`);
      // Retornar 200 mesmo se não encontrar para evitar retentativas
      res.status(200).json({ status: 'ok', message: 'Webhook recebido' });
      return;
    }

    // Processar diferentes tipos de eventos
    // A Evolution API pode enviar eventos em diferentes formatos
    const eventType = 
      eventData.event || 
      eventData.type || 
      eventData.action ||
      (eventData.data && (eventData.data.event || eventData.data.type)) ||
      'UNKNOWN';

    // Normalizar tipo de evento (remover pontos, converter para maiúsculas)
    const normalizedEventType = eventType.toString().toUpperCase().replace(/\./g, '_');

    // Detectar tipo de evento também pelo conteúdo
    // Verificar se há dados de mensagem (pode estar em data ou diretamente)
    const hasMessages = eventData.messages || eventData.data?.messages || 
                       (eventData.data && (Array.isArray(eventData.data) || eventData.data.remoteJid || eventData.data.conversation));
    
    if (hasMessages || normalizedEventType.includes('MESSAGE') && normalizedEventType.includes('UPSERT')) {
      await handleMessagesUpsert(instance, eventData);
    } else if (eventData.keys || eventData.data?.keys) {
      await handleMessagesDelete(instance, eventData);
    } else if (eventData.qrcode || eventData.data?.qrcode || eventData.base64) {
      await handleQrcodeUpdated(instance, eventData);
    } else if (eventData.state || eventData.connectionState || eventData.status || eventData.data?.state) {
      await handleConnectionUpdate(instance, eventData);
    } else {
      // Tentar processar pelo tipo de evento normalizado
      switch (normalizedEventType) {
        case 'MESSAGES_UPSERT':
        case 'MESSAGE_UPSERT':
          await handleMessagesUpsert(instance, eventData);
          break;

        case 'MESSAGES_DELETE':
        case 'MESSAGE_DELETE':
        case 'MESSAGES.DELETE': // Formato com ponto
          await handleMessagesDelete(instance, eventData);
          break;

        case 'QRCODE_UPDATED':
        case 'QRCODE_UPDATE':
        case 'QRCODE.UPDATED': // Formato com ponto
          await handleQrcodeUpdated(instance, eventData);
          break;

        case 'CONNECTION_UPDATE':
        case 'CONNECTION_UPDATED':
        case 'CONNECTION.UPDATE': // Formato com ponto
          await handleConnectionUpdate(instance, eventData);
          break;

        default:
          // Se o evento contém "messages" e "upsert", processar como mensagem
          if (normalizedEventType.includes('MESSAGE') && normalizedEventType.includes('UPSERT')) {
            await handleMessagesUpsert(instance, eventData);
          } else if (normalizedEventType.includes('MESSAGE') && normalizedEventType.includes('DELETE')) {
            await handleMessagesDelete(instance, eventData);
          } else {
            console.log(`ℹ️ Evento não processado: ${eventType} (normalizado: ${normalizedEventType})`);
            console.log(`📋 Estrutura do evento:`, Object.keys(eventData));
          }
      }
    }

    // Sempre retornar 200 para evitar retentativas da Evolution API
    res.status(200).json({ status: 'ok', message: 'Webhook processado' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro ao processar webhook:', errorMessage);
    // Retornar 200 mesmo em caso de erro para evitar retentativas
    res.status(200).json({ status: 'ok', message: 'Webhook recebido' });
  }
};

/**
 * Processa evento MESSAGES_UPSERT (nova mensagem recebida/enviada)
 */
async function handleMessagesUpsert(instance: any, eventData: any): Promise<void> {
  console.log('💬 Nova mensagem recebida/enviada');
  
  // Os dados podem estar em eventData.data ou diretamente em eventData
  const data = eventData.data || eventData;
  const messages = Array.isArray(data) ? data : (data.messages || eventData.messages || [data] || []);
  
  console.log(`📨 Total de mensagens: ${messages.length}`);
  
  if (!instance.userId) {
    return;
  }

  const userId = instance.userId.toString();
  console.log(`👤 Processando mensagens para usuário: ${userId}`);

  // Garantir que as colunas padrão existem
  const columns = await CRMColumnService.initializeColumns(userId);
  const firstColumn = columns.find((col) => col.orderIndex === 0);
  
  if (!firstColumn) {
    console.error('❌ Coluna padrão não encontrada');
    return;
  }
  
  console.log(`📋 Coluna padrão encontrada: ${firstColumn.name} (${firstColumn.id})`);

  // Array para armazenar mensagens salvas (para enviar via WebSocket)
  const savedMessages: Array<{
    id: string;
    messageId: string;
    fromMe: boolean;
    messageType: string;
    content: string;
    mediaUrl: string | null;
    timestamp: string;
    read: boolean;
    contactId: string;
  }> = [];

  // Processar cada mensagem
  for (const msg of messages) {
    try {
      // Extrair dados da mensagem usando função utilitária
      const extracted = extractMessageData(msg);

      if (!extracted.remoteJid) {
        console.warn('⚠️ RemoteJid não encontrado na mensagem');
        continue;
      }

      // Ignorar mensagens enviadas por nós (fromMe === true) para evitar criar contatos próprios
      const fromMe = extracted.fromMe;

      // Se for mensagem enviada por nós, só salvar a mensagem se o contato já existir
      if (fromMe) {
        const existingContact = await ContactService.getContactByRemoteJid(
          userId,
          instance._id.toString(),
          extracted.remoteJid
        );

        if (existingContact) {
          // Salvar mensagem enviada
          const messageId = extracted.messageId || `msg_${Date.now()}_${Math.random()}`;
          const conversation = extracted.conversation || '';
          const messageType = extracted.messageType || 'conversation';
          const messageTimestamp = normalizeWhatsAppTimestamp(extracted.messageTimestamp);
          
          // Verificar se é mídia enviada por nós
          const isMedia = extracted.base64 && messageType !== 'conversation';
          let mediaUrl: string | null = null;
          
          if (isMedia && extracted.base64) {
            console.log(`📤 Fazendo upload de mídia enviada (${messageType}) para MidiaService...`);
            const uploadResult = await uploadMediaToService(
              extracted.base64,
              messageId,
              messageType
            );
            
            if (uploadResult) {
              mediaUrl = uploadResult.fullUrl;
              console.log(`✅ Mídia enviada com sucesso: ${mediaUrl}`);
            }
          }

          const savedMessage = await MessageService.createMessage({
            userId: userId,
            instanceId: instance._id.toString(),
            contactId: existingContact.id,
            remoteJid: extracted.remoteJid,
            messageId,
            fromMe: true,
            messageType,
            content: isMedia ? '[Mídia]' : conversation,
            mediaUrl: mediaUrl || null,
            timestamp: messageTimestamp,
            read: true,
          });

          // Adicionar à lista de mensagens salvas
          savedMessages.push({
            id: savedMessage.id,
            messageId: savedMessage.messageId,
            fromMe: savedMessage.fromMe,
            messageType: savedMessage.messageType,
            content: savedMessage.content,
            mediaUrl: savedMessage.mediaUrl,
            timestamp: savedMessage.timestamp.toISOString(),
            read: savedMessage.read,
            contactId: existingContact.id,
          });
        }
        continue; // Não criar contato para mensagens enviadas por nós
      }

      // Formatar telefone e nome
      const phone = formatWhatsAppPhone(extracted.remoteJid);
      const pushName = extracted.pushName || phone;

      // Buscar ou criar contato
      let contact = await ContactService.getContactByRemoteJid(
        userId,
        instance._id.toString(),
        extracted.remoteJid
      );

      const isNewContact = !contact;
      
      if (!isNewContact) {
        console.log(`📋 Contato já existe: ${pushName} (${phone})`);
      }

      // Buscar foto de perfil (apenas para novos contatos ou se não tiver foto)
      let profilePictureUrl: string | null = null;
      if (isNewContact || !contact?.profilePicture) {
        try {
          // Extrair número do remoteJid (remover @s.whatsapp.net)
          const number = extracted.remoteJid?.replace(/@.*$/, '') || '';
          profilePictureUrl = await fetchProfilePictureUrl(instance.instanceName, number);
          if (profilePictureUrl) {
            console.log(`📸 Foto de perfil encontrada para ${pushName}: ${profilePictureUrl}`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('Erro ao buscar foto de perfil:', errorMessage);
          // Não é crítico, continuar sem foto
        }
      }

      if (!contact) {
        // Criar novo contato na primeira coluna
        try {
          contact = await ContactService.findOrCreate({
            userId: userId,
            instanceId: instance._id.toString(),
            remoteJid: extracted.remoteJid,
            phone,
            name: pushName || phone,
            profilePicture: profilePictureUrl,
            columnId: firstColumn.id,
          });
          console.log(`✅ Novo contato criado: ${pushName} (${phone})`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('Erro ao criar contato:', errorMessage);
          // Tentar buscar novamente
          contact = await ContactService.getContactByRemoteJid(
            userId,
            instance._id.toString(),
            extracted.remoteJid
          );
          if (!contact) {
            console.error('❌ Não foi possível criar ou encontrar contato');
            continue;
          }
        }
      } else {
        // Atualizar nome se mudou
        const updates: any = {};
        if (pushName && pushName !== contact.name) {
          updates.name = pushName;
        }
        // Atualizar foto se não tinha e agora encontrou
        if (!contact.profilePicture && profilePictureUrl) {
          updates.profilePicture = profilePictureUrl;
        }
        
        if (Object.keys(updates).length > 0) {
          contact = await ContactService.updateContact(contact.id, userId, updates);
        }
      }

      // Salvar mensagem
      const messageId = extracted.messageId || `msg_${Date.now()}_${Math.random()}`;
      const conversation = extracted.conversation || '';
      const messageType = extracted.messageType || 'conversation';
      const messageTimestamp = normalizeWhatsAppTimestamp(extracted.messageTimestamp);
      
      // Verificar se é mídia (tem base64 e não é conversation)
      const isMedia = extracted.base64 && messageType !== 'conversation';
      let mediaUrl: string | null = null;
      
      // Se for mídia, fazer upload para o MidiaService
      if (isMedia && extracted.base64) {
        console.log(`📤 Fazendo upload de mídia (${messageType}) para MidiaService...`);
        const uploadResult = await uploadMediaToService(
          extracted.base64,
          messageId,
          messageType
        );
        
        if (uploadResult) {
          mediaUrl = uploadResult.fullUrl;
          console.log(`✅ Mídia enviada com sucesso: ${mediaUrl}`);
        } else {
          console.error('❌ Falha ao fazer upload da mídia');
        }
      }
      
      // Salvar mensagem no PostgreSQL (o trigger atualiza last_message automaticamente)
      try {
        const savedMessage = await MessageService.createMessage({
          userId: userId,
          instanceId: instance._id.toString(),
          contactId: contact.id,
          remoteJid: extracted.remoteJid,
          messageId,
          fromMe: false,
          messageType,
          content: isMedia ? '[Mídia]' : conversation,
          mediaUrl: mediaUrl || null,
          timestamp: messageTimestamp,
          read: false,
        });
        console.log(`✅ Mensagem salva no PostgreSQL: ${savedMessage.id} (${conversation.substring(0, 30)}...)`);

        // Adicionar à lista de mensagens salvas (formato para frontend)
        savedMessages.push({
          id: savedMessage.id,
          messageId: savedMessage.messageId,
          fromMe: savedMessage.fromMe,
          messageType: savedMessage.messageType,
          content: savedMessage.content,
          mediaUrl: savedMessage.mediaUrl,
          timestamp: savedMessage.timestamp.toISOString(),
          read: savedMessage.read,
          contactId: contact.id,
        });

        // Processar workflows do MindClerky (apenas para mensagens recebidas com texto)
        if (!fromMe && conversation) {
          try {
            // Usar o remoteJid completo (com @s.whatsapp.net) ou extrair número completo
            const fullPhone = extracted.remoteJid?.replace(/@.*$/, '') || phone;
            await processMessageForWorkflows(
              instance._id.toString(),
              userId,
              fullPhone,
              conversation,
              false
            );
          } catch (workflowError) {
            console.error('❌ Erro ao processar workflows:', workflowError);
            // Não bloquear o processamento da mensagem se o workflow falhar
          }
        }

        // Processar com Agente de IA (se houver agente ativo) - para mensagens recebidas (texto ou áudio)
        if (!fromMe) {
          try {
            console.log(`🔍 Verificando agente de IA para instância: ${instance._id.toString()}`);
            const agent = await AIAgentService.getActiveByInstance(instance._id.toString());
            if (agent) {
              console.log(`✅ Agente de IA encontrado: ${agent.name} (ativo: ${agent.isActive})`);
              const fullPhone = extracted.remoteJid?.replace(/@.*$/, '') || phone;
              const messageId = extracted.messageId || `msg_${Date.now()}_${Math.random()}`;
              const messageType = extracted.messageType || 'conversation';
              const base64 = messageType === 'audioMessage' ? extracted.base64 : undefined;

              console.log(`📋 Tipo de mensagem: ${messageType}, Base64 presente: ${!!base64}`);

              // Se for áudio e transcrição estiver habilitada, enviar para transcrição imediatamente
              if (messageType === 'audioMessage' && base64 && agent.transcribeAudio) {
                const { transcribeAudio } = await import('../services/aiAgentProcessor');
                try {
                  console.log(`🎤 Enviando áudio para transcrição imediatamente: ${messageId}`);
                  console.log(`📦 Base64 length: ${base64.length} caracteres`);
                  await transcribeAudio(
                    base64,
                    userId,
                    fullPhone,
                    instance._id.toString(),
                    messageId
                  );
                } catch (transcriptionError) {
                  console.error('❌ Erro ao enviar áudio para transcrição:', transcriptionError);
                  // Continuar mesmo se falhar - a transcrição pode ser feita depois
                }
              } else if (messageType === 'audioMessage' && !agent.transcribeAudio) {
                console.log(`⏭️ Transcrição de áudio desabilitada para agente ${agent.name}`);
              } else if (messageType === 'audioMessage' && !base64) {
                console.warn(`⚠️ Mensagem de áudio sem base64! messageId: ${messageId}`);
              }

              // Adicionar mensagem ao buffer
              addMessageToBuffer(
                fullPhone,
                instance._id.toString(),
                userId,
                messageId,
                conversation || '',
                messageType,
                base64 || undefined
              );

              // Agendar processamento após tempo de espera
              scheduleMessageProcessing(
                agent.id,
                agent.prompt,
                agent.waitTime,
                fullPhone,
                instance._id.toString(),
                userId
              );

              console.log(`🤖 Mensagem adicionada ao buffer do agente de IA (${agent.name})`);
            } else {
              console.log(`⏭️ Nenhum agente de IA ativo encontrado para instância: ${instance._id.toString()}`);
            }
          } catch (agentError) {
            console.error('❌ Erro ao processar com agente de IA:', agentError);
            // Não bloquear o processamento da mensagem se o agente falhar
          }
        }
      } catch (msgError: unknown) {
        const errorMessage = msgError instanceof Error ? msgError.message : 'Erro desconhecido';
        console.error('❌ Erro ao salvar mensagem no PostgreSQL:', errorMessage);
        // Continuar mesmo se falhar ao salvar mensagem
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ Erro ao processar mensagem:', errorMessage);
      // Continuar processando outras mensagens
    }
  }
  
  // Emitir evento via WebSocket com dados formatados das mensagens salvas
  if (savedMessages.length > 0) {
    try {
      const io = getIO();
      
      // Agrupar mensagens por contactId para enviar eventos separados
      const messagesByContact = new Map<string, typeof savedMessages>();
      
      savedMessages.forEach((msg) => {
        if (!messagesByContact.has(msg.contactId)) {
          messagesByContact.set(msg.contactId, []);
        }
        messagesByContact.get(msg.contactId)!.push(msg);
      });

      // Enviar evento para cada contato com suas mensagens
      messagesByContact.forEach((msgs, contactId) => {
        io.to(instance.userId.toString()).emit('new-message', {
          instanceId: instance._id.toString(),
          contactId: contactId,
          messages: msgs,
        });
        console.log(`📤 Evento 'new-message' emitido para usuário ${instance.userId} - Contato ${contactId} (${msgs.length} mensagem(ns))`);
      });

      // Emitir evento de contato atualizado
      io.to(instance.userId.toString()).emit('contact-updated', {
        instanceId: instance._id.toString(),
      });
    } catch (error) {
      console.error('Erro ao emitir evento de nova mensagem:', error);
    }
  }
}

/**
 * Processa evento MESSAGES_DELETE (mensagem deletada)
 */
async function handleMessagesDelete(instance: any, eventData: any): Promise<void> {
  console.log('🗑️ Mensagem deletada');
  
  // Processar deleção de mensagem
  const keys = eventData.keys || eventData.data?.keys || [];
  console.log(`🗑️ Total de mensagens deletadas: ${keys.length}`);
  
  // Emitir evento via WebSocket se necessário
  if (instance.userId) {
    try {
      const io = getIO();
      io.to(instance.userId.toString()).emit('message-deleted', {
        instanceId: instance._id.toString(),
        keys: keys,
      });
    } catch (error) {
      console.error('Erro ao emitir evento de mensagem deletada:', error);
    }
  }
}

/**
 * Processa evento QRCODE_UPDATED (QR Code atualizado)
 */
async function handleQrcodeUpdated(instance: any, eventData: any): Promise<void> {
  console.log('📱 QR Code atualizado');
  
  const qrcodeBase64 = 
    eventData.qrcode?.base64 || 
    eventData.data?.qrcode?.base64 || 
    eventData.base64 || 
    null;

  if (qrcodeBase64) {
    // Atualizar QR code no banco
    await Instance.updateOne(
      { _id: instance._id },
      { qrcodeBase64: qrcodeBase64 }
    );

    // Emitir evento via WebSocket
    if (instance.userId) {
      try {
        const io = getIO();
        io.to(instance.userId.toString()).emit('qrcode-updated', {
          instanceId: instance._id.toString(),
          qrcodeBase64: qrcodeBase64,
        });
      } catch (error) {
        console.error('Erro ao emitir evento de QR code atualizado:', error);
      }
    }
  }
}

/**
 * Processa evento CONNECTION_UPDATE (atualização de conexão)
 */
async function handleConnectionUpdate(instance: any, eventData: any): Promise<void> {
  console.log('🔌 Atualização de conexão');
  
  const state = 
    eventData.state || 
    eventData.data?.state || 
    eventData.connectionState?.state || 
    eventData.status ||
    null;

  if (state) {
    let newStatus: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error' = instance.status;
    
    const normalizedState = String(state).toLowerCase().trim();
    
    if (normalizedState === 'open' || normalizedState === 'connected') {
      newStatus = 'connected';
    } else if (
      normalizedState === 'close' ||
      normalizedState === 'disconnected' ||
      normalizedState === 'closed'
    ) {
      newStatus = 'disconnected';
    } else if (normalizedState === 'connecting' || normalizedState === 'connect') {
      newStatus = 'connecting';
    } else if (normalizedState === 'error' || normalizedState === 'failed') {
      newStatus = 'error';
    }

    // Atualizar status no banco se mudou
    if (newStatus !== instance.status) {
      await Instance.updateOne(
        { _id: instance._id },
        { status: newStatus }
      );

      // Emitir evento via WebSocket
      if (instance.userId) {
        try {
          const io = getIO();
          io.to(instance.userId.toString()).emit('instance-status-updated', {
            instanceId: instance._id.toString(),
            status: newStatus,
          });
          console.log(`📤 Status atualizado via webhook: ${instance.instanceName} -> ${newStatus}`);
        } catch (error) {
          console.error('Erro ao emitir evento de status atualizado:', error);
        }
      }
    }
  }
}

