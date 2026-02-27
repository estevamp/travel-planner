# Implementação de Edição de Rateio de Despesas

## Situação Atual

Atualmente, a edição de despesas no ExpensesTab é feita **inline** (diretamente na tabela/card), permitindo editar:
- Descrição
- Categoria
- Valor
- Visibilidade (privado/público)
- Status (confirmada/prevista)

**Problema**: Os componentes de rateio (PayerSelector e SplitSelector) precisam de mais espaço e não cabem no formato inline.

## Solução Recomendada: Modal de Edição

Criar um modal de edição similar ao modal de criação, com todos os campos incluindo o rateio.

### Passo 1: Adicionar estado para modal de edição no TripDashboard

```typescript
// Em TripDashboard.tsx, adicionar após os estados existentes:
const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
const [editExpensePayerId, setEditExpensePayerId] = useState<string>("");
const [editExpenseSplits, setEditExpenseSplits] = useState<CreateExpenseSplitInput[]>([]);
const [editExpenseSplitType, setEditExpenseSplitType] = useState<SplitType>("equal");
```

### Passo 2: Criar função para abrir modal de edição

```typescript
const openEditExpenseModal = async (expense: Expense) => {
  setEditingExpense(expense);
  setShowEditExpenseModal(true);
  
  // Buscar splits existentes
  const { data: splitsData } = await supabase
    .from("expense_splits")
    .select("*")
    .eq("expense_id", expense.id);
  
  // Buscar paid_by_member_id e split_type
  const { data: expenseData } = await supabase
    .from("expenses")
    .select("paid_by_member_id, split_type")
    .eq("id", expense.id)
    .single();
  
  if (expenseData) {
    setEditExpensePayerId(expenseData.paid_by_member_id || currentMember?.id || "");
    setEditExpenseSplitType(expenseData.split_type || "equal");
  }
  
  if (splitsData) {
    setEditExpenseSplits(splitsData.map(s => ({
      member_id: s.member_id,
      amount: s.amount,
      percentage: s.percentage,
    })));
  }
};
```

### Passo 3: Criar função para salvar edição

```typescript
const saveEditExpense = async (form: FormData) => {
  if (!editingExpense) return;
  
  const visibility = form.get("is_private") === "on" ? "private" : "public";
  const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
  const description = (form.get("description") as string) || "Despesa";
  const category_id = (form.get("category_id") as string) || null;
  const is_confirmed = form.get("is_confirmed") === "on";
  
  // Atualizar despesa
  const { error } = await supabase.from("expenses").update({
    description,
    amount,
    category_id,
    visibility,
    is_confirmed,
    paid_by_member_id: editExpensePayerId,
    split_type: editExpenseSplitType,
  }).eq("id", editingExpense.id);
  
  if (error) {
    alert(getErrorMessage(error));
    return;
  }
  
  // Deletar splits antigos
  await supabase.from("expense_splits").delete().eq("expense_id", editingExpense.id);
  
  // Inserir novos splits (se despesa for pública)
  if (editExpenseSplits.length > 0 && visibility === "public") {
    await supabase.from("expense_splits").insert(
      editExpenseSplits.map(split => ({
        expense_id: editingExpense.id,
        member_id: split.member_id,
        amount: split.amount || 0,
        percentage: split.percentage,
      }))
    );
  }
  
  setShowEditExpenseModal(false);
  setEditingExpense(null);
  reloadTrip();
};
```

### Passo 4: Modificar ExpensesTab para usar modal

No ExpensesTab, substituir o botão de edição inline por um botão que abre o modal:

```typescript
// Passar função via props
interface ExpensesTabProps {
  // ... props existentes
  onOpenEditModal: (expense: Expense) => void;
}

// No botão de editar:
<button 
  type="button" 
  onClick={() => onOpenEditModal(exp)} 
  className="text-zinc-400 hover:text-zinc-700"
>
  <FilePenLine size={16} />
</button>
```

### Passo 5: Adicionar modal de edição no TripDashboard

```tsx
<Modal
  isOpen={showEditExpenseModal}
  onClose={() => {
    setShowEditExpenseModal(false);
    setEditingExpense(null);
  }}
  title="Editar Despesa"
  size="lg"
>
  <form
    className="space-y-4"
    onSubmit={async (e) => {
      e.preventDefault();
      await saveEditExpense(new FormData(e.currentTarget));
    }}
  >
    {/* Mesma estrutura do modal de criação, mas com valores preenchidos */}
    <input 
      name="description" 
      defaultValue={editingExpense?.description}
      required 
      placeholder="Ex: Almoço" 
      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
    />
    
    {/* ... outros campos ... */}
    
    {/* Seção de Rateio */}
    <div className="border-t pt-4 space-y-4">
      <h3 className="text-sm font-bold text-zinc-700">Rateio da Despesa</h3>
      
      <PayerSelector
        members={members}
        selectedPayerId={editExpensePayerId}
        currentUserId={session.user.id}
        onSelect={setEditExpensePayerId}
      />
      
      <SplitSelector
        members={members}
        totalAmount={editingExpense?.amount || 0}
        currentUserId={session.user.id}
        onSplitsChange={(splits, splitType) => {
          setEditExpenseSplits(splits);
          setEditExpenseSplitType(splitType);
        }}
      />
    </div>
    
    <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
      Salvar Alterações
    </button>
  </form>
</Modal>
```

## Alternativa Mais Simples (Recomendada para MVP)

Se preferir uma implementação mais rápida, você pode:

1. **Manter edição inline para campos básicos** (descrição, categoria, valor)
2. **Adicionar botão "Editar Rateio"** que abre um modal específico só para o rateio
3. **Desabilitar edição de rateio** para despesas já com saldo calculado (exigir acerto antes)

### Implementação da alternativa simples:

```tsx
// No ExpensesTab, adicionar botão ao lado do botão de editar:
{exp.visibility === "public" && (
  <button
    type="button"
    onClick={() => onOpenSplitModal(exp)}
    className="text-zinc-400 hover:text-blue-500"
    title="Editar rateio"
  >
    <Users size={16} />
  </button>
)}
```

## Considerações Importantes

1. **Recálculo de Saldos**: Ao editar splits, os saldos de todos os membros serão recalculados automaticamente
2. **Validação**: Verificar se há settlements já criados baseados nos splits antigos
3. **Histórico**: Considerar manter um log de alterações para auditoria
4. **UX**: Mostrar aviso se a edição impactar saldos já calculados

## Próximos Passos

1. Decidir qual abordagem usar (modal completo ou modal só de rateio)
2. Implementar a função de buscar splits existentes
3. Adicionar validações de negócio
4. Testar fluxo completo de edição
5. Adicionar feedback visual de que o rateio foi alterado
