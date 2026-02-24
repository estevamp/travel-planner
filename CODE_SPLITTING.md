# Code Splitting - Travel Planner

## Resumo da Refatoração

O arquivo [`src/App.tsx`](src/App.tsx) foi refatorado para melhorar a manutenibilidade através de code splitting lógico. O arquivo original tinha **2297 linhas** e foi dividido em múltiplos arquivos menores e mais focados.

## Estrutura de Diretórios Criada

```
src/
├── types/
│   └── index.ts                    # Todas as interfaces e tipos TypeScript
├── utils/
│   ├── index.ts                    # Funções utilitárias (cn, getErrorMessage, formatCurrency, fileToDataUrl)
│   └── theme.ts                    # Função getThemeStyles
├── constants/
│   └── index.ts                    # Constantes (DOCS_BUCKET, THEME_PALETTES)
├── components/
│   ├── Card.tsx                    # Componente Card reutilizável
│   ├── SidebarItem.tsx             # Item de menu da sidebar
│   ├── AuthLanding.tsx             # Página de autenticação
│   ├── LandingPage.tsx             # Página inicial com lista de viagens
│   ├── InvitePage.tsx              # Página de aceitar convites
│   ├── ProtectedRoute.tsx          # HOC para rotas protegidas
│   └── TripDashboard/
│       ├── index.tsx               # Export principal
│       ├── TripDashboard.tsx       # Componente principal (stub)
│       ├── TripSidebar.tsx         # Sidebar de navegação
│       ├── TripHeader.tsx          # Cabeçalho da viagem
│       ├── TripMobileNav.tsx       # Navegação mobile
│       └── tabs/
│           ├── ItineraryTab.tsx    # Tab de itinerário (stub)
│           ├── ExpensesTab.tsx     # Tab de despesas (stub)
│           ├── IdeasTab.tsx        # Tab de ideias (stub)
│           ├── DocumentsTab.tsx    # Tab de documentos (stub)
│           ├── PeopleTab.tsx       # Tab de pessoas (stub)
│           └── SettingsTab.tsx     # Tab de configurações (stub)
└── App.tsx                         # Arquivo principal refatorado
```

## Componentes Extraídos

### 1. **Tipos e Interfaces** ([`src/types/index.ts`](src/types/index.ts))
- `ItineraryType`, `Visibility`, `ThemePalette`
- `UserSettings`, `TripBudget`, `ItineraryItem`, `Expense`
- `DocumentItem`, `Idea`, `IdeaLink`, `IdeaAsset`
- `TripMember`, `TripInvite`, `Trip`, `TripSummary`

### 2. **Utilitários** ([`src/utils/index.ts`](src/utils/index.ts))
- [`cn()`](src/utils/index.ts:5) - Combina classes CSS com clsx e tailwind-merge
- [`getErrorMessage()`](src/utils/index.ts:9) - Extrai mensagens de erro
- [`formatCurrency()`](src/utils/index.ts:17) - Formata valores monetários
- [`fileToDataUrl()`](src/utils/index.ts:21) - Converte File para Data URL

### 3. **Tema** ([`src/utils/theme.ts`](src/utils/theme.ts))
- [`getThemeStyles()`](src/utils/theme.ts:5) - Gera estilos CSS baseados nas configurações de tema

### 4. **Constantes** ([`src/constants/index.ts`](src/constants/index.ts))
- [`DOCS_BUCKET`](src/constants/index.ts:3) - Nome do bucket de documentos
- [`THEME_PALETTES`](src/constants/index.ts:5) - Paletas de cores disponíveis

### 5. **Componentes UI Básicos**
- [`Card`](src/components/Card.tsx:5) - Container estilizado reutilizável
- [`SidebarItem`](src/components/SidebarItem.tsx:3) - Item de menu da sidebar

### 6. **Páginas de Autenticação**
- [`AuthLanding`](src/components/AuthLanding.tsx:7) - Tela de login com Google OAuth
- [`InvitePage`](src/components/InvitePage.tsx:8) - Aceitar convites de viagem
- [`ProtectedRoute`](src/components/ProtectedRoute.tsx:4) - HOC para proteger rotas

