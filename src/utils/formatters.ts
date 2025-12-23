/**
 * Utilitários para formatação e normalização de dados
 */

/**
 * Normaliza nome: primeira letra maiúscula, demais minúsculas
 * Ex: "joão silva" -> "João Silva"
 */
export const normalizeName = (name: string): string => {
  if (!name) return '';
  
  return name
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

/**
 * Formata telefone do WhatsApp para exibição
 * Remove @s.whatsapp.net, remove os 2 primeiros dígitos (55) e formata
 * Ex: "556298448536@s.whatsapp.net" -> "62 9844-8536"
 */
export const formatWhatsAppPhone = (remoteJid: string): string => {
  if (!remoteJid) return '';

  // Remover @s.whatsapp.net e outros sufixos
  let phone = remoteJid.replace(/@.*$/, '');

  // Remover caracteres não numéricos
  phone = phone.replace(/\D/g, '');

  // Remover os 2 primeiros dígitos (código do país 55)
  if (phone.length >= 2 && phone.startsWith('55')) {
    phone = phone.substring(2);
  }

  // Formatar: XX XXXX-XXXX
  if (phone.length === 10) {
    return `${phone.substring(0, 2)} ${phone.substring(2, 6)}-${phone.substring(6)}`;
  } else if (phone.length === 11) {
    // Se tiver 11 dígitos, pode ser com 9º dígito
    return `${phone.substring(0, 2)} ${phone.substring(2, 7)}-${phone.substring(7)}`;
  }

  // Se não conseguir formatar, retorna os números limpos
  return phone;
};

/**
 * Normaliza timestamp do WhatsApp para Date
 * A Evolution API pode enviar timestamp em segundos (Unix) ou milissegundos
 * Retorna um Date válido
 */
export const normalizeWhatsAppTimestamp = (timestamp: any): Date => {
  if (!timestamp) {
    return new Date();
  }

  // Se já for um Date, retornar
  if (timestamp instanceof Date) {
    return timestamp;
  }

  // Converter para número
  const ts = Number(timestamp);

  // Se for NaN, retornar data atual
  if (isNaN(ts)) {
    return new Date();
  }

  // Se o timestamp tiver menos de 13 dígitos, está em segundos (Unix timestamp)
  // Timestamps em milissegundos têm 13 dígitos (ex: 1704067200000)
  // Timestamps em segundos têm 10 dígitos (ex: 1704067200)
  if (ts < 10000000000) {
    // Está em segundos, converter para milissegundos
    return new Date(ts * 1000);
  }

  // Já está em milissegundos
  return new Date(ts);
};

