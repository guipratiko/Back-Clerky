import { InstanceLean } from '../controllers/instanceController';

/**
 * Formata uma instância para resposta da API
 */
export const formatInstanceResponse = (instance: InstanceLean) => {
  const webhookEvents = instance.webhook?.events || {};
  const activeEvents = Object.keys(webhookEvents).filter((key) => {
    const value = webhookEvents[key as keyof typeof webhookEvents];
    return value === true;
  });

  return {
    id: instance._id?.toString() || '',
    name: instance.name || '',
    instanceName: instance.instanceName || '',
    instanceId: instance.instanceId || null,
    token: instance.token || undefined,
    qrcode: instance.qrcode ?? true,
    qrcodeBase64: instance.qrcodeBase64 || null,
    status: instance.status || 'created',
    integration: instance.integration || 'WHATSAPP-BAILEYS',
    webhook: {
      url: instance.webhook?.url || '',
      events: activeEvents,
    },
    settings: {
      rejectCall: instance.rejectCall ?? false,
      groupsIgnore: instance.groupsIgnore ?? false,
      alwaysOnline: instance.alwaysOnline ?? false,
      readMessages: instance.readMessages ?? false,
      readStatus: instance.readStatus ?? false,
      syncFullHistory: instance.syncFullHistory ?? true,
    },
    createdAt: instance.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: instance.updatedAt?.toISOString() || new Date().toISOString(),
  };
};


