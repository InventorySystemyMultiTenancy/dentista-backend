# Dentista — Backend

API REST para o sistema de gestão da clínica odontológica: pacientes, agenda, exames,
financeiro (contas a pagar/receber) e estoque. Node.js + Express + TypeScript + Prisma + PostgreSQL.

## Stack

- Express + TypeScript
- Prisma ORM (PostgreSQL)
- JWT em cookie httpOnly para autenticação
- zod para validação de payloads
- bcrypt para hash de senhas

## Rodando localmente

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL` com um PostgreSQL local (ou o do Render).
2. Instale as dependências:
   ```
   npm install
   ```
3. Rode as migrations:
   ```
   npm run prisma:migrate
   ```
4. Crie o usuário administrador inicial (usa `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` do `.env`):
   ```
   npm run seed
   ```
5. Suba a API em modo desenvolvimento:
   ```
   npm run dev
   ```
   A API sobe em `http://localhost:3001` (ou a porta definida em `PORT`).

## Estrutura

```
src/
  app.ts              # configuração do Express, CORS, rotas
  server.ts           # entrypoint
  lib/                # prisma client, jwt, tokens de convite, serialização
  middleware/auth.ts  # requireAuth, requireRole, requirePermission, requirePatient
  routes/
    auth.ts           # login, logout, /me, aceitar convite de paciente
    patients.ts       # CRUD de pacientes + geração de convite
    staff.ts          # CRUD de funcionários + permissões (admin only)
    appointments.ts   # agenda: criar, cancelar, concluir, horários disponíveis
    exams.ts          # exames/resultados + estatísticas para gráficos
    financial.ts       # contas a pagar/receber + resumo financeiro
    inventory.ts       # itens de estoque + movimentações
    portal.ts          # rotas somente leitura para o paciente logado
prisma/
  schema.prisma
  seed.ts
```

## Modelo de permissões

Cada `Staff` (funcionário) tem um campo `permissions` (JSON) com `view`/`edit` por módulo:
`patients`, `agenda`, `exams`, `financial`, `inventory`, `employees`. Usuários com role `ADMIN`
sempre têm acesso total, independente do JSON de permissões.

## Fluxo de acesso do paciente

1. Admin cadastra o paciente (`POST /api/patients`) — o sistema cria a conta (`User` com senha nula)
   e retorna um `inviteLink` com token.
2. Admin envia esse link ao paciente (o frontend abre o WhatsApp com uma mensagem pronta).
3. Paciente acessa o link e define a senha (`POST /api/auth/invite/accept`), ativando a conta.
4. Paciente faz login normalmente (`POST /api/auth/login`) e acessa `/api/portal/*`.

## Deploy no Render

1. Crie um banco **PostgreSQL** no Render e copie a **Internal Database URL**.
2. Crie um **Web Service** apontando para este diretório (`backend/`):
   - Build Command: `npm install && npm run build && npx prisma migrate deploy`
   - Start Command: `npm start`
3. Configure as variáveis de ambiente no Render: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`
   (URL do frontend na Vercel), `NODE_ENV=production`.
4. Rode o seed uma vez (via Shell do Render): `npm run seed`.
