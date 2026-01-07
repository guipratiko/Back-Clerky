#!/bin/bash

# Script para enviar notificações promocionais via CURL
# Uso: ./CURL_SEND_NOTIFICATION.sh

# ============================================
# CONFIGURAÇÕES - EDITAR AQUI
# ============================================

# Servidor (produção ou local)
API_URL="https://back.clerky.com.br"  # ou "http://localhost:4331" para local

# Credenciais de login
EMAIL="guilherme.santos@me.com"
PASSWORD="Home1366!"

# Dados da notificação
TITLE="🎉 Promoção Especial!"
BODY="Aproveite nossa oferta especial por tempo limitado!"

# Dados customizados (opcional)
PROMO_ID="promo-$(date +%s)"
PROMO_URL="https://clerky.com.br/promo"

# Filtros (opcional)
# Para enviar para TODAS as plataformas, deixe FILTER_PLATFORM vazio: FILTER_PLATFORM=""
# Para enviar apenas iOS: FILTER_PLATFORM="ios"
# Para enviar apenas Android: FILTER_PLATFORM="android"
FILTER_PLATFORM=""  # Deixe vazio para todas as plataformas

# Filtrar por usuários premium (opcional)
# FILTER_IS_PREMIUM="true"  # apenas premium
# FILTER_IS_PREMIUM="false"  # apenas não-premium
# FILTER_IS_PREMIUM=""  # todos (padrão)
FILTER_IS_PREMIUM=""

# ============================================
# FUNÇÃO PARA FAZER LOGIN
# ============================================

login() {
    echo "🔐 Fazendo login..."
    
    LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"${EMAIL}\",
            \"password\": \"${PASSWORD}\"
        }")
    
    TOKEN=$(echo "${LOGIN_RESPONSE}" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')
    
    if [ -z "${TOKEN}" ]; then
        echo "❌ Erro ao fazer login!"
        echo "Resposta: ${LOGIN_RESPONSE}"
        exit 1
    fi
    
    echo "✅ Login realizado com sucesso"
    echo "👤 Token obtido: ${TOKEN:0:50}..."
    echo ""
}

# ============================================
# FUNÇÃO PARA ENVIAR NOTIFICAÇÃO
# ============================================

send_notification() {
    echo "📤 Enviando notificação promocional..."
    echo "   Título: ${TITLE}"
    echo "   Corpo: ${BODY}"
    
    if [ -n "${FILTER_PLATFORM}" ]; then
        echo "   Plataforma: ${FILTER_PLATFORM}"
    else
        echo "   Plataforma: TODAS (iOS e Android)"
    fi
    
    if [ -n "${FILTER_IS_PREMIUM}" ]; then
        echo "   Filtro Premium: ${FILTER_IS_PREMIUM}"
    fi
    
    echo ""
    
    # Construir payload JSON (método mais simples e robusto)
    # Criar arquivo temporário para o JSON
    TEMP_JSON=$(mktemp)
    
    # Escrever base do JSON
    cat > "${TEMP_JSON}" <<EOF
{
  "title": "${TITLE}",
  "body": "${BODY}",
  "data": {
    "promoId": "${PROMO_ID}",
    "url": "${PROMO_URL}"
  }
EOF
    
    # Adicionar filtros se especificados
    if [ -n "${FILTER_PLATFORM}" ] || [ -n "${FILTER_IS_PREMIUM}" ]; then
        echo ',' >> "${TEMP_JSON}"
        echo '  "filters": {' >> "${TEMP_JSON}"
        
        if [ -n "${FILTER_PLATFORM}" ]; then
            echo "    \"platform\": \"${FILTER_PLATFORM}\"" >> "${TEMP_JSON}"
            if [ -n "${FILTER_IS_PREMIUM}" ]; then
                echo ',' >> "${TEMP_JSON}"
            fi
        fi
        
        if [ -n "${FILTER_IS_PREMIUM}" ]; then
            if [ "${FILTER_IS_PREMIUM}" = "true" ]; then
                echo '    "isPremium": true' >> "${TEMP_JSON}"
            else
                echo '    "isPremium": false' >> "${TEMP_JSON}"
            fi
        fi
        
        echo '  }' >> "${TEMP_JSON}"
    fi
    
    echo '}' >> "${TEMP_JSON}"
    
    # Ler o JSON completo
    PAYLOAD=$(cat "${TEMP_JSON}")
    
    # Limpar arquivo temporário
    rm "${TEMP_JSON}"
    
    # Enviar requisição
    RESPONSE=$(curl -s -X POST "${API_URL}/api/admin/send-promotion" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TOKEN}" \
        -d "${PAYLOAD}")
    
    echo "📊 Resposta:"
    echo "${RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE}"
    echo ""
    
    # Verificar se teve sucesso
    if echo "${RESPONSE}" | grep -q '"status":"success"'; then
        echo "✅ Notificação enviada com sucesso!"
        
        # Extrair estatísticas
        TOTAL=$(echo "${RESPONSE}" | grep -o '"totalDevices":[0-9]*' | grep -o '[0-9]*')
        SUCCESS=$(echo "${RESPONSE}" | grep -o '"successCount":[0-9]*' | grep -o '[0-9]*')
        FAILED=$(echo "${RESPONSE}" | grep -o '"failedCount":[0-9]*' | grep -o '[0-9]*')
        
        if [ -n "${TOTAL}" ]; then
            echo ""
            echo "📈 Estatísticas:"
            echo "   Total de dispositivos: ${TOTAL}"
            echo "   ✅ Sucessos: ${SUCCESS}"
            echo "   ❌ Falhas: ${FAILED}"
        fi
    else
        echo "❌ Erro ao enviar notificação!"
        exit 1
    fi
}

# ============================================
# EXECUTAR
# ============================================

echo "🚀 Clerky - Envio de Notificações Promocionais"
echo "=========================================="
echo ""
echo "🌐 Servidor: ${API_URL}"
echo "📧 Email: ${EMAIL}"
echo ""

login
send_notification

echo "✅ Processo concluído!"

