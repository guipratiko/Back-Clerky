# Clerky Backend

Backend API para o Clerky - Hub de conexão com redes sociais.

## Tecnologias

- Node.js
- Express
- TypeScript
- MongoDB
- Mongoose

## Configuração

1. Instale as dependências:
```bash
npm install
```

2. Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# MongoDB Connection
MONGODB_URI=mongodb://clerky:qGfdSCz1bDTuHD5o@easy.clerky.com.br:27017/?tls=false

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Secret
JWT_SECRET=your-secret-key-change-in-production

# CORS
CORS_ORIGIN=http://localhost:3000
```

3. Execute o servidor em modo desenvolvimento:
```bash
npm run dev
```

4. Para produção, primeiro compile o TypeScript:
```bash
npm run build
npm start
```

## Estrutura

```
Backend/
├── src/
│   ├── config/
│   │   └── database.ts         # Configuração do MongoDB
│   ├── controllers/
│   │   └── authController.ts   # Controller de autenticação
│   ├── middleware/
│   │   ├── auth.ts             # Middleware de autenticação JWT
│   │   └── errorHandler.ts     # Tratamento de erros
│   ├── models/
│   │   └── User.ts             # Modelo de usuário (MongoDB)
│   ├── routes/
│   │   ├── auth.routes.ts      # Rotas de autenticação
│   │   ├── health.routes.ts    # Rotas de health check
│   │   └── index.ts            # Centralizador de rotas
│   └── server.ts               # Servidor Express
├── dist/                       # Código compilado (gerado)
└── package.json
```

## Rotas da API

### Autenticação (`/api/auth`)

- `POST /api/auth/login` - Login de usuário
  - Body: `{ email: string, password: string }`
  - Retorna: `{ status, token, user }`

- `POST /api/auth/register` - Registro de novo usuário
  - Body: `{ name: string, email: string, password: string }`
  - Retorna: `{ status, token, user }`

- `GET /api/auth/me` - Obter usuário atual (protegido)
  - Headers: `Authorization: Bearer <token>`
  - Retorna: `{ status, user }`

### Health Check

- `GET /api/health` - Verificar status da API

