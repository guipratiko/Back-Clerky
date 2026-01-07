# Exemplos de CURL para Testar Notificações

## Produção

### 1. Fazer login e obter token

```bash
curl -X POST https://back.clerky.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guilherme.santos@me.com",
    "password": "Home1366!"
  }'
```

**Resposta esperada:**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

### 2. Enviar notificação para Android (copie o token da resposta acima)

```bash
curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "title": "🎉 Promoção Especial Android!",
    "body": "Teste de notificação no servidor de produção!",
    "data": {
      "promoId": "promo-prod-123456",
      "url": "https://clerky.com.br/promo"
    },
    "filters": {
      "platform": "android"
    }
  }'
```

### 3. Enviar notificação para iOS

```bash
curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "title": "🎉 Promoção Especial iOS!",
    "body": "Teste de notificação no servidor de produção!",
    "filters": {
      "platform": "ios"
    }
  }'
```

### 4. Enviar para ambas as plataformas

```bash
curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "title": "🎉 Promoção para Todos!",
    "body": "Notificação para iOS e Android!",
    "data": {
      "promoId": "promo-all-123456"
    }
  }'
```

## Local

### 1. Fazer login

```bash
curl -X POST http://localhost:4331/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guilherme.santos@me.com",
    "password": "Home1366!"
  }'
```

### 2. Enviar notificação Android

```bash
curl -X POST http://localhost:4331/api/admin/send-promotion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "title": "🎉 Promoção Local!",
    "body": "Teste local para Android",
    "filters": {
      "platform": "android"
    }
  }'
```

## Scripts Automáticos

### Script Completo (Editável)

Use o script `CURL_SEND_NOTIFICATION.sh` para enviar notificações facilmente:

```bash
cd Backend
# Edite o arquivo CURL_SEND_NOTIFICATION.sh com suas configurações
./CURL_SEND_NOTIFICATION.sh
```

### Script de Exemplo (Editável)

Use o script `CURL_EXAMPLE_EDITABLE.sh`:

```bash
cd Backend
# Edite o arquivo CURL_EXAMPLE_EDITABLE.sh com suas configurações
./CURL_EXAMPLE_EDITABLE.sh
```

### Script via NPM

Para Android:

```bash
cd Backend
API_URL=https://back.clerky.com.br EMAIL=guilherme.santos@me.com PASSWORD='Home1366!' npm run send-promo-android
```

Para todas as plataformas (iOS + Android):

```bash
cd Backend
API_URL=https://back.clerky.com.br EMAIL=guilherme.santos@me.com PASSWORD='Home1366!' npm run send-promo-api
```

