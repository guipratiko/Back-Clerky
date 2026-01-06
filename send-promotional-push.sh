#!/bin/bash

# Script para enviar notificação promocional para todos os usuários iOS
# Uso: ./send-promotional-push.sh

BASE_URL="https://back.clerky.com.br"
EMAIL="guilherme.santos@me.com"
PASSWORD="Home1366!"

# Parâmetros da notificação (customize aqui)
TITLE="${1:-Nova Funcionalidade Disponível!}"
BODY="${2:-Descubra as novidades do Clerky. Atualize agora e aproveite!}"
SUBTITLE="${3:-Novidades}"
SOUND="${4:-default}"
BADGE="${5:-1}"

echo "📢 Enviando Notificação Promocional"
echo "════════════════════════════════════"
echo "Título: $TITLE"
echo "Corpo: $BODY"
echo "Subtítulo: $SUBTITLE"
echo "════════════════════════════════════"
echo ""

# Fazer login e obter token
echo "🔐 Fazendo login..."
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
echo "📤 Enviando notificação promocional para todos os usuários iOS..."
echo ""

# Enviar notificação promocional
RESPONSE=$(curl -s -X POST "$BASE_URL/api/subscriptions/push/promotional" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"title\": \"$TITLE\",
    \"body\": \"$BODY\",
    \"subtitle\": \"$SUBTITLE\",
    \"sound\": \"$SOUND\",
    \"badge\": $BADGE,
    \"customData\": {
      \"campaign\": \"promotional\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }")

echo "📨 Resposta do servidor:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar resultado
if echo "$RESPONSE" | grep -q '"status":"success"'; then
  SUCCESS_COUNT=$(echo "$RESPONSE" | grep -o '"success":[0-9]*' | cut -d':' -f2)
  TOTAL_COUNT=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  echo "✅ Notificação promocional enviada com sucesso!"
  echo "   📱 Dispositivos: $SUCCESS_COUNT/$TOTAL_COUNT"
else
  echo "❌ Erro ao enviar notificação promocional"
  exit 1
fi

