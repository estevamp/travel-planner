# Guia de Implementação - Mudanças no TripDashboard.tsx

Este documento detalha todas as mudanças necessárias no arquivo `TripDashboard.tsx` para implementar o sistema de modais com FAB e suporte multi-moeda.

## Parte 1: Imports e Estados Adicionais

### 1.1 Adicionar novos imports (após linha 36)

```typescript
import { Modal } from "./Modal";
import { FloatingActionButton } from "./FloatingActionButton";
import { CurrencySelector } from "./CurrencySelector";
import { currencyService } from "../services/currencyService";
import type { ExchangeRates } from "../services/currencyService";
```

### 1.2 Adicionar novos estados (após linha 119)

```typescript
// Modal control
const [showAddModal, setShowAddModal] = useState(false);
const [modalType, setModalType] = useState<'itinerary' | 'expense' | 'idea' | null>(null);

// Currency states for each form
const [itineraryCurrency, setItineraryCurrency] = useState(settings.default_currency);
const [expenseCurrency, setExpenseCurrency] = useState(settings.default_currency);
const [ideaCurrency, setIdeaCurrency] = useState(settings.default_currency);
const [budgetCurrency, setBudgetCurrency] = useState(settings.default_currency);

// Exchange rates
const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
const [loadingRates, setLoadingRates] = useState(false);
```

### 1.3 Adicionar funções auxiliares para modal (após os estados)

```typescript
const openModal = (type: 'itinerary' | 'expense' | 'idea') => {
  setModalType(type);
  setShowAddModal(true);
};

const closeModal = () => {
  setShowAddModal(false);
  setModalType(null);
};
```

## Parte 2: Carregar Exchange Rates

### 2.1 Adicionar useEffect para carregar taxas de câmbio (após linha 407)

```typescript
// Load exchange rates when expenses tab is active
useEffect(() => {
  if (activeTab === 'expenses' && !exchangeRates && !loadingRates) {
    setLoadingRates(true);
    currencyService
      .getExchangeRates(settings.default_currency)
      .then(setExchangeRates)
      .catch(console.error)
      .finally(() => setLoadingRates(false));
  }
}, [activeTab, settings.default_currency, exchangeRates, loadingRates]);
```

## Parte 3: Atualizar Funções de Criação

### 3.1 Atualizar createItinerary (linha 486)

**ANTES:**
```typescript
const { error } = await supabase.from("itinerary").insert({
  id: itineraryId,
  trip_id: id,
  created_by_member_id: currentMember.id,
  type: form.get("type") as ItineraryType,
  title,
  description: (form.get("description") as string) || "",
  location: (form.get("location") as string) || "",
  start_time: now,
  end_time: now,
  amount,
  visibility,
  photo_url: null,
});
```

**DEPOIS:**
```typescript
const { error } = await supabase.from("itinerary").insert({
  id: itineraryId,
  trip_id: id,
  created_by_member_id: currentMember.id,
  type: form.get("type") as ItineraryType,
  title,
  description: (form.get("description") as string) || "",
  location: (form.get("location") as string) || "",
  start_time: now,
  end_time: now,
  amount,
  currency: itineraryCurrency, // ✅ NOVO
  visibility,
  photo_url: null,
});
```

E atualizar o newItem (linha 530):
```typescript
const newItem: ItineraryItem = {
  id: itineraryId,
  trip_id: id,
  created_by_member_id: currentMember.id,
  type: form.get("type") as ItineraryType,
  title,
  description: (form.get("description") as string) || "",
  location: (form.get("location") as string) || "",
  start_time: now,
  end_time: now,
  amount,
  currency: itineraryCurrency, // ✅ NOVO
  visibility,
  photo_url: null,
};
```

E adicionar ao final da função (antes do fechamento):
```typescript
// Close modal and reset form
closeModal();
setItineraryCurrency(settings.default_currency);
```

### 3.2 Atualizar createExpense (linha 556)

