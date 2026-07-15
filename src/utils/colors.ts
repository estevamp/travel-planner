// Paleta compartilhada para cores determinísticas por id (categorias, tipos de atividade, membros).
const TYPE_COLORS = [
  "#3B82F6", // blue
  "#EC4899", // pink
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#EF4444", // red
  "#14B8A6", // teal
  "#6366F1", // indigo
  "#D97706", // orange
];

export function getDeterministicColor(id: string | null | undefined): string {
  if (!id) return "#9CA3AF"; // gray para "sem categoria/tipo"
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % TYPE_COLORS.length;
  return TYPE_COLORS[index];
}
