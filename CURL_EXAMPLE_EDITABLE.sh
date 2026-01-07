#!/bin/bash

# ============================================
# EXEMPLO DE CURL EDITÁVEL - TODAS AS PLATAFORMAS
# ============================================
# 
# Este script pode ser editado e executado diretamente
# ou você pode copiar os comandos curl abaixo para usar manualmente
#
# Uso: ./CURL_EXAMPLE_EDITABLE.sh
# ou copie e cole os comandos curl abaixo no terminal
#

# ============================================
# CONFIGURAÇÕES - EDITAR AQUI
# ============================================

API_URL="https://back.clerky.com.br"  # ou "http://localhost:4331"
EMAIL="guilherme.santos@me.com"
PASSWORD="Home1366!"
TITLE="🎉 Promoção Especial!"
BODY="Aproveite nossa oferta especial por tempo limitado!"

# ============================================
# PASSO 1: FAZER LOGIN E OBTER TOKEN
# ============================================

echo "🔐 Fazendo login..."

LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\"
  }")

# Extrair token da resposta
TOKEN=$(echo "${LOGIN_RESPONSE}" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -z "${TOKEN}" ]; then
  echo "❌ Erro ao fazer login!"
  echo "Resposta: ${LOGIN_RESPONSE}"
  exit 1
fi

echo "✅ Login realizado com sucesso"
echo "🔑 Token: ${TOKEN:0:50}..."
echo ""

# ============================================
# PASSO 2: ENVIAR NOTIFICAÇÃO PARA TODAS AS PLATAFORMAS (iOS + Android)
# ============================================

echo "📤 Enviando notificação para TODAS as plataformas (iOS + Android)..."

curl -X POST "${API_URL}/api/admin/send-promotion" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"title\": \"${TITLE}\",
    \"body\": \"${BODY}\",
    \"data\": {
      \"promoId\": \"promo-$(date +%s)\",
      \"url\": \"https://clerky.com.br/promo\"
    }
  }" | python3 -m json.tool

echo ""
echo "✅ Notificação enviada!"

# ============================================
# EXEMPLOS DE CURL MANUAIS (copiar e colar)
# ============================================
#
# Para usar manualmente, substitua SEU_TOKEN_AQUI pelo token obtido no Passo 1
#
# 1. ENVIAR PARA TODAS AS PLATAFORMAS (iOS + Android):
# =====================================================
# curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer SEU_TOKEN_AQUI" \
#   -d '{
#     "title": "🎉 Promoção Especial!",
#     "body": "Aproveite nossa oferta especial por tempo limitado!",
#     "data": {
#       "promoId": "promo-123456",
#       "url": "https://clerky.com.br/promo"
#     }
#   }'
#
# 2. ENVIAR APENAS PARA iOS:
# ===========================
# curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer SEU_TOKEN_AQUI" \
#   -d '{
#     "title": "🎉 Promoção iOS!",
#     "body": "Aproveite nossa oferta especial!",
#     "data": {
#       "promoId": "promo-123456"
#     },
#     "filters": {
#       "platform": "ios"
#     }
#   }'
#
# 3. ENVIAR APENAS PARA ANDROID:
# ===============================
# curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer SEU_TOKEN_AQUI" \
#   -d '{
#     "title": "🎉 Promoção Android!",
#     "body": "Aproveite nossa oferta especial!",
#     "data": {
#       "promoId": "promo-123456"
#     },
#     "filters": {
#       "platform": "android"
#     }
#   }'
#
# 4. ENVIAR PARA TODAS + FILTRO PREMIUM:
# =======================================
# curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer SEU_TOKEN_AQUI" \
#   -d '{
#     "title": "🎉 Promoção Premium!",
#     "body": "Oferta especial para usuários premium!",
#     "filters": {
#       "isPremium": true
#     }
#   }'
#
# 5. ENVIAR PARA ANDROID + PREMIUM:
# ==================================
# curl -X POST https://back.clerky.com.br/api/admin/send-promotion \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer SEU_TOKEN_AQUI" \
#   -d '{
#     "title": "🎉 Promoção Android Premium!",
#     "body": "Oferta especial para Android Premium!",
#     "filters": {
#       "platform": "android",
#       "isPremium": true
#     }
#   }'

