# Guia de Teste - GROUP_PARTICIPANTS_UPDATE

Este documento explica como testar a funcionalidade de movimentações de grupos e mensagens automáticas.

## 📋 Pré-requisitos

1. **Executar a Migration**
   ```bash
   cd Backend
   npm run migrate
   ```
   
   Isso criará as tabelas:
   - `group_movements`
   - `group_auto_messages`

2. **Verificar se o evento está configurado**
   - O evento `GROUP_PARTICIPANTS_UPDATE` já está no `.env` (linha 28)
   - Verificar se a Evolution API está enviando este evento

## 🧪 Teste 1: Verificar Handler do Webhook

### Payload de Teste

A Evolution API envia eventos no formato:

```json
{
  "event": "GROUP_PARTICIPANTS_UPDATE",
  "instance": "nome_da_instancia",
  "data": {
    "groupJid": "120363123456789012@g.us",
    "groupName": "Nome do Grupo",
    "action": "add",
    "participants": [
      {
        "id": "556298448536@s.whatsapp.net",
        "name": "João Silva",
        "isAdmin": false
      }
    ],
    "actionBy": {
      "id": "556299999999@s.whatsapp.net",
      "name": "Admin do Grupo"
    }
  }
}
```

### Ações Suportadas

- `add` ou `join` → Registra como `join` e envia mensagem de boas-vindas
- `remove` ou `leave` → Registra como `leave` e envia mensagem de despedida
- `promote` → Registra como `promote`
- `demote` → Registra como `demote`

### Teste Manual via cURL

```bash
# Substituir {instanceName} pelo nome real da instância
curl -X POST http://localhost:4331/webhook/api/{instanceName} \
  -H "Content-Type: application/json" \
  -d '{
    "event": "GROUP_PARTICIPANTS_UPDATE",
    "instance": "{instanceName}",
    "data": {
      "groupJid": "120363123456789012@g.us",
      "groupName": "Grupo de Teste",
      "action": "add",
      "participants": [
        {
          "id": "556298448536@s.whatsapp.net",
          "name": "João Silva",
          "isAdmin": false
        }
      ]
    }
  }'
```

### Verificar Logs

O handler deve:
1. ✅ Logar: `👥 Atualização de participantes do grupo`
2. ✅ Logar: `📋 Grupo: Nome do Grupo`
3. ✅ Logar: `🔧 Ação: add`
4. ✅ Logar: `✅ Movimentação registrada: join - João Silva`
5. ✅ Se houver mensagem automática configurada, enviar mensagem

## 🧪 Teste 2: Configurar Mensagem Automática

### Criar Mensagem de Boas-vindas Global

```bash
curl -X POST http://localhost:4331/api/groups/auto-messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {seu_token_jwt}" \
  -d '{
    "instanceId": "{instance_id}",
    "messageType": "welcome",
    "messageText": "Olá {name}! Bem-vindo ao grupo {group}! 🎉"
  }'
```

### Criar Mensagem de Despedida Global

```bash
curl -X POST http://localhost:4331/api/groups/auto-messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {seu_token_jwt}" \
  -d '{
    "instanceId": "{instance_id}",
    "messageType": "goodbye",
    "messageText": "Até logo {name}! Foi um prazer ter você no grupo {group}."
  }'
```

### Criar Mensagem Específica para um Grupo

```bash
curl -X POST http://localhost:4331/api/groups/auto-messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {seu_token_jwt}" \
  -d '{
    "instanceId": "{instance_id}",
    "groupId": "120363123456789012@g.us",
    "messageType": "welcome",
    "messageText": "Bem-vindo ao nosso grupo exclusivo, {name}!"
  }'
```

### Variáveis Disponíveis

- `{name}` → Nome do participante
- `{phone}` → Telefone do participante
- `{group}` → Nome do grupo

## 🧪 Teste 3: Consultar Histórico de Movimentações

### Listar Todas as Movimentações

```bash
curl -X GET "http://localhost:4331/api/groups/movements?page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Filtrar por Instância

```bash
curl -X GET "http://localhost:4331/api/groups/movements?instanceId={instance_id}&page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Filtrar por Grupo