**ANTES:**
```typescript
const { error } = await supabase.from("expenses").insert({
  id: crypto.randomUUID(),
  trip_id: id,
  created_by_member_id: currentMember.id,
  description: (form.get("description") as string) || "Despesa",
  amount,
  currency: settings.default_currency,
  category_id: (form.get("category_id") as string) || null,
  visibility,
  date: new Date().toISOString().split("T")[0],
});
```

**DEPOIS:**
```typescript
const { error } = await supabase.from("expenses").insert({
  id: crypto.randomUUID(),
  trip_id: id,
  created_by_member_id: currentMember.id,
  description: (form.get("description") as string) || "Despesa",
  amount,
  currency: expenseCurrency, // ✅ Usar estado ao invés de settings
  category_id: (form.get("category_id") as string) || null,
  visibility,
  date: new Date().toISOString().split("T")[0],
});
```

E adicionar ao final:
```typescript
// Close modal and reset form
closeModal();
setExpenseCurrency(settings.default_currency);
```

### 3.3 Atualizar createIdea (linha 574)

Adicionar currency ao insert (linha 601):
```typescript
const { error: ideaError } = await supabase.from("ideas").insert(newIdea);
```

Atualizar newIdea (linha 590):
```typescript
const newIdea: Idea = {
  id: ideaId,
  trip_id: id,
  created_by_member_id: currentMember.id,
  title,
  maps_url: mapsUrl,
  estimated_amount: estimatedAmount,
  currency: ideaCurrency, // ✅ NOVO
  visibility,
  created_at: new Date().toISOString(),
};
```

E adicionar ao final (após linha 657):
```typescript
// Close modal and reset form
closeModal();
setIdeaCurrency(settings.default_currency);
```

### 3.4 Atualizar saveTripBudget (linha 1073)

**ANTES:**
```typescript
const { data, error } = await supabase.rpc("upsert_trip_budget", {
  p_trip_id: id,
  p_budget_limit: safeBudget,
});
```

**DEPOIS:**
```typescript
const { data, error } = await supabase.rpc("upsert_trip_budget", {
  p_trip_id: id,
  p_budget_limit: safeBudget,
  p_currency: budgetCurrency, // ✅ NOVO
});
```

### 3.5 Atualizar upsertItineraryExpense (linha 428)

Adicionar currency aos inserts:
```typescript
currency: itineraryCurrency, // ou usar settings.default_currency
```

## Parte 4: Atualizar Funções de Conversão de Moeda

### 4.1 Adicionar função de conversão (após linha 1133)

```typescript
const convertCurrency = async (amount: number, fromCurrency: string, toCurrency: string): Promise<number> => {
  if (fromCurrency === toCurrency) return amount;
  try {
    return await currencyService.convert(amount, fromCurrency, toCurrency);
  } catch (error) {
    console.error('Currency conversion failed:', error);
    return amount;
  }
};

const getExchangeRate = (fromCurrency: string, toCurrency: string): string => {
  if (!exchangeRates || fromCurrency === toCurrency) return '1.00';
  const rate = exchangeRates.rates[toCurrency.toUpperCase()];
  return rate ? rate.toFixed(4) : '1.00';
};
```

### 4.2 Atualizar cálculo de expensesTotal (linha 1126)

**ANTES:**
```typescript
const expensesTotal = useMemo(
  () => (trip ? trip.expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0) : 0),
  [trip],
);
```

**DEPOIS:**
```typescript
const expensesTotal = useMemo(() => {
  if (!trip) return 0;
  
  return trip.expenses.reduce((total, expense) => {
    const amount = Number(expense.amount) || 0;
    
    // Se a moeda é diferente da padrão, converter
    if (expense.currency !== settings.default_currency && exchangeRates) {
      try {
        const rate = exchangeRates.rates[settings.default_currency.toUpperCase()];
        if (rate) {
          return total + (amount * rate);
        }
      } catch (error) {
        console.error('Conversion error:', error);
      }
    }
    
    return total + amount;
  }, 0);
}, [trip, settings.default_currency, exchangeRates]);
```

## Parte 5: Atualizar UI - Remover Formulários Inline

### 5.1 Itinerary Tab (linha 1266)

