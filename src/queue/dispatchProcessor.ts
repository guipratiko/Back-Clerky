/**
 * Processador de Jobs de Disparo
 * Processa cada job individual de envio de mensagem
 */

import { Job } from 'bull';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { replaceVariablesInContent } from '../utils/variableReplacer';
import { formatPhoneForDisplay, normalizePhone } from '../utils/numberNormalizer';
import { DispatchService } from '../services/dispatchService';
import { TemplateService } from '../services/templateService';
import { pgPool } from '../config/databases';
import Instance from '../models/Instance';
import { EVOLUTION_CONFIG } from '../config/constants';
import { https } from 'follow-redirects';

export interface DispatchJobData {
  dispatchId: string;
  userId: string;
  instanceId: string;
  instanceName: string;
  templateId?: string | null;
  contactData: {
    phone: string;
    name?: string;
    formattedPhone?: string;
  };
  defaultName?: string;
  settings: {
    speed: 'fast' | 'normal' | 'slow' | 'randomized';
    autoDelete?: boolean;
    deleteDelay?: number;
    deleteDelayUnit?: 'seconds' | 'minutes' | 'hours';
  };
  jobId: string; // ID do job no PostgreSQL (dispatch_jobs.id)
}

/**
 * Calcular delay baseado na velocidade configurada
 */
export const calculateDelay = (speed: string): number => {
  switch (speed) {
    case 'fast':
      return 1000; // 1 segundo
    case 'normal':
      return 30000; // 30 segundos
    case 'slow':
      return 60000; // 1 minuto
    case 'randomized':
      // Entre 55 e 85 segundos (55000 a 85000 ms)
      return Math.floor(Math.random() * (85000 - 55000 + 1)) + 55000;
    default:
      return 30000;
  }
};

/**
 * Converter delay para milissegundos baseado na unidade
 */
const convertDelayToMs = (delay: number, unit: string): number => {
  switch (unit) {
    case 'seconds':
      return delay * 1000;
    case 'minutes':
      return delay * 60 * 1000;
    case 'hours':
      return delay * 60 * 60 * 1000;
    default:
      return delay * 1000;
  }
};

/**
 * Enviar mensagem de texto
 */
const sendTextMessage = async (
  instanceName: string,
  remoteJid: string,
  text: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const response = await requestEvolutionAPI(
    'POST',
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      number: remoteJid,
      text,
    }
  );

  // Log da resposta para debug
  console.log('📤 Resposta do envio de texto:', JSON.stringify(response.data, null, 2));

  // Extrair messageId da resposta - tentar diferentes estruturas possíveis
  const messageId =
    response.data?.key?.id ||
    response.data?.messageId ||
    response.data?.id ||
    response.data?.data?.key?.id ||
    response.data?.data?.messageId ||
    response.data?.response?.key?.id ||
    response.data?.response?.messageId ||
    null;

  // Extrair o remoteJid real usado pela API (pode ser diferente do enviado)
  const actualRemoteJid = response.data?.key?.remoteJid || remoteJid;

  if (!messageId) {
    console.warn('⚠️ MessageId não encontrado na resposta:', JSON.stringify(response.data));
    throw new Error('MessageId não encontrado na resposta da Evolution API');
  }

  console.log('✅ MessageId extraído:', messageId);
  console.log('✅ RemoteJid real da API:', actualRemoteJid);
  return { messageId, actualRemoteJid };
};

/**
 * Enviar imagem
 */
const sendImageMessage = async (
  instanceName: string,
  remoteJid: string,
  imageUrl: string,
  caption?: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const response = await requestEvolutionAPI(
    'POST',
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      number: remoteJid,
      mediatype: 'image',
      media: imageUrl,
      caption: caption || '',
    }
  );

  console.log('📤 Resposta do envio de imagem:', JSON.stringify(response.data, null, 2));

  const messageId =
    response.data?.key?.id ||
    response.data?.messageId ||
    response.data?.id ||
    response.data?.data?.key?.id ||
    response.data?.data?.messageId ||
    response.data?.response?.key?.id ||
    response.data?.response?.messageId ||
    null;

  const actualRemoteJid = response.data?.key?.remoteJid || remoteJid;

  if (!messageId) {
    console.warn('⚠️ MessageId não encontrado na resposta:', JSON.stringify(response.data));
    throw new Error('MessageId não encontrado na resposta da Evolution API');
  }

  console.log('✅ MessageId extraído:', messageId);
  console.log('✅ RemoteJid real da API:', actualRemoteJid);
  return { messageId, actualRemoteJid };
};