```bash
curl -X GET "http://localhost:4331/api/groups/movements?groupId=120363123456789012@g.us&page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Filtrar por Tipo de Movimentação

```bash
# Apenas entradas
curl -X GET "http://localhost:4331/api/groups/movements?movementType=join&page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"

# Apenas saídas
curl -X GET "http://localhost:4331/api/groups/movements?movementType=leave&page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Filtrar por Período

```bash
curl -X GET "http://localhost:4331/api/groups/movements?startDate=2025-01-01&endDate=2025-01-31&page=1&limit=50" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Obter Estatísticas

```bash
curl -X GET "http://localhost:4331/api/groups/movements/statistics?instanceId={instance_id}" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

Resposta esperada:
```json
{
  "status": "success",
  "data": {
    "totalJoins": 10,
    "totalLeaves": 3,
    "totalPromotes": 2,
    "totalDemotes": 1,
    "uniqueParticipants": 15,
    "uniqueGroups": 5
  }
}
```

## 🧪 Teste 4: Gerenciar Mensagens Automáticas

### Listar Todas as Mensagens Automáticas

```bash
curl -X GET "http://localhost:4331/api/groups/auto-messages?instanceId={instance_id}" \
  -H "Authorization: Bearer {seu_token_jwt}"
```

### Atualizar Mensagem Automática

```bash
curl -X PUT http://localhost:4331/api/groups/auto-messages/{message_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {seu_token_jwt}" \
  -d '{
    "messageText": "Nova mensagem de boas-vindas!",
    "isActive": true
  }'
```

### Desativar Mensagem Automática

```bash
curl -X PUT http://localhost:4331/api/groups/auto-messages/{message_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {seu_token_jwt}" \
  -d '{
    "isActive": false
  }'
```

### Deletar Mensagem Automática

```bash
curl -X DELETE http://localhost:4331/api/groups/auto-messages/{message_id} \
  -H "Authorization: Bearer {seu_token_jwt}"
```

## 🔍 Verificação no Banco de Dados

### Verificar Movimentações Registradas

```sql
SELECT 
  gm.*,
  c.name as contact_name
FROM group_movements gm
LEFT JOIN contacts c ON c.remote_jid = gm.participant_id
ORDER BY gm.created_at DESC
LIMIT 10;
```

### Verificar Mensagens Automáticas Configuradas

```sql
SELECT * FROM group_auto_messages
WHERE user_id = '{user_id}'
ORDER BY instance_id, group_id NULLS LAST, message_type;
```

## 📊 Eventos WebSocket

O handler emite o evento `group-participants-updated` via WebSocket:

```javascript
socket.on('group-participants-updated', (data) => {
  console.log('Atualização de participantes:', data);
  // {
  //   instanceId: "...",
  //   groupId: "120363123456789012@g.us",
  //   groupName: "Nome do Grupo",
  //   action: "add",
  //   participantsCount: 1
  // }
});
```

## ⚠️ Troubleshooting

### Webhook não está sendo processado

1. Verificar se o evento está no `.env`:
   ```
   WEBHOOK_EVENTS=MESSAGES_UPSERT,MESSAGES_DELETE,QRCODE_UPDATED,GROUP_PARTICIPANTS_UPDATE
   ```

2. Verificar logs do servidor para ver se o evento está chegando

3. Verificar se a instância existe no MongoDB

### Mensagem automática não está sendo enviada

1. Verificar se há mensagem automática configurada:
   ```bash
   GET /api/groups/auto-messages?instanceId={instance_id}
   ```

2. Verificar se `isActive = true`

3. Verificar logs para erros ao enviar mensagem

4. Verificar se o número do participante está correto (deve ter código do país)

### Movimentação não está sendo registrada

1. Verificar logs do handler
2. Verificar se o `groupJid` está presente no payload
3. Verificar se há erros no PostgreSQL

## ✅ Checklist de Teste

- [ ] Migration executada com sucesso
- [ ] Webhook recebe evento `GROUP_PARTICIPANTS_UPDATE`
- [ ] Movimentação é registrada no banco
- [ ] Mensagem automática é enviada (se configurada)
- [ ] Histórico de movimentações pode ser consultado
- [ ] Filtros funcionam corretamente
- [ ] Estatísticas são calculadas corretamente
- [ ] Mensagens automáticas podem ser criadas/atualizadas/deletadas
- [ ] Evento WebSocket é emitido