**REMOVER** o Card com formulário (linhas 1402-1425) e substituir por apenas a lista:

```typescript
{activeTab === "itinerary" && (
  <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
    <div className="space-y-4">
      {trip.itinerary.map((item) => (
        <Card key={item.id} className="group p-0 overflow-hidden">
          {/* ... conteúdo do card existente ... */}
        </Card>
      ))}
    </div>
    
    {/* FAB */}
    <FloatingActionButton onClick={() => openModal('itinerary')} />
  </motion.div>
)}
```

### 5.2 Expenses Tab (linha 1430)

**REMOVER** o Card com formulário (linhas 1781-1808) e adicionar FAB:

```typescript
{/* Após a lista de despesas */}
<FloatingActionButton onClick={() => openModal('expense')} />
```

### 5.3 Ideas Tab (linha 1811)

**REMOVER** o Card com formulário (linhas 1991-2045) e adicionar FAB:

```typescript
{/* Após a grid de ideias */}
<FloatingActionButton onClick={() => openModal('idea')} />
```

## Parte 6: Adicionar Modais

### 6.1 Adicionar modais antes do closing tag do main (antes da linha 2527)

```typescript
{/* Modals */}
<Modal 
  isOpen={showAddModal && modalType === 'itinerary'} 
  onClose={closeModal}
  title="Nova Atividade"
  size="md"
>
  <form
    className="space-y-4"
    onSubmit={async (e) => {
      e.preventDefault();
      await createItinerary(new FormData(e.currentTarget));
      (e.target as HTMLFormElement).reset();
    }}
  >
    <select name="type" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm">
      <option value="activity">Atividade</option>
      <option value="flight">Voo</option>
      <option value="bus">Ônibus</option>
      <option value="hotel">Hospedagem</option>
    </select>
    
    <input name="title" required placeholder="Título" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
    <input name="location" placeholder="Local" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
    
    <div className="grid grid-cols-2 gap-3">
      <input
        name="amount"
        placeholder="Valor (opcional)"
        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
        onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
      />
      <CurrencySelector 
        value={itineraryCurrency}
        onChange={setItineraryCurrency}
      />
    </div>
    
    <textarea name="description" placeholder="Notas" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm h-20" />
    
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="is_private" />
      Marcar como privado
    </label>
    
    <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
      Adicionar
    </button>
  </form>
</Modal>

<Modal 
  isOpen={showAddModal && modalType === 'expense'} 
  onClose={closeModal}
  title="Nova Despesa"
  size="md"
>
  <form
    className="space-y-4"
    onSubmit={async (e) => {
      e.preventDefault();
      await createExpense(new FormData(e.currentTarget));
      (e.target as HTMLFormElement).reset();
    }}
  >
    <input name="description" required placeholder="Descrição" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
    
    <select name="category_id" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm">
      <option value="">Sem categoria</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>{cat.name}</option>
      ))}
    </select>
    
    <div className="grid grid-cols-2 gap-3">
      <input
        name="amount"
        required
        placeholder="Valor"
        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
        onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
      />
      <CurrencySelector 
        value={expenseCurrency}
        onChange={setExpenseCurrency}
      />
    </div>
    
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="is_private" />
      Marcar como privado
    </label>
    
    <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
      Adicionar
    </button>
  </form>
</Modal>

<Modal 
  isOpen={showAddModal && modalType === 'idea'} 
  onClose={closeModal}
  title="Nova Ideia"
  size="lg"
>
  <form
    className="space-y-4"
    onSubmit={async (e) => {
      e.preventDefault();
      await createIdea(new FormData(e.currentTarget));
      (e.target as HTMLFormElement).reset();
    }}
  >
    <input name="title" required placeholder="Título" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
    <input name="maps_url" placeholder="URL do Google Maps" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
    
    <div className="grid grid-cols-2 gap-3">
      <input
        name="estimated_amount"
        placeholder="Valor estimado (opcional)"
        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
        onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
      />
      <CurrencySelector 
        value={ideaCurrency}
        onChange={setIdeaCurrency}
      />
    </div>
    
    <div className="space-y-2">
      <p className="text-sm font-semibold">URLs</p>
      {ideaLinksDraft.map((value, index) => (
        <div key={`idea-link-${index}`} className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setIdeaLinksDraft((current) => current.map((entry, i) => (i === index ? e.target.value : entry)))}
            placeholder="https://..."
            className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm"
          />
          {ideaLinksDraft.length > 1 && (
            <button type="button" className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold" onClick={() => setIdeaLinksDraft((current) => current.filter((_, i) => i !== index))}>
              Remover
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setIdeaLinksDraft((current) => [...current, ""])} className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold">
        Adicionar URL
      </button>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="space-y-1">
        <span className="text-xs text-zinc-500">Anexos</span>
        <input ref={ideaAttachmentInputRef} type="file" multiple className="block w-full text-sm" />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-zinc-500">Fotos</span>
        <input ref={ideaPhotoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple className="block w-full text-sm" />
      </label>
    </div>
    
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="is_private" />
      Marcar como privado
    </label>
    
    <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
      Salvar Ideia
    </button>
  </form>
</Modal>
```