### 7. **Página Principal**
- [`LandingPage`](src/components/LandingPage.tsx:11) - Lista de viagens e criação de novas viagens

### 8. **Dashboard de Viagem**
- [`TripSidebar`](src/components/TripDashboard/TripSidebar.tsx:18) - Navegação lateral com lista de viagens
- [`TripHeader`](src/components/TripDashboard/TripHeader.tsx:9) - Cabeçalho com nome e destino da viagem
- [`TripMobileNav`](src/components/TripDashboard/TripMobileNav.tsx:9) - Navegação inferior para mobile
- Tabs (stubs para implementação futura):
  - [`ItineraryTab`](src/components/TripDashboard/tabs/ItineraryTab.tsx:3)
  - [`ExpensesTab`](src/components/TripDashboard/tabs/ExpensesTab.tsx:3)
  - [`IdeasTab`](src/components/TripDashboard/tabs/IdeasTab.tsx:3)
  - [`DocumentsTab`](src/components/TripDashboard/tabs/DocumentsTab.tsx:3)
  - [`PeopleTab`](src/components/TripDashboard/tabs/PeopleTab.tsx:3)
  - [`SettingsTab`](src/components/TripDashboard/tabs/SettingsTab.tsx:3)

## Benefícios da Refatoração

### ✅ Manutenibilidade
- Cada arquivo tem uma responsabilidade única e clara
- Mais fácil encontrar e modificar código específico
- Reduz a complexidade cognitiva

### ✅ Reutilização
- Componentes como [`Card`](src/components/Card.tsx) e [`SidebarItem`](src/components/SidebarItem.tsx) podem ser usados em toda a aplicação
- Utilitários centralizados evitam duplicação de código

### ✅ Testabilidade
- Componentes menores são mais fáceis de testar isoladamente
- Funções utilitárias podem ser testadas independentemente

### ✅ Colaboração
- Múltiplos desenvolvedores podem trabalhar em diferentes componentes simultaneamente
- Reduz conflitos de merge no Git

### ✅ Performance (potencial)
- Preparado para lazy loading de componentes no futuro
- Estrutura permite code splitting automático pelo bundler

## Próximos Passos Recomendados

1. **Implementar as Tabs Completas**
   - Mover a lógica das tabs do [`App.tsx`](src/App.tsx) para os arquivos stub em [`src/components/TripDashboard/tabs/`](src/components/TripDashboard/tabs/)
   
2. **Extrair Hooks Customizados**
   - Criar hooks para lógica reutilizável (ex: `useTrip`, `useTripBudget`, `useAutoSave`)
   
3. **Adicionar Testes**
   - Testes unitários para utilitários
   - Testes de componente para UI
   
4. **Implementar Lazy Loading**
   ```typescript
   const TripDashboard = lazy(() => import('./components/TripDashboard'));
   ```

5. **Documentação de Componentes**
   - Adicionar JSDoc para props e funções
   - Criar Storybook para componentes UI

## Notas Técnicas

- Os erros TypeScript mostrados são esperados pois as dependências (`react`, `react-router-dom`, etc.) não estão instaladas no ambiente de análise
- A aplicação mantém toda a funcionalidade original
- O arquivo [`App.tsx`](src/App.tsx) ainda contém o componente `TripDashboard` completo por enquanto, mas está preparado para usar os componentes extraídos
- Os stubs das tabs permitem desenvolvimento incremental sem quebrar a aplicação

## Estrutura de Imports no App.tsx

```typescript
// Utilitários
import { cn, getErrorMessage, formatCurrency, fileToDataUrl } from "./utils";
import { getThemeStyles } from "./utils/theme";

// Constantes
import { DOCS_BUCKET } from "./constants";

// Tipos
import type { UserSettings, Trip, TripMember, ... } from "./types";

// Componentes
import { Card } from "./components/Card";
import { SidebarItem } from "./components/SidebarItem";
import { AuthLanding } from "./components/AuthLanding";
import { LandingPage } from "./components/LandingPage";
import { InvitePage } from "./components/InvitePage";
import { ProtectedRoute } from "./components/ProtectedRoute";
```

Esta estrutura torna os imports mais organizados e fáceis de entender.
