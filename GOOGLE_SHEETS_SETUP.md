# Configuração do Google Sheets Integration

## Pré-requisitos

1. **Conta Google** com acesso ao Google Cloud Console
2. **Projeto no Google Cloud Console**
3. **OAuth 2.0 Client ID** configurado

## Passo a Passo

### 1. Criar Projeto no Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Ative a **Google Sheets API**:
   - Vá em "APIs & Services" > "Library"
   - Procure por "Google Sheets API"
   - Clique em "Enable"

### 2. Configurar OAuth 2.0

1. Vá em "APIs & Services" > "Credentials"
2. Clique em "Create Credentials" > "OAuth client ID"
3. Se solicitado, configure a tela de consentimento OAuth:
   - Tipo: External
   - Nome do app: Clerky
   - Email de suporte: seu email
   - Scopes: Adicione `https://www.googleapis.com/auth/spreadsheets`
   - Usuários de teste: Adicione seu email (para desenvolvimento)

4. Configure o OAuth Client:
   - Tipo: Web application
   - Nome: Clerky Backend
   - **Authorized redirect URIs**: 
     - `http://localhost:4331/api/google/auth/callback` (desenvolvimento)
     - `https://seu-dominio.com/api/google/auth/callback` (produção)

5. Copie o **Client ID** e **Client Secret**

### 3. Configurar Variáveis de Ambiente

Adicione ao arquivo `.env` do backend:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=seu_client_id_aqui
GOOGLE_CLIENT_SECRET=seu_client_secret_aqui
GOOGLE_REDIRECT_URI=http://localhost:4331/api/google/auth/callback

# Ou use API_URL para construir automaticamente
API_URL=http://localhost:4331
```

### 4. Executar Migration

Execute a migration para criar a tabela de tokens:

```bash
cd Backend
npm run migrate
```

### 5. Testar

1. Inicie o servidor backend
2. No frontend, adicione um nó "Planilha" ao workflow
3. Clique no nó e depois em "Autenticar com Google"
4. Faça login com sua conta Google
5. Autorize o acesso às planilhas
6. Configure o nome da planilha e da aba
7. Salve o workflow

## Como Funciona

1. **Autenticação**: O usuário clica em "Autenticar com Google" e é redirecionado para o Google OAuth
2. **Callback**: Após autorizar, o Google redireciona para `/api/google/auth/callback`
3. **Tokens**: Os tokens são salvos no banco de dados PostgreSQL na tabela `google_tokens`
4. **Refresh Automático**: O sistema renova automaticamente os tokens quando expiram
5. **Criação de Planilhas**: Quando o workflow executa, cria uma planilha (se não existir) e adiciona os dados

## Estrutura de Dados

Os dados do Typebot são automaticamente extraídos e adicionados à planilha na seguinte ordem:

1. **Timestamp** - Data/hora da execução
2. **Telefone** - Número do contato
3. **Instância** - ID da instância
4. **Campos do Typebot** - Todos os outros campos do payload (Name, Idade, etc.)

## Troubleshooting

### Erro: "Client ID não configurado"
- Verifique se `GOOGLE_CLIENT_ID` está no `.env`
- Reinicie o servidor após adicionar variáveis de ambiente

### Erro: "Redirect URI mismatch"
- Verifique se o redirect URI no Google Cloud Console corresponde exatamente ao configurado
- Inclua `http://` ou `https://` conforme necessário

### Erro: "Token expirado"
- O sistema deve renovar automaticamente
- Se persistir, o usuário precisa autenticar novamente

### Planilha não é criada
- Verifique se o usuário está autenticado
- Verifique os logs do backend para erros da API do Google
- Verifique se a Google Sheets API está habilitada no projeto