/**
 * Enviar vídeo
 */
const sendVideoMessage = async (
  instanceName: string,
  remoteJid: string,
  videoUrl: string,
  caption?: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const response = await requestEvolutionAPI(
    'POST',
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      number: remoteJid,
      mediatype: 'video',
      media: videoUrl,
      caption: caption || '',
    }
  );

  console.log('📤 Resposta do envio de vídeo:', JSON.stringify(response.data, null, 2));

  const messageId =
    response.data?.key?.id ||
    response.data?.messageId ||
    response.data?.id ||
    response.data?.data?.key?.id ||
    response.data?.data?.messageId ||
    response.data?.response?.key?.id ||
    response.data?.response?.messageId ||
    null;

  const actualRemoteJid = response.data?.key?.remoteJid || remoteJid;

  if (!messageId) {
    console.warn('⚠️ MessageId não encontrado na resposta:', JSON.stringify(response.data));
    throw new Error('MessageId não encontrado na resposta da Evolution API');
  }

  console.log('✅ MessageId extraído:', messageId);
  console.log('✅ RemoteJid real da API:', actualRemoteJid);
  return { messageId, actualRemoteJid };
};

/**
 * Enviar áudio
 */
const sendAudioMessage = async (
  instanceName: string,
  remoteJid: string,
  audioUrl: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const response = await requestEvolutionAPI(
    'POST',
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      number: remoteJid,
      mediatype: 'audio',
      media: audioUrl,
    }
  );

  console.log('📤 Resposta do envio de áudio:', JSON.stringify(response.data, null, 2));

  const messageId =
    response.data?.key?.id ||
    response.data?.messageId ||
    response.data?.id ||
    response.data?.data?.key?.id ||
    response.data?.data?.messageId ||
    response.data?.response?.key?.id ||
    response.data?.response?.messageId ||
    null;

  const actualRemoteJid = response.data?.key?.remoteJid || remoteJid;

  if (!messageId) {
    console.warn('⚠️ MessageId não encontrado na resposta:', JSON.stringify(response.data));
    throw new Error('MessageId não encontrado na resposta da Evolution API');
  }

  console.log('✅ MessageId extraído:', messageId);
  console.log('✅ RemoteJid real da API:', actualRemoteJid);
  return { messageId, actualRemoteJid };
};

/**
 * Enviar arquivo
 */
const sendFileMessage = async (
  instanceName: string,
  remoteJid: string,
  fileUrl: string,
  fileName: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const response = await requestEvolutionAPI(
    'POST',
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      number: remoteJid,
      mediatype: 'document',
      media: fileUrl,
      fileName,
    }
  );

  console.log('📤 Resposta do envio de arquivo:', JSON.stringify(response.data, null, 2));

  const messageId =
    response.data?.key?.id ||
    response.data?.messageId ||
    response.data?.id ||
    response.data?.data?.key?.id ||
    response.data?.data?.messageId ||
    response.data?.response?.key?.id ||
    response.data?.response?.messageId ||
    null;

  const actualRemoteJid = response.data?.key?.remoteJid || remoteJid;

  if (!messageId) {
    console.warn('⚠️ MessageId não encontrado na resposta:', JSON.stringify(response.data));
    throw new Error('MessageId não encontrado na resposta da Evolution API');
  }

  console.log('✅ MessageId extraído:', messageId);
  console.log('✅ RemoteJid real da API:', actualRemoteJid);
  return { messageId, actualRemoteJid };
};

/**
 * Tentar excluir usando POST (fallback quando DELETE não funciona)
 */
