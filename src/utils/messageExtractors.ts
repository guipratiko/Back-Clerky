/**
 * Utilitários para extrair dados de mensagens do webhook da Evolution API
 */

export interface ExtractedMessageData {
  remoteJid: string | null;
  fromMe: boolean;
  pushName: string | null;
  conversation: string | null;
  messageType: string | null;
  base64: string | null;
  messageId: string | null;
  messageTimestamp: any;
}

/**
 * Extrai dados de uma mensagem do webhook de forma consistente
 */
export const extractMessageData = (msg: any): ExtractedMessageData => {
  const messageData = msg.data || msg;

  return {
    remoteJid:
      msg.remoteJid ||
      messageData.remoteJid ||
      msg.key?.remoteJid ||
      messageData.key?.remoteJid ||
      null,
    fromMe:
      msg.fromMe !== undefined
        ? msg.fromMe
        : messageData.fromMe !== undefined
        ? messageData.fromMe
        : msg.key?.fromMe !== undefined
        ? msg.key.fromMe
        : false,
    pushName:
      msg.pushName ||
      messageData.pushName ||
      msg.sender?.pushName ||
      messageData.sender?.pushName ||
      null,
    conversation:
      msg.conversation ||
      messageData.conversation ||
      msg.message?.conversation ||
      messageData.message?.conversation ||
      msg.data?.message?.conversation ||
      null,
    messageType:
      msg.messageType ||
      messageData.messageType ||
      msg.message?.messageType ||
      messageData.message?.messageType ||
      null,
    base64:
      msg.base64 ||
      messageData.base64 ||
      msg.message?.base64 ||
      messageData.message?.base64 ||
      null,
    messageId:
      msg.key?.id ||
      messageData.key?.id ||
      `msg_${Date.now()}_${Math.random()}`,
    messageTimestamp:
      msg.messageTimestamp ||
      messageData.messageTimestamp ||
      msg.messageTimestampLong ||
      messageData.messageTimestampLong ||
      msg.timestamp ||
      messageData.timestamp ||
      msg.key?.timestamp ||
      messageData.key?.timestamp ||
      null,
  };
};






