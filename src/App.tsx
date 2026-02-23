import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import {
  Plane,
  Bus,
  Hotel,
  Calendar,
  DollarSign,
  FileText,
  Plus,
  MapPin,
  Trash2,
  LayoutDashboard,
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const THEMES = {
  default: {
    primary: "bg-black",
    primaryText: "text-white",
    accent: "bg-zinc-100",
    border: "border-zinc-100",
    sidebarActive: "bg-black text-white",
    hover: "hover:bg-zinc-100",
    button: "bg-black hover:bg-zinc-800"
  },
  ocean: {
    primary: "bg-blue-600",
    primaryText: "text-white",
    accent: "bg-blue-50",
    border: "border-blue-100",
    sidebarActive: "bg-blue-600 text-white",
    hover: "hover:bg-blue-50",
    button: "bg-blue-600 hover:bg-blue-700"
  },
  emerald: {
    primary: "bg-emerald-600",
    primaryText: "text-white",
    accent: "bg-emerald-50",
    border: "border-emerald-100",
    sidebarActive: "bg-emerald-600 text-white",
    hover: "hover:bg-emerald-50",
    button: "bg-emerald-600 hover:bg-emerald-700"
  },
  sunset: {
    primary: "bg-orange-600",
    primaryText: "text-white",
    accent: "bg-orange-50",
    border: "border-orange-100",
    sidebarActive: "bg-orange-600 text-white",
    hover: "hover:bg-orange-50",
    button: "bg-orange-600 hover:bg-orange-700"
  }
};

type ThemeKey = keyof typeof THEMES;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

interface ItineraryItem {
  id: string;
  type: "flight" | "bus" | "hotel" | "activity";
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  amount: number;
  photo_url?: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
}

interface DocumentItem {
  id: string;
  name: string;
  url: string;
}

interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary: ItineraryItem[];
  expenses: Expense[];
  documents: DocumentItem[];
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
      active
        ? "bg-black text-white shadow-lg shadow-black/10"
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    )}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const Card = ({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div className={cn("bg-white rounded-2xl border border-zinc-100 shadow-sm p-6", className)} onClick={onClick}>
    {children}
  </div>
);

function LandingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, destination, start_date: new Date().toISOString(), end_date: new Date().toISOString() })
    });
    const data = await res.json();
    navigate(`/trip/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-8"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Voyage</h1>
          <p className="text-zinc-500">Planeje sua próxima aventura com amigos.</p>
        </div>

        <Card className="text-left">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Nome da Viagem</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Eurotrip 2026"
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Destino</label>
              <input
                required
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="Ex: Paris, França"
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-black text-white py-4 rounded-xl font-semibold hover:bg-zinc-800 transition-colors shadow-xl shadow-black/10"
            >
              Começar Planejamento
            </button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

function TripDashboard() {
  const { id } = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "documents">("itinerary");
  const [themeKey, setThemeKey] = useState<ThemeKey>("default");
  const socket = useRef<WebSocket | null>(null);
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const theme = THEMES[themeKey];

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}?tripId=${id}`);
      socket.current = ws;

      ws.onmessage = (event) => {
        const { type, payload } = JSON.parse(event.data);
        setTrip(prev => {
          if (!prev) return null;
          switch (type) {
            case "ITINERARY_ADDED":
              if (prev.itinerary.some(item => item.id === payload.id)) return prev;
              return {
                ...prev,
                itinerary: [...prev.itinerary, { ...payload, amount: Number(payload.amount) || 0 }].sort((a, b) => a.start_time.localeCompare(b.start_time))
              };
            case "ITINERARY_PHOTO_UPDATED":
              return { ...prev, itinerary: prev.itinerary.map(item => item.id === payload.id ? { ...item, photo_url: payload.photo_url } : item) };
            case "ITINERARY_DELETED":
              return { ...prev, itinerary: prev.itinerary.filter(item => item.id !== payload.id) };
            case "EXPENSE_ADDED":
              if (prev.expenses.some(item => item.id === payload.id)) return prev;
              return { ...prev, expenses: [...prev.expenses, payload] };
            case "EXPENSE_DELETED":
              return { ...prev, expenses: prev.expenses.filter(item => item.id !== payload.id) };
            case "DOCUMENT_ADDED":
              if (prev.documents.some(item => item.id === payload.id)) return prev;
              return { ...prev, documents: [...prev.documents, payload] };
            case "DOCUMENT_DELETED":
              return { ...prev, documents: prev.documents.filter(item => item.id !== payload.id) };
            default:
              return prev;
          }
        });
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    const fetchTrip = async () => {
      try {
        const res = await fetch(`/api/trips/${id}`);
        if (!res.ok) throw new Error("Failed to fetch trip");
        const data = await res.json();
        setTrip({
          ...data,
          itinerary: (data.itinerary || []).map((item: ItineraryItem) => ({ ...item, amount: Number(item.amount) || 0 })),
          expenses: data.expenses || [],
          documents: data.documents || [],
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchTrip();
    connect();

    return () => {
      ws?.close();
      clearTimeout(reconnectTimeout);
    };
  }, [id]);

  if (!trip) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

  const totalExpenses = trip.expenses.reduce((sum, exp) => sum + exp.amount, 0);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });

  const handlePhotoSelected = async (itemId: string, file?: File) => {
    if (!file) return;
    if (socket.current?.readyState !== WebSocket.OPEN) {
      alert("Conexão perdida. Tentando reconectar...");
      return;
    }
    try {
      const photoUrl = await fileToDataUrl(file);
      socket.current?.send(JSON.stringify({
        type: "UPDATE_ITINERARY_PHOTO",
        payload: { id: itemId, photo_url: photoUrl }
      }));
    } catch {
      alert("Não foi possível adicionar a foto.");
    }
  };

  const handleDocumentSelected = async (file?: File) => {
    if (!file) return;
    if (socket.current?.readyState !== WebSocket.OPEN) {
      alert("Conexão perdida. Tentando reconectar...");
      return;
    }
    try {
      const fileUrl = await fileToDataUrl(file);
      socket.current?.send(JSON.stringify({
        type: "ADD_DOCUMENT",
        payload: { name: file.name, url: fileUrl }
      }));
    } catch {
      alert("Não foi possível adicionar o documento.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      <aside className="w-64 border-r border-zinc-200 bg-white p-6 hidden md:flex flex-col gap-8">
        <div className="flex items-center gap-2 px-2">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", theme.primary)}>
            <Plane className="text-white" size={18} />
          </div>
          <span className="font-bold text-xl tracking-tight">Voyage</span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Itinerário" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem icon={DollarSign} label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem icon={FileText} label="Documentos" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
        </nav>

        <div className="pt-6 border-t border-zinc-100">
          <div className={cn("rounded-xl p-4", theme.accent)}>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Total Gasto</p>
            <p className="text-xl font-bold text-zinc-900">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl font-bold text-zinc-900">{trip.name}</h2>
            <div className="flex items-center gap-2 text-zinc-500 mt-1">
              <MapPin size={16} />
              <span>{trip.destination}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Link da viagem copiado!");
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors"
            >
              <Users size={16} />
              Convidar
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "itinerary" && (
            <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {trip.itinerary.map((item) => (
                    <Card key={item.id} className="flex flex-col gap-4 hover:border-black/20 transition-colors group overflow-hidden p-0">
                      {item.photo_url && (
                        <div className="w-full h-48 overflow-hidden">
                          <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-6 flex items-start gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                          item.type === "flight" && "bg-blue-50 text-blue-600",
                          item.type === "bus" && "bg-orange-50 text-orange-600",
                          item.type === "hotel" && "bg-purple-50 text-purple-600",
                          item.type === "activity" && "bg-emerald-50 text-emerald-600"
                        )}>
                          {item.type === "flight" && <Plane size={24} />}
                          {item.type === "bus" && <Bus size={24} />}
                          {item.type === "hotel" && <Hotel size={24} />}
                          {item.type === "activity" && <Calendar size={24} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-zinc-900 truncate">{item.title}</h4>
                            <span className="text-xs font-medium text-zinc-400">{format(new Date(item.start_time), "HH:mm")}</span>
                          </div>
                          <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{item.description}</p>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center gap-1 text-xs text-zinc-400">
                              <MapPin size={12} />
                              {item.location || "Sem local"}
                            </div>
                            <div className="text-xs font-semibold text-zinc-500">{formatCurrency(item.amount || 0)}</div>
                          </div>
                          <div className="flex items-center gap-2 mt-4">
                            <button
                              onClick={() => photoInputRefs.current[item.id]?.click()}
                              className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-900 flex items-center gap-1 transition-colors"
                            >
                              <FileText size={10} />
                              {item.photo_url ? "Trocar Foto" : "Add Foto"}
                            </button>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => { photoInputRefs.current[item.id] = el; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                handlePhotoSelected(item.id, file);
                                e.target.value = "";
                              }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => socket.current?.send(JSON.stringify({ type: "DELETE_ITINERARY", payload: { id: item.id } }))}
                          className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
                <Card>
                  <h3 className="font-bold text-zinc-900 mb-4">Adicionar ao Itinerário</h3>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    if (socket.current?.readyState !== WebSocket.OPEN) {
                      alert("Conexão perdida. Tentando reconectar...");
                      return;
                    }
                    const formData = new FormData(e.currentTarget);
                    const payload = {
                      type: formData.get("type"),
                      title: formData.get("title"),
                      description: formData.get("description"),
                      location: formData.get("location"),
                      amount: parseFloat(formData.get("amount") as string) || 0,
                      start_time: new Date().toISOString(),
                      end_time: new Date().toISOString(),
                    };
                    socket.current?.send(JSON.stringify({ type: "ADD_ITINERARY", payload }));
                    (e.target as HTMLFormElement).reset();
                  }}>
                    <select name="type" className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-sm">
                      <option value="activity">Atividade</option>
                      <option value="flight">Voo</option>
                      <option value="bus">Ônibus</option>
                      <option value="hotel">Hospedagem</option>
                    </select>
                    <input name="title" placeholder="Título" required className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="location" placeholder="Localização" className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="amount" type="number" min="0" step="0.01" placeholder="Valor (R$)" required className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <textarea name="description" placeholder="Notas" className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-sm h-20" />
                    <button type="submit" className={cn("w-full text-white py-2 rounded-xl text-sm font-bold transition-colors", theme.button)}>Adicionar</button>
                  </form>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === "expenses" && (
            <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card className="p-0 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-bottom border-zinc-100">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Categoria</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Valor</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {trip.expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-zinc-900">{exp.description}</p>
                          <p className="text-xs text-zinc-400">{exp.date}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[10px] font-bold uppercase">{exp.category}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-zinc-900">{formatCurrency(exp.amount)}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => socket.current?.send(JSON.stringify({ type: "DELETE_EXPENSE", payload: { id: exp.id } }))} className="text-zinc-300 hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}

          {activeTab === "documents" && (
            <motion.div key="documents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 bg-transparent cursor-pointer hover:border-zinc-400 transition-colors" onClick={() => documentInputRef.current?.click()}>
                <Plus className="text-zinc-300 mb-2" size={32} />
                <p className="text-sm font-medium text-zinc-400">Adicionar Documento</p>
                <p className="text-xs text-zinc-300 mt-1">PDF, PNG ou JPG</p>
              </Card>
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  handleDocumentSelected(file);
                  e.target.value = "";
                }}
              />
              {trip.documents.map((doc) => (
                <Card key={doc.id} className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-zinc-900 truncate">{doc.name}</h4>
                    <button type="button" onClick={() => window.open(doc.url, "_blank")} className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
                      Abrir documento
                    </button>
                  </div>
                  <button type="button" onClick={() => socket.current?.send(JSON.stringify({ type: "DELETE_DOCUMENT", payload: { id: doc.id } }))} className="text-zinc-300 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </Card>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/trip/:id" element={<TripDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