## Parte 7: Atualizar Display de Despesas com Conversão

### 7.1 Atualizar tabela de despesas (linha 1632)

**ANTES:**
```typescript
<td className="px-4 py-3 font-bold">{formatCurrency(exp.amount, exp.currency || settings.default_currency)}</td>
```

**DEPOIS:**
```typescript
<td className="px-4 py-3">
  {exp.currency !== settings.default_currency && exchangeRates ? (
    <div className="space-y-1">
      <div className="font-bold">
        {formatCurrency(
          exp.amount * (exchangeRates.rates[settings.default_currency.toUpperCase()] || 1),
          settings.default_currency
        )}
      </div>
      <div className="text-xs text-zinc-500">
        {formatCurrency(exp.amount, exp.currency)}
        <span className="mx-1">→</span>
        Taxa: {getExchangeRate(exp.currency, settings.default_currency)}
      </div>
    </div>
  ) : (
    <div className="font-bold">
      {formatCurrency(exp.amount, exp.currency || settings.default_currency)}
    </div>
  )}
</td>
```

### 7.2 Atualizar cards mobile de despesas (linha 1749)

Aplicar a mesma lógica de conversão no display mobile.

## Parte 8: Atualizar Settings - Budget Currency

### 8.1 Adicionar CurrencySelector no budget (linha 2250)

```typescript
<div className="grid grid-cols-2 gap-3">
  <input
    value={settingsDraft.budget_limit_masked || ""}
    onChange={(e) => {
      const masked = maskCurrency(e.target.value);
      setSettingsDraft((prev) => ({ ...prev, budget_limit_masked: masked }));
      setTripBudget((current) => ({
        id: current?.id || "",
        trip_id: id || "",
        owner_user_id: budgetOwnerUserId || session.user.id,
        budget_limit: parseCurrencyToNumber(masked),
        currency: budgetCurrency,
      }));
    }}
    placeholder="0,00"
    className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
  />
  <CurrencySelector 
    value={budgetCurrency}
    onChange={setBudgetCurrency}
  />
</div>
```

## Resumo das Mudanças

✅ **Componentes Criados:**
- Modal.tsx
- FloatingActionButton.tsx
- CurrencySelector.tsx
- currencyService.ts

✅ **Database:**
- currency_migration.sql

✅ **Types Atualizados:**
- ItineraryItem + currency
- Idea + currency
- TripBudget + currency

✅ **TripDashboard.tsx:**
- Novos imports e estados
- Funções de modal
- Carregar exchange rates
- Atualizar createItinerary, createExpense, createIdea
- Atualizar saveTripBudget
- Adicionar conversão de moeda
- Remover formulários inline
- Adicionar FABs
- Adicionar modais
- Atualizar display de despesas com conversão

## Próximos Passos

1. Aplicar todas as mudanças no TripDashboard.tsx
2. Executar currency_migration.sql no Supabase
3. Testar cada formulário
4. Testar conversão de moedas
5. Ajustar responsividade mobile
6. Testes finais
