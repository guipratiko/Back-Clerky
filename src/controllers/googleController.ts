import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GoogleSheetsService } from '../services/googleSheetsService';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Iniciar autenticação OAuth do Google
 * GET /api/google/auth
 */
export const googleAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { nodeId, workflowId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    console.log('🔐 Iniciando autenticação Google:', { userId, nodeId, workflowId });

    const authUrl = await GoogleSheetsService.getAuthUrl(userId, nodeId as string, workflowId as string);

    console.log('✅ URL de autenticação gerada com sucesso');

    res.status(200).json({
      status: 'success',
      authUrl,
    });
  } catch (error: unknown) {
    console.error('❌ Erro ao obter URL de autenticação:', error);
    // Retornar mensagem mais específica
    if (error instanceof Error) {
      if (error.message.includes('GOOGLE_CLIENT_ID') || error.message.includes('GOOGLE_CLIENT_SECRET')) {
        return next(handleControllerError(error, 'Erro ao obter URL de autenticação: Configuração do Google OAuth não encontrada. Verifique as variáveis de ambiente GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'));
      }
      return next(handleControllerError(error, `Erro ao obter URL de autenticação: ${error.message}`));
    }
    return next(handleControllerError(error, 'Erro ao iniciar autenticação Google'));
  }
};

/**
 * Callback do OAuth do Google
 * GET /api/google/auth/callback
 */
export const googleAuthCallback = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code) {
      res.status(400).send(`
        <html>
          <body>
            <h1>Erro na autenticação</h1>
            <p>Código de autorização não recebido.</p>
            <script>
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', message: 'Código de autorização não recebido' }, '*');
              window.close();
            </script>
          </body>
        </html>
      `);
    }

    // Parsear state (userId:nodeId:workflowId)
    const stateParts = (state as string).split(':');
    const userId = stateParts[0];
    const nodeId = stateParts[1] || '';
    const workflowId = stateParts[2] || '';

    try {
      const tokens = await GoogleSheetsService.handleAuthCallback(code as string, userId);

      // Enviar mensagem para o popup
      res.send(`
        <html>
          <head>
            <title>Autenticação Google</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                padding: 2rem;
                border-radius: 10px;
                backdrop-filter: blur(10px);
              }
              h1 { margin: 0 0 1rem 0; }
              p { margin: 0.5rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✅ Autenticação bem-sucedida!</h1>
              <p>Você pode fechar esta janela.</p>
            </div>
            <script>
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_SUCCESS',
                userId: '${userId}',
                nodeId: '${nodeId}',
                workflowId: '${workflowId}'
              }, '*');
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro no callback:', errorMessage);
      res.send(`
        <html>
          <head>
            <title>Erro na Autenticação</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #fee;
                color: #c33;
              }
              .container {
                text-align: center;
                background: white;
                padding: 2rem;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Erro na autenticação</h1>
              <p>${error.message || 'Ocorreu um erro ao processar a autenticação.'}</p>
            </div>
            <script>
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_ERROR', 
                message: '${error.message || 'Erro ao processar autenticação'}'
              }, '*');
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    }
  } catch (error: unknown) {
    console.error('Erro no callback do Google:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Erro na autenticação</h1>
          <p>Ocorreu um erro ao processar a autenticação.</p>
          <script>
            window.opener.postMessage({ 
              type: 'GOOGLE_AUTH_ERROR', 
              message: 'Erro ao processar autenticação' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  }
};

/**
 * Testar conexão com Google
 * GET /api/google/test
 */
export const testGoogleConnection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const isConnected = await GoogleSheetsService.isUserAuthenticated(userId);

    res.status(200).json({
      status: 'success',
      isConnected,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao testar conexão Google'));
  }
};

/**
 * Criar planilha no Google Sheets
 * POST /api/google/spreadsheet
 */
export const createSpreadsheet = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, sheetName } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!name) {
      return next(createValidationError('Nome da planilha é obrigatório'));
    }

    // Verificar se usuário está autenticado
    const isAuthenticated = await GoogleSheetsService.isUserAuthenticated(userId);
    if (!isAuthenticated) {
      return next(createValidationError('Usuário não autenticado com Google. Por favor, autentique primeiro.'));
    }

    const spreadsheet = await GoogleSheetsService.createSpreadsheet(
      userId,
      name,
      sheetName || 'Sheet1'
    );

    res.status(200).json({
      status: 'success',
      spreadsheet: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        url: spreadsheet.url,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar planilha'));
  }
};

/**
 * Listar planilhas do usuário
 * GET /api/google/spreadsheets
 */
export const listSpreadsheets = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Verificar se usuário está autenticado
    const isAuthenticated = await GoogleSheetsService.isUserAuthenticated(userId);
    if (!isAuthenticated) {
      return next(createValidationError('Usuário não autenticado com Google. Por favor, autentique primeiro.'));
    }

    const spreadsheets = await GoogleSheetsService.listSpreadsheets(userId);

    res.status(200).json({
      status: 'success',
      spreadsheets,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar planilhas'));
  }
};

