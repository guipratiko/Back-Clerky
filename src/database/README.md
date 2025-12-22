# Estrutura de Banco de Dados - PostgreSQL

Este diretório contém as migrations e estrutura do banco de dados PostgreSQL para o sistema CRM e conversas.

## 📋 Estrutura

### Tabelas

#### `crm_columns`
Armazena as colunas do Kanban do CRM.
- **id**: UUID (chave primária)
- **user_id**: VARCHAR(24) - ObjectId do MongoDB
- **name**: Nome da coluna (máx 50 caracteres)
- **order_index**: Ordem de exibição (0-4)
- **color**: Cor hexadecimal (opcional)

**Constraints:**
- Um usuário não pode ter duas colunas com a mesma ordem
- Um usuário não pode ter duas colunas com o mesmo nome

#### `contacts`
Armazena os contatos do CRM.
- **id**: UUID (chave primária)
- **user_id**: VARCHAR(24) - ObjectId do MongoDB
- **instance_id**: VARCHAR(24) - ObjectId do MongoDB
- **remote_jid**: ID completo do WhatsApp
- **phone**: Telefone formatado
- **name**: Nome do contato
- **profile_picture**: URL da foto de perfil
- **column_id**: UUID (FK para crm_columns)
- **unread_count**: Contador de mensagens não lidas
- **last_message**: Última mensagem (primeiros 100 caracteres)
- **last_message_at**: Timestamp da última mensagem

**Constraints:**
- Um contato é único por usuário + instância + remote_jid

#### `messages`
Armazena as mensagens do chat.
- **id**: UUID (chave primária)
- **user_id**: VARCHAR(24) - ObjectId do MongoDB
- **instance_id**: VARCHAR(24) - ObjectId do MongoDB
- **contact_id**: UUID (FK para contacts, CASCADE DELETE)
- **remote_jid**: ID completo do WhatsApp
- **message_id**: ID único da mensagem (UNIQUE)
- **from_me**: Se a mensagem foi enviada por nós
- **message_type**: Tipo da mensagem (conversation, imageMessage, etc.)
- **content**: Conteúdo da mensagem
- **media_url**: URL da mídia (se aplicável)
- **timestamp**: Timestamp da mensagem do WhatsApp
- **read**: Se a mensagem foi lida

**Constraints:**
- message_id é único (evita duplicatas)

## 🔄 Triggers Automáticos

### `update_updated_at_column`
Atualiza automaticamente o campo `updated_at` em todas as tabelas.

### `update_contact_last_message`
Quando uma nova mensagem é inserida:
- Atualiza `last_message` do contato
- Atualiza `last_message_at` do contato

### `increment_unread_count`
Quando uma mensagem recebida (from_me = FALSE) é inserida:
- Incrementa `unread_count` do contato

## 📊 Índices

### Performance
- Índices em todas as foreign keys
- Índices em campos de busca frequente (user_id, instance_id, remote_jid)
- Índice composto para ordenação (contact_id, timestamp)
- Índice GIN para busca full-text em contacts

### Busca Otimizada
- `idx_contacts_search`: Busca full-text em nome e telefone usando GIN

## 🚀 Executar Migrations

```bash
# Executar todas as migrations
npm run migrate

# Ou executar manualmente
ts-node-dev --transpile-only src/scripts/runMigrations.ts
```

## 📝 Notas

- **user_id** e **instance_id** são armazenados como VARCHAR(24) para manter compatibilidade com ObjectId do MongoDB
- Todas as tabelas têm `created_at` e `updated_at` automáticos
- O trigger de `last_message` limita o conteúdo a 100 caracteres
- Mensagens enviadas por nós (`from_me = TRUE`) não incrementam `unread_count`

