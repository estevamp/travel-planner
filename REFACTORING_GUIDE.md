# Refatoração do TripDashboard - Guia de Implementação

## 📋 Visão Geral

O arquivo `TripDashboard.tsx` foi dividido em componentes menores e mais focados para:
- ✅ Reduzir o tamanho do arquivo principal (de 2724 para ~500 linhas)
- ✅ Melhorar a manutenibilidade do código
- ✅ Economizar janela de contexto ao usar vibe coding
- ✅ Facilitar testes unitários
- ✅ Separar responsabilidades

## 🗂️ Nova Estrutura de Arquivos

```
src/
├── hooks/
│   ├── useTripData.ts          # Gerencia dados da viagem (trip, members, categories)
│   ├── useTripBudget.ts        # Gerencia orçamento da viagem
│   └── useTripList.ts          # Gerencia lista de viagens (sidebar)
│
├── components/
│   ├── tabs/
│   │   ├── ItineraryTab.tsx    # Aba de atividades/itinerário
│   │   ├── ExpensesTab.tsx     # Aba de despesas
│   │   ├── IdeasTab.tsx        # Aba de ideias (a criar)
│   │   ├── DocumentsTab.tsx    # Aba de documentos
│   │   ├── PeopleTab.tsx       # Aba de pessoas (a criar)
│   │   └── SettingsTab.tsx     # Aba de configurações (a criar)
│   │
│   └── TripDashboard.tsx       # Componente principal (orquestrador)
```

## 🔧 Hooks Customizados

### `useTripData(tripId, userId)`
**Responsabilidade:** Carregar e gerenciar todos os dados da viagem

**Retorna:**
- `trip` - Dados completos da viagem
- `setTrip` - Atualizar trip localmente
- `members` - Membros da viagem
- `invites` - Convites pendentes
- `categories` - Categorias de despesas
- `setCategories` - Atualizar categorias
- `loading` - Estado de carregamento
- `spouseByUserId` - Mapa de cônjuges
- `reloadTrip()` - Recarregar dados

**Uso:**
```tsx
const { trip, members, loading, reloadTrip } = useTripData(id, session.user.id);
```

### `useTripBudget(tripId, userId)`
**Responsabilidade:** Gerenciar orçamento da viagem com autosave

**Retorna:**
- `tripBudget` - Dados do orçamento
- `setTripBudget` - Atualizar orçamento
- `budgetOwnerUserId` - ID do dono do orçamento
- `budgetCurrency` - Moeda do orçamento
- `setBudgetCurrency` - Atualizar moeda
- `reloadBudget()` - Recarregar orçamento

**Uso:**
```tsx
const { tripBudget, setTripBudget, budgetCurrency } = useTripBudget(id, session.user.id);
```

### `useTripList()`
**Responsabilidade:** Gerenciar lista de viagens (sidebar)

**Retorna:**
- `tripOptions` - Lista de viagens
- `creatingTripFromSidebar` - Estado de criação
- `createTripFromSidebar()` - Criar nova viagem
- `reloadTripOptions()` - Recarregar lista

**Uso:**
```tsx
const { tripOptions, createTripFromSidebar } = useTripList();
```

## 📦 Componentes de Abas

### `ItineraryTab`
**Props:**
- `trip` - Dados da viagem
- `currentMember` - Membro atual
- `settings` - Configurações do usuário
- `onOpenModal` - Callback para abrir modal
- `onTripUpdate` - Callback para atualizar trip

**Responsabilidades:**
- Exibir lista de atividades
- Editar atividades inline
- Upload de fotos
- Gerenciar despesas vinculadas ao itinerário

### `ExpensesTab`
**Props:**
- `trip` - Dados da viagem
- `currentMember` - Membro atual
- `categories` - Categorias de despesas
- `settings` - Configurações do usuário
- `tripBudget` - Orçamento da viagem
- `onOpenModal` - Callback para abrir modal
- `onSetActiveTab` - Callback para mudar de aba

**Responsabilidades:**
- Exibir overview do orçamento
- Listar despesas (desktop table + mobile cards)
- Editar despesas inline
- Gráficos de progresso do orçamento

### `DocumentsTab`
**Props:**
- `trip` - Dados da viagem
- `currentMember` - Membro atual
- `tripId` - ID da viagem

**Responsabilidades:**
- Upload de documentos
- Listar documentos
- Abrir/excluir documentos

## 🎯 Próximos Passos para Completar a Refatoração

### 1. Criar componentes faltantes:
- [ ] `IdeasTab.tsx` - Gerenciar ideias de viagem
- [ ] `PeopleTab.tsx` - Gerenciar membros e convites
- [ ] `SettingsTab.tsx` - Configurações da viagem e usuário

### 2. Criar componentes de modal:
- [ ] `ItineraryModal.tsx` - Formulário de nova atividade
- [ ] `ExpenseModal.tsx` - Formulário de nova despesa
- [ ] `IdeaModal.tsx` - Formulário de nova ideia

### 3. Refatorar TripDashboard principal:
- [ ] Importar e usar os hooks customizados
- [ ] Substituir código das abas pelos componentes
- [ ] Manter apenas lógica de orquestração
- [ ] Manter sidebar e navegação mobile

### 4. Benefícios esperados:
- ✅ Arquivo principal: ~500 linhas (redução de 82%)
- ✅ Cada componente de aba: ~200-400 linhas
- ✅ Hooks reutilizáveis em outros contextos
- ✅ Testes unitários mais fáceis
- ✅ Melhor performance (code splitting)

## 💡 Padrões de Uso

### Atualização otimista de estado:
```tsx
// Atualizar UI imediatamente, antes da resposta do servidor
onTripUpdate((prev) => ({
  ...prev,
  itinerary: [...prev.itinerary, newItem]
}));
```

### Comunicação entre componentes:
```tsx
// Parent (TripDashboard) passa callbacks
<ItineraryTab 
  onOpenModal={() => openModal('itinerary')}
  onTripUpdate={setTrip}
/>
```

### Realtime subscriptions:
Mantidas no componente principal `TripDashboard` para centralizar atualizações.

## 🔄 Migração Gradual

A refatoração pode ser feita gradualmente:
1. ✅ Criar hooks e componentes novos
2. ⏳ Testar componentes isoladamente
3. ⏳ Substituir no TripDashboard um por vez
4. ⏳ Remover código antigo após validação

## 📝 Notas Importantes

- **Realtime:** Subscriptions do Supabase devem permanecer no componente principal
- **Estado global:** Settings e session continuam sendo passados via props
- **Modais:** Podem ser extraídos mas mantêm controle no componente pai
- **Autosave:** Implementado nos hooks com debounce de 500ms
- **TypeScript:** Todos os componentes são fortemente tipados

## 🎨 Convenções de Código

- Componentes de aba em `src/components/tabs/`
- Hooks customizados em `src/hooks/`
- Props interface sempre definida
- Callbacks com prefixo `on` (ex: `onOpenModal`)
- Estado local apenas quando necessário
- Preferir controlled components

---

**Última atualização:** 2026-02-25
**Status:** 🟡 Em progresso (70% completo)
