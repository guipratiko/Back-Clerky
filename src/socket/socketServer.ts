import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Instance from '../models/Instance';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { JWT_CONFIG, SERVER_CONFIG } from '../config/constants';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: SERVER_CONFIG.CORS_ORIGIN,
      credentials: true,
    },
  });

  // Middleware de autenticação
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Token não fornecido'));
    }

    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET) as { id: string };
      socket.userId = decoded.id.toString(); // Garantir que é string
      console.log(`🔐 [Socket] Usuário autenticado: ${socket.userId} (tipo: ${typeof socket.userId})`);
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`✅ Cliente conectado: ${socket.id} (User: ${socket.userId})`);

    // Adicionar socket à sala do usuário para receber eventos específicos
    if (socket.userId) {
      const userIdStr = socket.userId.toString();
      socket.join(userIdStr);
      console.log(`📦 Socket ${socket.id} entrou na sala do usuário: ${userIdStr} (tipo: ${typeof userIdStr})`);
      
      // Também adicionar à sala com ObjectId original (caso seja necessário)
      socket.join(socket.userId);
    }

    // Quando cliente solicita verificação de status
    socket.on('check-instance-status', async (instanceId: string) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Usuário não autenticado' });
          return;
        }

        const instance = await Instance.findOne({
          _id: instanceId,
          userId: socket.userId,
        });

        if (!instance) {
          socket.emit('error', { message: 'Instância não encontrada' });
          return;
        }

        // Verificar status na Evolution API
        const evolutionResponse = await requestEvolutionAPI(
          'GET',
          `/instance/connectionState/${encodeURIComponent(instance.instanceName)}`
        );

        const evolutionState =
          evolutionResponse.data?.state ||
          evolutionResponse.data?.status ||
          evolutionResponse.data?.instance?.state ||
          evolutionResponse.data?.instance?.status ||
          evolutionResponse.data?.connectionState?.state ||
          evolutionResponse.data?.connectionState?.status;

        let newStatus: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error' =
          instance.status;

        const normalizedState = String(evolutionState || '').toLowerCase().trim();

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

        // Atualizar no banco se mudou
        if (newStatus !== instance.status) {
          await Instance.updateOne({ _id: instanceId }, { status: newStatus });
        }

        // Emitir atualização
        socket.emit('instance-status-updated', {
          instanceId,
          status: newStatus,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao verificar status';
        console.error('Erro ao verificar status:', errorMessage);
        socket.emit('error', { message: errorMessage });
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketServer => {
  if (!io) {
    throw new Error('Socket.io não foi inicializado');
  }
  return io;
};

/**
 * Emitir evento de atualização de disparo para o usuário
 */
export const emitDispatchUpdate = (userId: string, dispatch: any): void => {
  if (!io) {
    return;
  }

  const userIdStr = userId.toString();
  console.log(`📤 Emitindo atualização de disparo para usuário ${userIdStr}: ${dispatch.id} -> status ${dispatch.status}`);
  
  io.to(userIdStr).emit('dispatch-updated', {
    dispatch: {
      id: dispatch.id,
      name: dispatch.name,
      status: dispatch.status,
      stats: dispatch.stats,
      settings: dispatch.settings,
      schedule: dispatch.schedule,
      defaultName: dispatch.defaultName,
      createdAt: dispatch.createdAt,
      startedAt: dispatch.startedAt,
      completedAt: dispatch.completedAt,
      updatedAt: dispatch.updatedAt,
    },
  });
};

// Função para verificar status de todas as instâncias de um usuário periodicamente
export const startStatusChecker = () => {
  setInterval(async () => {
    try {
      const instances = await Instance.find({}).lean();

      for (const instance of instances) {
        try {
          const evolutionResponse = await requestEvolutionAPI(
            'GET',
            `/instance/connectionState/${encodeURIComponent(instance.instanceName)}`
          );

          const evolutionState =
            evolutionResponse.data?.state ||
            evolutionResponse.data?.status ||
            evolutionResponse.data?.instance?.state ||
            evolutionResponse.data?.instance?.status;

          let newStatus: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error' =
            (instance.status || 'created') as 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';

          const normalizedState = String(evolutionState || '').toLowerCase().trim();

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

          // Atualizar no banco se mudou
          if (newStatus !== instance.status) {
            await Instance.updateOne({ _id: instance._id }, { status: newStatus });

            // Emitir atualização apenas para o usuário específico
            if (io && instance.userId) {
              const userIdStr = instance.userId.toString();
              const instanceIdStr = instance._id.toString();
              console.log(`📤 Emitindo evento para usuário ${userIdStr}: instância ${instanceIdStr} -> status ${newStatus}`);
              io.to(userIdStr).emit('instance-status-updated', {
                instanceId: instanceIdStr,
                status: newStatus,
              });
            }
          }
        } catch (error) {
          // Ignorar erros individuais
          console.error(`Erro ao verificar instância ${instance.instanceName}:`, error);
        }
      }
    } catch (error) {
      console.error('Erro no verificador de status:', error);
    }
  }, 10000); // Verificar a cada 10 segundos
};

