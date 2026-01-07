#!/bin/bash

# Script para testar envio de notificações promocionais no servidor de produção
# Uso: ./test-promo-prod.sh

# Configurações
PROD_URL="${API_URL:-https://back.clerky.com.br}"
EMAIL="${EMAIL:-guilherme.santos@me.com}"
PASSWORD="${PASSWORD:-Home1366!}"

echo "🌐 Servidor de produção: $PROD_URL"
echo "🔐 Fazendo login..."
echo ""

# Fazer login e obter token
LOGIN_RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

# Extrair token da resposta
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Erro ao fazer login"
  echo "Resposta: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login realizado com sucesso"
echo "👤 Token obtido: ${TOKEN:0:20}..."
echo ""

# Enviar notificação para Android
echo "📤 Enviando notificação promocional para Android..."
echo ""

PROMO_RESPONSE=$(curl -s -X POST "$PROD_URL/api/admin/send-promotion" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "🎉 Promoção Especial Android!",
    "body": "Teste de notificação no servidor de produção!",
    "data": {
      "promoId": "promo-prod-'$(date +%s)'",
      "url": "https://clerky.com.br/promo"
    },
    "filters": {
      "platform": "android"
    }
  }')

echo "📊 Resposta:"
echo "$PROMO_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PROMO_RESPONSE"
echo ""

