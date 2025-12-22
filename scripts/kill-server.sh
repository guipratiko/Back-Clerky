#!/bin/bash

# Script para matar todos os processos do servidor Node.js
# Uso: ./scripts/kill-server.sh

echo "🔍 Procurando processos do servidor..."

# Matar processos ts-node-dev
pkill -f "ts-node-dev.*server.ts" 2>/dev/null
pkill -f "node.*server.ts" 2>/dev/null

# Matar processos na porta 4331
lsof -ti:4331 | xargs kill -9 2>/dev/null

# Aguardar um pouco
sleep 1

# Verificar se ainda há processos
REMAINING=$(ps aux | grep -E "ts-node-dev.*server.ts|node.*server.ts" | grep -v grep | wc -l | tr -d ' ')

if [ "$REMAINING" -gt 0 ]; then
  echo "⚠️  Ainda há $REMAINING processo(s) rodando. Matando forçadamente..."
  ps aux | grep -E "ts-node-dev.*server.ts|node.*server.ts" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
  sleep 1
fi

# Verificar porta
PORT_IN_USE=$(lsof -ti:4331 2>/dev/null | wc -l | tr -d ' ')

if [ "$PORT_IN_USE" -gt 0 ]; then
  echo "⚠️  Porta 4331 ainda está em uso. Liberando..."
  lsof -ti:4331 | xargs kill -9 2>/dev/null
  sleep 1
fi

# Verificação final
FINAL_CHECK=$(ps aux | grep -E "ts-node-dev.*server.ts|node.*server.ts" | grep -v grep | wc -l | tr -d ' ')
FINAL_PORT=$(lsof -ti:4331 2>/dev/null | wc -l | tr -d ' ')

if [ "$FINAL_CHECK" -eq 0 ] && [ "$FINAL_PORT" -eq 0 ]; then
  echo "✅ Todos os processos foram encerrados e a porta 4331 está livre!"
else
  echo "⚠️  Ainda há processos ou a porta está em uso:"
  echo "   Processos: $FINAL_CHECK"
  echo "   Porta 4331: $FINAL_PORT"
fi