const tryPostDelete = async (
  instanceName: string,
  messageId: string,
  remoteJid: string
): Promise<boolean> => {
  return new Promise((resolve) => {
    const apiKey = EVOLUTION_CONFIG.API_KEY;
    const hostname = EVOLUTION_CONFIG.HOST;

    const postData = JSON.stringify({
      id: messageId,
      remoteJid: remoteJid,
      fromMe: true,
      participant: 'participant', // Valor fixo conforme exemplo
    });

    const data = Buffer.from(postData, 'utf8');

    const options = {
      hostname,
      method: 'POST',
      path: `/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      maxRedirects: 20,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const ok = res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false;
        
        if (ok) {
          console.log(`✅ Mensagem excluída com sucesso (POST): ${messageId}`);
        } else {
          console.error(`❌ Erro ao excluir mensagem (POST) ${messageId}:`, {
            statusCode: res.statusCode,
            response: raw,
          });
        }

        resolve(ok);
      });

      res.on('error', (error) => {
        console.error(`❌ Erro na resposta POST de exclusão:`, error);
        resolve(false);
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Erro na requisição POST de exclusão:`, error);
      resolve(false);
    });

    // Setar Content-Length antes de escrever
    req.setHeader('Content-Length', data.length);
    req.write(data);
    req.end();
  });
};

/**
 * Excluir mensagem para todos
 * O endpoint precisa do ID da mensagem que vem na resposta do envio
 */
const deleteMessageForEveryone = async (
  instanceName: string,
  messageId: string,
  remoteJid: string
): Promise<boolean> => {
  console.log(`🗑️ Tentando excluir mensagem: messageId=${messageId}, remoteJid=${remoteJid}`);
  
  return new Promise((resolve) => {
    const apiKey = EVOLUTION_CONFIG.API_KEY;
    const hostname = EVOLUTION_CONFIG.HOST;

    const postData = JSON.stringify({
      id: messageId, // ID da mensagem retornado pelo endpoint de envio
      remoteJid: remoteJid,
      fromMe: true,
      participant: 'participant', // Valor fixo conforme exemplo da documentação
    });

    console.log(`📤 Payload de exclusão:`, postData);
    const data = Buffer.from(postData, 'utf8');

    // Usar DELETE conforme exemplo fornecido
    const options = {
      hostname,
      method: 'DELETE',
      path: `/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      maxRedirects: 20,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 300;
        
        let parsed: any = raw;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          // Se não conseguir parsear, mantém como string
        }

        console.log(`📥 Resposta da exclusão (${statusCode}):`, raw);

        // Verificar se a resposta indica sucesso
        // Sucesso pode ser indicado por:
        // 1. Status code 2xx
        // 2. protocolMessage.type === "REVOKE" (indica que a mensagem foi revogada/deletada)
        // 3. status === 'success' ou status === 200
        // 4. Ausência de campo 'error'
        const hasRevokeMessage = parsed?.message?.protocolMessage?.type === 'REVOKE';
        const hasSuccessStatus = parsed?.status === 'success' || parsed?.status === 200;
        const hasNoError = !parsed?.error;
        
        const isSuccess = ok && (
          hasRevokeMessage || 
          hasSuccessStatus || 
          (hasNoError && (parsed?.status === 'PENDING' || parsed?.status === undefined))
        );

        if (isSuccess) {
          console.log(`✅ Mensagem excluída com sucesso: ${messageId}`);
          if (hasRevokeMessage) {
            console.log(`✅ Confirmação de revogação recebida (protocolMessage.type: REVOKE)`);
          }
          resolve(true);
        } else {
          // Se DELETE falhar, tentar POST
          if (statusCode === 404 || statusCode === 405) {
            console.log(`⚠️ DELETE não suportado (${statusCode}), tentando POST...`);
            tryPostDelete(instanceName, messageId, remoteJid).then(resolve);
          } else {
            console.error(`❌ Erro ao excluir mensagem ${messageId}:`, {
              statusCode: statusCode,
              response: parsed,
              raw: raw,
            });
            resolve(false);
          }
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Erro na requisição de exclusão:`, error);
      // Tentar POST como fallback
      tryPostDelete(instanceName, messageId, remoteJid).then(resolve);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error(`❌ Timeout na requisição de exclusão: ${messageId}`);
      resolve(false);
    });

    // Setar Content-Length antes de escrever (conforme exemplo fornecido)
    req.setHeader('Content-Length', data.length);
    req.write(data);
    req.end();
  });
};

/**
 * Processar job de disparo
 */
