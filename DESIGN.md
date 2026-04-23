# Documento de Design (padrão Google)

- **Projeto:** Partiu! (Travel Planner)
- **Autor:** Equipe de engenharia
- **Data:** 2026-04-23
- **Status:** Draft
- **Última atualização:** 2026-04-23

## 1) TL;DR

O **Partiu!** é uma aplicação web para planejamento colaborativo de viagens, com autenticação Google via Supabase, controle de acesso por membro/cônjuge e recursos de organização financeira/logística (itinerário, despesas, ideias e documentos). A solução usa **React + Vite** no frontend, **Supabase** (Postgres/Auth/Storage/RLS) como plataforma de dados e **API routes na Vercel** para operações servidoras que exigem validação adicional ou credenciais protegidas.

Este design descreve arquitetura atual, escolhas técnicas, limites do sistema, riscos e próximos passos para evolução com segurança e escalabilidade.

## 2) Contexto e problema

Planejar viagens em grupo exige coordenação de agenda, orçamento, documentos e decisões compartilhadas, com diferentes níveis de privacidade entre participantes.

O sistema resolve os seguintes problemas principais:

1. **Colaboração segura:** permitir múltiplos membros por viagem, com papéis (admin/member).
2. **Privacidade granular:** itens públicos para todos e itens privados restritos ao autor + cônjuge.
3. **Gestão operacional:** unificar itinerário, despesas, ideias e arquivos em um só produto.
4. **Entrada simples:** login com Google e convite por token para adesão à viagem.

## 3) Objetivos

### 3.1 Objetivos funcionais

- Permitir criação, edição e exclusão de viagens com governança de permissões.
- Suportar domínio completo da viagem: pessoas, itinerário, despesas, ideias e documentos.
- Garantir experiência de uso em português e inglês.
- Oferecer suporte a múltiplas moedas e conversão para comparações financeiras.

### 3.2 Objetivos não funcionais

- **Segurança:** proteção por autenticação e regras de autorização no banco.
- **Confiabilidade:** operações críticas consistentes (ex.: deleção de viagem e arquivos associados).
- **Manutenibilidade:** separação clara entre UI, hooks, utilidades e endpoints.
- **Portabilidade:** deploy simples em Vercel + Supabase.

## 4) Não objetivos

- Sistema de reserva/pagamento de passagens e hotéis.
- Motor de recomendação com ML.
- Planejamento offline-first com resolução avançada de conflitos distribuídos.
- Multi-tenant corporativo com SSO empresarial (além do Google OAuth).

## 5) Escopo atual da solução

### 5.1 Frontend

- SPA React com roteamento para:
  - landing autenticada/não autenticada,
  - dashboard da viagem,
  - convite por token,
  - páginas institucionais (about/help/terms).
- Estado de sessão e perfil carregado no bootstrap do app.
- Internacionalização com `pt-BR` e `en`.
- Componentização por domínio (tabs: despesas, itinerário, pessoas, documentos, ideias).

### 5.2 Backend e dados

- Supabase Postgres como fonte de verdade.
- Auth do Supabase com login Google.
- Storage para documentos e mídias.
- Funções e políticas no banco para sincronização de perfil e enforcement de ownership.
- Endpoints serverless para operações sensíveis:
  - criar viagem,
  - atualizar viagem,
  - deletar viagem + arquivos,
  - buscar taxas de câmbio.

## 6) Arquitetura (visão de alto nível)

```text
[Browser/React]
   |  (JWT do usuário)
   |---------------------------> [Supabase Auth + Postgres + Storage]
   |
   |---------------------------> [Vercel API Routes]
                                 |-- /api/trips
                                 |-- /api/update-trip
                                 |-- /api/delete-trip
                                 |-- /api/exchange-rates
```

### 6.1 Princípios adotados

- **BFF mínimo por endpoint:** apenas quando há necessidade de segredo de servidor ou checagem de privilégio elevada.
- **Defesa em profundidade:** validação no endpoint + restrições estruturais no banco.
- **Modelo orientado a viagem:** quase todos os recursos se ancoram em `trip_id`.

## 7) Modelo de dados (resumo)

Entidades principais:

- `trips`: metadados da viagem (nome, destino, período, criador).
- `profiles`: perfil e preferências do usuário (tema, moeda padrão, idioma, vínculo de cônjuge).
- `trip_members`: associação usuário↔viagem com papel (`admin`/`member`).
- `trip_invites`: convites por email/token.
- `itinerary` e `itinerary_types`: planejamento de atividades/compromissos.
- `expenses` e `expense_categories`: despesas por viagem, categoria e visibilidade.
- `ideas`, `idea_links`, `idea_assets`: backlog de ideias com links e anexos.
- `documents`: arquivos da viagem.
- `trip_budgets`: orçamento por usuário/viagem.

Características de modelagem:

- Chaves primárias UUID.
- Integridade referencial com `on delete cascade` para evitar órfãos.
- Índices em colunas de junção e filtros de alto uso.
- Constraints de domínio (ex.: role, visibility, códigos de idioma/moeda).

