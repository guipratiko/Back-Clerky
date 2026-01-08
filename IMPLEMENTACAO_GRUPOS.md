# 📋 Resumo da Implementação - Movimentações de Grupos

## ✅ O que foi implementado

### 1. **Banco de Dados (PostgreSQL)**

#### Tabela: `group_movements`
Registra todas as movimentações de participantes em grupos:
- Entradas (`join`)
- Saídas (`leave`)
- Promoções a admin (`promote`)
- Remoções de admin (`demote`)

**Campos principais:**
- `user_id`, `instance_id`, `group_id`, `group_name`
- `participant_id`, `participant_phone`, `participant_name`
- `movement_type`, `is_admin`
- `action_by`, `action_by_phone`, `action_by_name` (quem realizou a ação)
- `created_at`

#### Tabela: `group_auto_messages`
Armazena configurações de mensagens automáticas:
- Mensagens de boas-vindas (`welcome`)
- Mensagens de despedida (`goodbye`)
- Pode ser específica para um grupo ou global (aplicada a todos)

**Campos principais:**
- `user_id`, `instance_id`, `group_id` (NULL = global)
- `message_type`, `message_text`, `is_active`

### 2. **Services**

#### `GroupMovementService`
- `createMovement()` - Registra movimentação
- `getMovements()` - Consulta com filtros e paginação
- `getStatistics()` - Estatísticas agregadas

#### `GroupAutoMessageService`
- `upsertAutoMessage()` - Cria/atualiza mensagem automática
- `getAutoMessageForGroup()` - Busca mensagem (específica ou global)
- `sendAutoMessage()` - Envia mensagem individual ao contato

### 3. **Webhook Handler**

#### `handleGroupParticipantsUpdate()`
Processa o evento `GROUP_PARTICIPANTS_UPDATE` da Evolution API:
1. Extrai dados do evento (grupo, participantes, ação)
2. Registra movimentação no banco
3. Envia mensagem automática (se configurada)
4. Emite evento WebSocket para frontend

### 4. **API Endpoints**

#### Movimentações
- `GET /api/groups/movements` - Listar movimentações (com filtros)
- `GET /api/groups/movements/statistics` - Estatísticas

#### Mensagens Automáticas
- `POST /api/groups/auto-messages` - Criar/atualizar mensagem
- `GET /api/groups/auto-messages` - Listar mensagens
- `PUT /api/groups/auto-messages/:id` - Atualizar mensagem
- `DELETE /api/groups/auto-messages/:id` - Deletar mensagem

## 🚀 Como usar

### Passo 1: Executar Migration

```bash
cd Backend
npm run migrate
```

### Passo 2: Configurar Mensagem Automática (Opcional)

```bash
# Mensagem global de boas-vindas
POST /api/groups/auto-messages
{
  "instanceId": "...",
  "messageType": "welcome",
  "messageText": "Olá {name}! Bem-vindo ao grupo {group}! 🎉"
}

# Mensagem específica para um grupo
POST /api/groups/auto-messages
{
  "instanceId": "...",
  "groupId": "120363123456789012@g.us",
  "messageType": "welcome",
  "messageText": "Bem-vindo ao nosso grupo exclusivo!"
}
```

### Passo 3: Verificar se está funcionando

1. Adicione ou remova alguém de um grupo no WhatsApp
2. Verifique os logs do servidor
3. Consulte o histórico:
   ```bash
   GET /api/groups/movements?instanceId=...
   ```

## 📊 Variáveis Disponíveis nas Mensagens

- `{name}` → Nome do participante
- `{phone}` → Telefone do participante  
- `{group}` → Nome do grupo

## 🔍 Filtros Disponíveis

### Movimentações
- `instanceId` - Filtrar por instância
- `groupId` - Filtrar por grupo
- `participantId` - Filtrar por participante
- `movementType` - Filtrar por tipo (join, leave, promote, demote)
- `startDate` - Data inicial
- `endDate` - Data final
- `page` - Página (padrão: 1)
- `limit` - Limite por página (padrão: 50, máx: 100)

## 📝 Notas Importantes

1. **Mensagens são enviadas individualmente** - Não são enviadas no grupo, mas diretamente para o contato
2. **Mensagens globais têm prioridade menor** - Se houver mensagem específica do grupo, ela será usada
3. **Mensagens automáticas só funcionam para `join` e `leave`** - Promoções e remoções não enviam mensagens
4. **O evento WebSocket `group-participants-updated`** é emitido para atualizar o frontend em tempo real

## 🐛 Troubleshooting

### Migration não executa
- Verificar conexão com PostgreSQL
- Verificar se as migrations anteriores foram executadas

### Webhook não processa
- Verificar se `GROUP_PARTICIPANTS_UPDATE` está no `.env`
- Verificar logs do servidor
- Verificar se a instância existe no MongoDB

### Mensagem automática não envia
- Verificar se há mensagem configurada e ativa
- Verificar logs para erros
- Verificar se o número do participante está correto

## 📚 Documentação Adicional

- Ver `TESTE_GROUP_PARTICIPANTS_UPDATE.md` para guia completo de testes
- Ver código em:
  - `src/controllers/webhookController.ts` → `handleGroupParticipantsUpdate()`
  - `src/services/groupMovementService.ts`
  - `src/services/groupAutoMessageService.ts`
  - `src/controllers/groupMovementController.ts`
