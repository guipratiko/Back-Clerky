/**
 * Middleware de proxy para redirecionar requisições de disparos para o microserviço
 */

import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import multer from 'multer';
import FormData from 'form-data';

const DISPATCH_SERVICE_URL = process.env.DISPATCH_SERVICE_URL || 'http://localhost:4332';

// Multer para processar arquivos antes de enviar ao microserviço
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

/**
 * Proxy para redirecionar requisições de /api/dispatches/* para o microserviço
 */
export const dispatchProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Se for multipart/form-data, processar com multer primeiro
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
      
      // Continuar com o proxy após processar o arquivo
      await proxyRequest(req, res, next);
    });
  }
  
  // Para outras requisições, fazer proxy direto
  await proxyRequest(req, res, next);
};

async function proxyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Construir URL do microserviço
    let path = req.path;
    if (!path.startsWith('/dispatches')) {
      path = `/dispatches${path}`;
    }
    const targetUrl = `${DISPATCH_SERVICE_URL}/api${path}`;
    
    // Preparar headers
    const headers: any = {};
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    // Fazer requisição para o microserviço
    const config: any = {
      method: req.method,
      url: targetUrl,
      headers,
      timeout: 30000,
    };

    // Adicionar query params
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    // Se multer processou um arquivo, criar FormData
    if ((req as any).file) {
      const formData = new FormData();
      formData.append('file', (req as any).file.buffer, {
        filename: (req as any).file.originalname,
        contentType: (req as any).file.mimetype,
      });
      
      // Adicionar outros campos do body
      if (req.body) {
        Object.keys(req.body).forEach((key) => {
          if (key !== 'file') {
            formData.append(key, req.body[key]);
          }
        });
      }

      config.data = formData;
      config.headers = {
        ...formData.getHeaders(),
        ...headers,
      };
      config.maxContentLength = Infinity;
      config.maxBodyLength = Infinity;
    } else {
      // Para requisições normais (JSON)
      config.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
      
      // Adicionar body se existir
      if (req.body && Object.keys(req.body).length > 0) {
        config.data = req.body;
      }
    }

    const response = await axios(config);

    // Retornar resposta do microserviço
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      console.error(`❌ [Proxy] Erro:`, axiosError.code, axiosError.message);
      
      // Se o microserviço não estiver rodando
      if (axiosError.code === 'ECONNREFUSED') {
        console.error(`❌ [Proxy] Microserviço não está rodando em ${DISPATCH_SERVICE_URL}`);
        return res.status(503).json({
          status: 'error',
          message: 'Serviço de disparos temporariamente indisponível',
        });
      }

      // Retornar erro do microserviço
      if (axiosError.response) {
        console.error(`❌ [Proxy] Erro do microserviço:`, axiosError.response.status, axiosError.response.data);
        return res.status(axiosError.response.status).json(axiosError.response.data);
      }
    }

    console.error(`❌ [Proxy] Erro genérico:`, error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao processar requisição',
    });
  }
}

