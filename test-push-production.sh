#!/bin/bash

# Script para testar push notifications em produção
# Uso: ./test-push-production.sh

BASE_URL="https://back.clerky.com.br"
EMAIL="seu-email@exemplo.com"
PASSWORD="sua-senha"

echo "🔐 Fazendo login para obter token..."
echo ""

# Fazer login e obter token
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Erro ao fazer login. Verifique suas credenciais."
  echo "Resposta: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login realizado com sucesso!"
echo "📤 Enviando push notification para todos os usuários iOS..."
echo ""

# Enviar push notification
RESPONSE=$(curl -s -X POST "$BASE_URL/api/subscriptions/push/broadcast" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Teste de Notificação - Produção",
    "body": "Esta é uma notificação de teste para todos os usuários iOS em produção",
    "sound": "default",
    "badge": 1
  }')

echo "📨 Resposta do servidor:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar se foi sucesso
if echo "$RESPONSE" | grep -q '"status":"success"'; then
  echo "✅ Notificação enviada com sucesso!"
else
  echo "❌ Erro ao enviar notificação"
fi

