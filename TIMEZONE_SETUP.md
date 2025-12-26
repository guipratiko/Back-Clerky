# Configuração de Timezone - São Paulo, Brasil

## Backend

O timezone já está configurado no código (`Backend/src/server.ts`) com:
```typescript
process.env.TZ = 'America/Sao_Paulo';
```

### Para Docker/Easypanel

Adicione no Dockerfile ou nas variáveis de ambiente do Easypanel:

```dockerfile
ENV TZ=America/Sao_Paulo
```

Ou nas variáveis de ambiente do Easypanel:
- Nome: `TZ`
- Valor: `America/Sao_Paulo`

## Frontend

O frontend usa JavaScript nativo que respeita o timezone do navegador. Para garantir que as datas sejam exibidas no timezone de São Paulo, o código já usa `toLocaleDateString` e `toLocaleTimeString` com locale 'pt-BR', que automaticamente usa o timezone do servidor.

### Se necessário usar timezone específico no frontend

Instale uma biblioteca de timezone:
```bash
npm install date-fns-tz
```

E use:
```typescript
import { formatInTimeZone } from 'date-fns-tz';

const date = new Date();
const saoPauloTime = formatInTimeZone(date, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
```

## Verificação

Para verificar se o timezone está correto no backend, adicione um log no `server.ts`:

```typescript
console.log('🕐 Timezone configurado:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('🕐 Data/Hora atual:', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
```

