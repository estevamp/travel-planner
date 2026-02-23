# Voyage - Vercel + Supabase

Aplicativo de planejamento de viagens com colaboração em tempo real usando React + Vite + Supabase.

## Requisitos

- Node.js 20+
- Projeto Supabase

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. Abra `SQL Editor` e execute o conteúdo de `supabase/schema.sql`.
3. Em `Settings > API`, copie:
   - `Project URL`
   - `anon public key`

## 2) Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
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
3. Faça `Redeploy`.

O arquivo `vercel.json` já está configurado para SPA routing.

## Observação de segurança

O schema atual cria políticas RLS públicas (leitura/escrita total) para facilitar o setup inicial.
Para produção, troque por políticas com autenticação por usuário/grupo.
