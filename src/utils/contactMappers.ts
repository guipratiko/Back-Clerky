/**
 * Utilitários para mapear contatos do formato do service para o formato da API
 */

import { Contact } from '../services/contactService';
import { CRMColumn } from '../services/crmColumnService';

/**
 * Mapeia um contato para o formato de resposta da API
 */
export function mapContactToApiFormat(
  contact: Contact,
  columnMap: Map<string, CRMColumn>
): {
  id: string;
  instanceId: string;
  remoteJid: string;
  phone: string;
  name: string;
  profilePicture: string | null;
  columnId: string | null;
  columnName: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    order: number;
  }>;
} {
  const column = contact.columnId ? columnMap.get(contact.columnId) : null;
  
  return {
    id: contact.id,
    instanceId: contact.instanceId,
    remoteJid: contact.remoteJid,
    phone: contact.phone,
    name: contact.name,
    profilePicture: contact.profilePicture || null,
    columnId: contact.columnId || null,
    columnName: column?.name || null,
    unreadCount: contact.unreadCount || 0,
    lastMessage: contact.lastMessage || null,
    lastMessageAt: contact.lastMessageAt?.toISOString() || null,
    createdAt: contact.createdAt.toISOString(),
    labels: contact.labels || [],
  };
}

/**
 * Mapeia múltiplos contatos para o formato de resposta da API
 */
export function mapContactsToApiFormat(
  contacts: Contact[],
  columns: CRMColumn[]
): Array<ReturnType<typeof mapContactToApiFormat>> {
  const columnMap = new Map(columns.map((col) => [col.id, col]));
  return contacts.map((contact) => mapContactToApiFormat(contact, columnMap));
}