export const processDispatchJob = async (job: Job<DispatchJobData>): Promise<void> => {
  const { dispatchId, instanceName, contactData, templateId, defaultName, settings } = job.data;
  
  // Declarar postgresJobId uma única vez no início da função
  const postgresJobId = job.data.jobId || job.id;

  try {
    // Verificar se o job já foi processado (idempotência)
    if (postgresJobId && job.data.jobId) {
      const jobCheck = await pgPool.query(
        `SELECT status FROM dispatch_jobs WHERE id = $1`,
        [postgresJobId]
      );

      if (jobCheck.rows.length > 0) {
        const currentStatus = jobCheck.rows[0].status;
        // Se o job já foi enviado, falhou ou é inválido, não processar novamente
        if (currentStatus === 'sent' || currentStatus === 'failed' || currentStatus === 'invalid') {
          console.log(`⏭️ Job ${postgresJobId} já foi processado (status: ${currentStatus}). Pulando processamento.`);
          return;
        }
      }
    }

    // Garantir que o número está normalizado com DDI
    const normalizedPhone = normalizePhone(contactData.phone) || contactData.phone;
    
    // Preparar dados do contato para substituição de variáveis
    const contact = {
      phone: normalizedPhone,
      name: contactData.name,
      formattedPhone: contactData.formattedPhone || formatPhoneForDisplay(normalizedPhone),
    };

    // Buscar template se houver
    let template = null;
    if (templateId) {
      template = await TemplateService.getById(templateId, job.data.userId);
      if (!template) {
        throw new Error('Template não encontrado');
      }
    }

    if (!template) {
      throw new Error('Template é obrigatório para disparos');
    }

    // Substituir variáveis no conteúdo do template
    const personalizedContent = replaceVariablesInContent(
      template.content,
      contact,
      defaultName || 'Cliente'
    );

    // Converter número para remoteJid
    // Usar o número exatamente como foi usado no envio (pode estar no contactData.formattedPhone)
    const remoteJid = contactData.formattedPhone 
      ? `${contactData.formattedPhone}@s.whatsapp.net`
      : `${contact.phone}@s.whatsapp.net`;

    console.log(`📱 RemoteJid para envio/exclusão: ${remoteJid} (phone: ${contact.phone}, formatted: ${contactData.formattedPhone})`);

    let messageId: string;
    let actualRemoteJid: string = remoteJid; // Será atualizado com o remoteJid real da resposta

    // Enviar mensagem baseado no tipo do template
    switch (template.type) {
      case 'text': {
        const content = personalizedContent as { text: string };
        const result = await sendTextMessage(instanceName, remoteJid, content.text);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'image': {
        const content = personalizedContent as { imageUrl: string };
        const result = await sendImageMessage(instanceName, remoteJid, content.imageUrl);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'image_caption': {
        const content = personalizedContent as { imageUrl: string; caption?: string };
        const result = await sendImageMessage(instanceName, remoteJid, content.imageUrl, content.caption);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'video': {
        const content = personalizedContent as { videoUrl: string };
        const result = await sendVideoMessage(instanceName, remoteJid, content.videoUrl);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'video_caption': {
        const content = personalizedContent as { videoUrl: string; caption?: string };
        const result = await sendVideoMessage(instanceName, remoteJid, content.videoUrl, content.caption);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'audio': {
        const content = personalizedContent as { audioUrl: string };
        const result = await sendAudioMessage(instanceName, remoteJid, content.audioUrl);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'file': {
        const content = personalizedContent as { fileUrl: string; fileName: string };
        const result = await sendFileMessage(instanceName, remoteJid, content.fileUrl, content.fileName);
        messageId = result.messageId;
        actualRemoteJid = result.actualRemoteJid || remoteJid;
        break;
      }

      case 'sequence': {
        // Processar sequência de mensagens
        const content = personalizedContent as { steps: Array<{ type: string; content: any; delay: number; delayUnit: string }> };
        
        // Enviar primeira mensagem
        const firstStep = content.steps[0];
        const firstResult = await processSequenceStep(instanceName, remoteJid, firstStep, contact, defaultName);
        messageId = firstResult.messageId;
        actualRemoteJid = firstResult.actualRemoteJid || remoteJid;

        // Processar demais etapas com delay
        for (let i = 1; i < content.steps.length; i++) {
          const step = content.steps[i];
          const delayMs = convertDelayToMs(step.delay, step.delayUnit || 'seconds');
          
          // Aguardar delay antes de enviar próxima mensagem
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          
          await processSequenceStep(instanceName, remoteJid, step, contact, defaultName);
        }
        break;
      }

      default:
        throw new Error(`Tipo de template não suportado: ${template.type}`);
    }

    console.log(`💾 Salvando messageId no job: ${messageId} (PostgreSQL jobId: ${postgresJobId}, Bull job.id: ${job.id})`);

    // Atualizar job no banco usando o ID do PostgreSQL (com verificação para evitar duplicação)
    const updateResult = await pgPool.query(
      `UPDATE dispatch_jobs 
       SET status = 'sent', message_id = $1, sent_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending' 
       RETURNING id`,
      [messageId, postgresJobId]
    );

    // Se nenhuma linha foi atualizada, significa que o job já foi processado
    if (updateResult.rows.length === 0) {
      console.log(`⚠️ Job ${postgresJobId} já foi processado anteriormente. Pulando atualização.`);
      return;
    }

    // Atualizar estatísticas do disparo
    await DispatchService.updateStats(dispatchId, job.data.userId, {
      sent: 1,
    });

    // Excluir mensagem se configurado
    // Nota: A exclusão é feita de forma assíncrona após o delay
    // Se falhar, o disparo será pausado na próxima verificação
    // Verificar se messageId é válido (não é um ID temporário)
    const isValidMessageId = messageId && !messageId.startsWith('temp_');
    
    // Usar o remoteJid real da resposta da API (pode ser diferente do que enviamos)
    const remoteJidForDelete = actualRemoteJid;
    console.log(`🗑️ RemoteJid para exclusão: ${remoteJidForDelete} (original enviado: ${remoteJid})`);
    
    if (settings.autoDelete && isValidMessageId) {
      console.log(`⏰ Agendando exclusão automática: messageId=${messageId}, remoteJid=${remoteJidForDelete}, delay=${settings.deleteDelay}${settings.deleteDelayUnit || 'seconds'}`);
      const deleteDelayMs = settings.deleteDelay
        ? convertDelayToMs(settings.deleteDelay, settings.deleteDelayUnit || 'seconds')
        : 0;

      if (deleteDelayMs > 0) {
        // Agendar exclusão assíncrona
        setTimeout(async () => {
          try {
            const deleted = await deleteMessageForEveryone(instanceName, messageId, remoteJidForDelete);
            if (!deleted) {
              // Se falhar na exclusão, parar o disparo (conforme requisito)
              console.error(`❌ Falha ao excluir mensagem ${messageId} do disparo ${dispatchId}`);
              try {
                await DispatchService.update(dispatchId, job.data.userId, {
                  status: 'paused', // Pausar ao invés de failed para evitar problemas
                });
              } catch (updateError: any) {
                console.error(`❌ Erro ao atualizar status do disparo:`, updateError);
              }
              
              // Cancelar jobs pendentes deste disparo
              await pgPool.query(
                `UPDATE dispatch_jobs SET status = 'failed', error_message = $1 
                 WHERE dispatch_id = $2 AND status = 'pending'`,
                ['Disparo pausado: falha ao excluir mensagem automaticamente', dispatchId]
              );
            } else {
              console.log(`✅ Mensagem ${messageId} excluída com sucesso após delay`);
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            console.error(`❌ Erro ao excluir mensagem ${messageId}:`, errorMessage);
            // Parar disparo em caso de erro - usar paused ao invés de failed
            try {
              await DispatchService.update(dispatchId, job.data.userId, {
                status: 'paused',
              });
            } catch (updateError: any) {
              console.error(`❌ Erro ao atualizar status do disparo:`, updateError);
            }
          }
        }, deleteDelayMs);
      } else {
        // Sem delay, excluir imediatamente
        console.log(`🗑️ Excluindo mensagem imediatamente: messageId=${messageId}, remoteJid=${remoteJidForDelete}`);
        const deleted = await deleteMessageForEveryone(instanceName, messageId, remoteJidForDelete);
        if (!deleted) {
          // Se falhar na exclusão, parar o disparo imediatamente
          console.error(`❌ Falha ao excluir mensagem imediatamente: ${messageId}`);
          try {
            await DispatchService.update(dispatchId, job.data.userId, {
              status: 'paused', // Pausar ao invés de failed
            });
          } catch (updateError: any) {
            console.error(`❌ Erro ao atualizar status do disparo:`, updateError);
          }
          throw new Error('Falha ao excluir mensagem automaticamente');
        }
        console.log(`✅ Mensagem excluída imediatamente: ${messageId}`);
      }
    } else if (settings.autoDelete && !isValidMessageId) {
      console.warn(`⚠️ Não é possível excluir mensagem: messageId inválido (${messageId})`);
    }
  } catch (error: unknown) {
    // Verificar se é erro de número inválido (não existe no WhatsApp)
    // O erro vem no formato: "HTTP 400 Bad Request\nPATH: ...\nRESPONSE: {...}"
    let isInvalidNumber = false;
    const baseErrorMessage = error instanceof Error ? error.message : String(error);
    let errorMessage = baseErrorMessage || 'Erro desconhecido';

    // Tentar extrair a resposta JSON do erro
    if (baseErrorMessage) {
      const responseMatch = baseErrorMessage.match(/RESPONSE:\s*({[\s\S]*})/);
      if (responseMatch) {
        try {
          const responseData = JSON.parse(responseMatch[1]);
          // Verificar se a resposta indica que o número não existe
          if (responseData.response?.message) {
            const messages = Array.isArray(responseData.response.message) 
              ? responseData.response.message 
              : [responseData.response.message];
            
            isInvalidNumber = messages.some((msg: any) => msg.exists === false);
          }
        } catch {
          // Se não conseguir parsear, verificar na string
          isInvalidNumber = baseErrorMessage.includes('"exists":false') || 
                           baseErrorMessage.includes("'exists':false");
        }
      } else {
        // Verificar diretamente na mensagem
        isInvalidNumber = baseErrorMessage.includes('"exists":false') || 
                         baseErrorMessage.includes("'exists':false");
      }
    }

    let jobStatus: 'failed' | 'invalid' = 'failed';

    if (isInvalidNumber) {
      jobStatus = 'invalid';
      errorMessage = 'Número não existe no WhatsApp';
      console.log(`⚠️ Número inválido (não existe no WhatsApp): ${contactData.phone}`);
    } else {
      console.error(`❌ Erro ao processar job:`, errorMessage);
    }

    // Atualizar job usando o ID do PostgreSQL
    await pgPool.query(
      `UPDATE dispatch_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [jobStatus, errorMessage, postgresJobId]
    );

    // Atualizar estatísticas
    if (jobStatus === 'invalid') {
      await DispatchService.updateStats(dispatchId, job.data.userId, {
        invalid: 1,
      });
      // Para números inválidos, não fazer throw - já sabemos que não existe, não adianta tentar novamente
      return;
    } else {
      await DispatchService.updateStats(dispatchId, job.data.userId, {
        failed: 1,
      });
      // Para outros erros, fazer throw para que o Bull possa tentar novamente
      throw error;
    }
  }
};

/**
 * Processar uma etapa de sequência
 */
const processSequenceStep = async (
  instanceName: string,
  remoteJid: string,
  step: { type: string; content: any },
  contact: any,
  defaultName?: string
): Promise<{ messageId: string; actualRemoteJid: string }> => {
  const personalizedContent = replaceVariablesInContent(step.content, contact, defaultName || 'Cliente');

  switch (step.type) {
    case 'text':
      return await sendTextMessage(instanceName, remoteJid, personalizedContent.text);
    case 'image':
      return await sendImageMessage(instanceName, remoteJid, personalizedContent.imageUrl);
    case 'image_caption':
      return await sendImageMessage(instanceName, remoteJid, personalizedContent.imageUrl, personalizedContent.caption);
    case 'video':
      return await sendVideoMessage(instanceName, remoteJid, personalizedContent.videoUrl);
    case 'video_caption':
      return await sendVideoMessage(instanceName, remoteJid, personalizedContent.videoUrl, personalizedContent.caption);
    case 'audio':
      return await sendAudioMessage(instanceName, remoteJid, personalizedContent.audioUrl);
    case 'file':
      return await sendFileMessage(instanceName, remoteJid, personalizedContent.fileUrl, personalizedContent.fileName);
    default:
      throw new Error(`Tipo de etapa não suportado: ${step.type}`);
  }
};

