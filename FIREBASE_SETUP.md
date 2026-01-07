# Configuração do Firebase Cloud Messaging (FCM) no Backend

## Passos para configurar FCM no backend

### 1. Obter arquivo de Service Account do Firebase

1. Acesse https://console.firebase.google.com/
2. Selecione o projeto (ou crie um novo)
3. Vá em **Project Settings** (ícone de engrenagem)
4. Clique na aba **Service Accounts**
5. Clique em **Generate new private key**
6. Baixe o arquivo JSON

### 2. Configurar o arquivo no backend

1. Coloque o arquivo JSON baixado na raiz do projeto `Backend/`
2. Renomeie para: `firebase-service-account.json`

**OU** configure via variável de ambiente:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

### 3. Instalar dependências

```bash
cd Backend
npm install
```

### 4. Verificar configuração

O arquivo deve conter campos como:
- `project_id`
- `private_key`
- `client_email`
- etc.

### 5. Testar

Após configurar, você pode testar enviando notificações via:

```bash
# Via script
EMAIL=seu@email.com PASSWORD=senha npm run send-promo-api

# Ou via curl
curl -X POST http://localhost:4331/api/admin/send-promotion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "title": "Teste Android",
    "body": "Mensagem de teste",
    "filters": {
      "platform": "android"
    }
  }'
```

## Estrutura do arquivo Service Account

O arquivo JSON deve ter esta estrutura:

```json
{
  "type": "service_account",
  "project_id": "seu-projeto-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxx@seu-projeto.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Segurança

⚠️ **IMPORTANTE**: 
- NUNCA commite o arquivo `firebase-service-account.json` no Git
- Adicione ao `.gitignore`
- Use variáveis de ambiente em produção

## Troubleshooting

### Erro: "Firebase Admin SDK não foi inicializado"
- Verifique se o arquivo existe no caminho correto
- Verifique se o arquivo JSON está válido
- Verifique os logs do servidor

### Erro: "Invalid credential"
- Verifique se o arquivo JSON está correto
- Verifique se a Service Account tem permissões adequadas no Firebase

### Notificações não chegam
- Verifique se o device token está registrado no banco
- Verifique se o token FCM é válido
- Verifique os logs do Firebase Console

