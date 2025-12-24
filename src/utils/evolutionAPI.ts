import { https } from 'follow-redirects';

/**
 * Helper para fazer requisições HTTPS para Evolution API
 */
import { EVOLUTION_CONFIG } from '../config/constants';

export const requestEvolutionAPI = async (
  method: string,
  path: string,
  body?: any
): Promise<{ statusCode: number; data: any }> => {
  const hostname = EVOLUTION_CONFIG.HOST;
  const apiKey = EVOLUTION_CONFIG.API_KEY;

  if (!apiKey) {
    throw new Error('EVOLUTION_APIKEY não configurada no .env');
  }

  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;

    const options = {
      hostname,
      method,
      path,
      headers: {
        apikey: apiKey,
        ...(body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': data!.length,
            }
          : {}),
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
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;

        let parsed: any = raw;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          // Se não conseguir parsear, mantém como string
        }

        if (!ok) {
          return reject(
            new Error(
              `HTTP ${res.statusCode} ${res.statusMessage}\nPATH: ${path}\nRESPONSE: ${raw}`
            )
          );
        }

        resolve({ statusCode: res.statusCode || 200, data: parsed });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout na requisição para Evolution API'));
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
};

/**
 * Busca a URL da foto de perfil de um contato
 */
export const fetchProfilePictureUrl = async (
  instanceName: string,
  number: string
): Promise<string | null> => {
  const hostname = EVOLUTION_CONFIG.HOST;
  const apiKey = EVOLUTION_CONFIG.API_KEY;

  if (!apiKey) {
    throw new Error('EVOLUTION_APIKEY não configurada no .env');
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ number });
    const data = Buffer.from(postData, 'utf8');

    const options = {
      hostname,
      method: 'POST',
      path: `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
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
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;

        if (!ok) {
          // Se não encontrar foto, retornar null (não é erro)
          if (res.statusCode === 404 || res.statusCode === 400) {
            return resolve(null);
          }
          return reject(
            new Error(
              `HTTP ${res.statusCode} ${res.statusMessage}\nPATH: ${options.path}\nRESPONSE: ${raw}`
            )
          );
        }

        try {
          const parsed = raw ? JSON.parse(raw) : {};
          // A resposta pode ter a URL em diferentes campos
          const profilePictureUrl = 
            parsed.url || 
            parsed.profilePictureUrl || 
            parsed.profilePicture || 
            parsed.data?.url ||
            parsed.data?.profilePictureUrl ||
            null;
          resolve(profilePictureUrl);
        } catch {
          // Se não conseguir parsear, retornar null
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      // Em caso de erro, retornar null (não é crítico)
      console.error('Erro ao buscar foto de perfil:', error);
      resolve(null);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      // Timeout não é crítico, retornar null
      resolve(null);
    });

    req.write(data);
    req.end();
  });
};

/**
 * Envia mensagem via Evolution API (suporta texto, imagem, vídeo, áudio, arquivo)
 */
export const sendMessage = async (
  instanceName: string,
  payload: {
    number: string;
    text?: string;
    image?: string;
    video?: string;
    audio?: string;
    document?: string;
    caption?: string;
    fileName?: string;
  }
): Promise<any> => {
  try {
    let path = '';
    let body: any = {
      number: payload.number,
    };

    if (payload.text) {
      // Mensagem de texto
      path = `/message/sendText/${encodeURIComponent(instanceName)}`;
      body.text = payload.text;
    } else if (payload.image) {
      // Imagem (com ou sem legenda)
      path = `/message/sendMedia/${encodeURIComponent(instanceName)}`;
      body.mediatype = 'image';
      body.media = payload.image;
      if (payload.caption) {
        body.caption = payload.caption;
      }
    } else if (payload.video) {
      // Vídeo (com ou sem legenda)
      path = `/message/sendMedia/${encodeURIComponent(instanceName)}`;
      body.mediatype = 'video';
      body.media = payload.video;
      if (payload.caption) {
        body.caption = payload.caption;
      }
    } else if (payload.audio) {
      // Áudio
      path = `/message/sendMedia/${encodeURIComponent(instanceName)}`;
      body.mediatype = 'audio';
      body.media = payload.audio;
    } else if (payload.document) {
      // Arquivo
      path = `/message/sendMedia/${encodeURIComponent(instanceName)}`;
      body.mediatype = 'document';
      body.media = payload.document;
      body.fileName = payload.fileName || 'arquivo';
    } else {
      throw new Error('Tipo de mensagem não especificado');
    }

    const response = await requestEvolutionAPI('POST', path, body);
    return response.data;
  } catch (error) {
    console.error('Erro ao enviar mensagem via Evolution API:', error);
    throw error;
  }
};