## 8) APIs e contratos

### 8.1 `POST /api/trips`

- Objetivo: criar viagem e membro admin.
- Entrada: `name`, `destination`, datas opcionais.
- Auth: bearer token de usuário.
- Implementação: chama RPC `create_trip_with_admin` no Supabase com credencial anônima + JWT do usuário.

### 8.2 `POST /api/update-trip`

- Objetivo: atualizar nome/destino da viagem.
- Entrada: `tripId`, `name`, `destination`.
- Auth: bearer token de usuário.
- Regra: permitido para admin da viagem ou superuser.
- Implementação: valida usuário via service role + `auth.getUser(token)`.

### 8.3 `POST /api/delete-trip`

- Objetivo: excluir viagem de forma segura e limpar arquivos.
- Entrada: `tripId`.
- Auth: bearer token de usuário.
- Regra: admin da viagem ou superuser.
- Fluxo:
  1. valida permissão,
  2. coleta URLs de `documents`, `idea_assets`, `itinerary.photo_url`,
  3. remove objetos do bucket em lotes,
  4. remove linha de `trips`.

### 8.4 `GET /api/exchange-rates`

- Objetivo: retornar taxas por moeda base.
- Dependência externa: FreeCurrencyAPI.
- Resiliência: fallback quando upstream retorna 422/403 para não quebrar UI.

## 9) Segurança, privacidade e compliance

- Autenticação centralizada via Supabase Auth (Google OAuth).
- Autorização por associação `trip_members` e papel.
- Conteúdo privado por regra de visibilidade e relação de cônjuge.
- Chaves sensíveis (`SUPABASE_SERVICE_ROLE_KEY`, `FREECURRENCYAPI_KEY`) mantidas no ambiente servidor.
- Operações destrutivas protegidas por validações explícitas de permissão.

## 10) Decisões e trade-offs

1. **Supabase como backend principal**
   - Prós: velocidade de entrega, Auth + DB + Storage integrados.
   - Contras: acoplamento a vendor e modelos específicos de políticas.

2. **Serverless endpoints para operações críticas**
   - Prós: protege segredos e concentra lógica sensível.
   - Contras: adiciona camada operacional e pontos extras de falha.

3. **Modelo de visibilidade simples (`public`/`private`)**
   - Prós: UX previsível e regras fáceis de comunicar.
   - Contras: limita cenários avançados (times, grupos, níveis).

## 11) Riscos e mitigação

- **Risco:** inconsistência em deleção de arquivos.
  - **Mitigação:** remoção em lotes + tratamento de erro antes da exclusão da viagem.

- **Risco:** dependência de provedor externo de câmbio.
  - **Mitigação:** fallback com retorno controlado e taxa base mínima.

- **Risco:** crescimento de complexidade de RLS e permissões.
  - **Mitigação:** padronizar testes de autorização e auditoria de políticas por release.

## 12) Observabilidade e operação

- Logs explícitos nos endpoints críticos (principalmente update/delete trip).
- Erros retornados com mensagens claras para troubleshooting.
- Estrutura pronta para adicionar métricas de negócio (ex.: viagens criadas, convites aceitos, despesas registradas).

## 13) Plano de evolução (roadmap sugerido)

### Curto prazo

- Cobertura de testes para APIs serverless e hooks críticos.
- Padronização de códigos de erro e contrato de resposta.
- Revisão sistemática de políticas RLS por tabela sensível.

### Médio prazo

- Cache e cota inteligente para endpoint de câmbio.
- Soft delete opcional de viagem + janela de recuperação.
- Auditoria de ações administrativas (alterar/excluir viagem).

### Longo prazo

- Suporte offline robusto com sincronização e resolução de conflito.
- Papéis adicionais (ex.: co-admin) e ACLs mais granulares.
- Integrações externas (calendário, mapas, provedores de reserva).

## 14) Alternativas consideradas

1. **Backend custom completo (Node + ORM + DB gerenciado)**
   - Mais flexível, porém maior custo de implementação/operação.

2. **Sem endpoints serverless (frontend direto em tudo)**
   - Menor complexidade inicial, porém pior postura de segurança para operações com segredo.

3. **Monolito fullstack tradicional**
   - Simplifica debugging local, mas reduz elasticidade e aumenta custo de deploy incremental.

## 15) Questões em aberto

- Como formalizar testes automatizados de autorização fim a fim?
- Qual estratégia oficial de backup/restore para exclusões acidentais?
- O modelo de visibilidade atual cobre todos os casos reais de grupos/famílias?
- Quais SLAs de disponibilidade e latência são esperados para produção?

## 16) Referências internas

- `README.md` (setup, fluxo funcional).
- `src/App.tsx` (bootstrap de sessão, rotas, i18n).
- `api/*.ts` (contratos e validações serverless).
- `supabase/schema.sql` (modelo relacional, triggers e constraints).

