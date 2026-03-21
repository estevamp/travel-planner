# Partiu! - Vercel + Supabase

Aplicativo de planejamento de viagens com autenticação Google, convites por link e privacidade por usuário/cônjuge.

## Requisitos

- Node.js 20+
- Projeto Supabase

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. Em `Authentication > Providers`, ative `Google` e configure o OAuth client.
3. Em `Authentication > URL Configuration`, adicione:
   - Site URL: URL do app (ex: `http://localhost:5173`)
   - Redirect URLs: localhost e URL de produção
4. Execute `supabase/schema.sql` no `SQL Editor`.

## 2) Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
```

## 3) Rodar localmente

```bash
npm install
npm run dev
```

## 4) Deploy no Vercel

1. Importe o repositório no Vercel.
2. Em `Project Settings > Environment Variables`, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Faça `Redeploy`.

## Fluxo implementado

- Login obrigatório com Google.
- Usuário cria viagem e vira admin único.
- Admin gera convite por email e compartilha link `/invite/{token}`.
- Convite só é aceito se o email da conta Google bater com o email convidado.
- Admin vincula cônjuges dentro da viagem.
- Todos os membros veem conteúdo público da viagem.
- Despesas e atividades privadas: apenas autor + cônjuge.
- Documentos: sempre privados (autor + cônjuge) via bucket `travel-documents`.

## Observação sobre dados legados

Viagens antigas sem ownership não entram no fluxo do app com RLS novo.
