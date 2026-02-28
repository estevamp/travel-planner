import type { LucideIcon } from 'lucide-react';
import {
  Plane, Bus, Train, Ship, Car, Hotel, Utensils, Coffee, ShoppingBag,
  Camera, MapPin, Music, Ticket, Umbrella, Mountain, Waves, Palmtree,
  Wine, Beer, Footprints, Bike, Theater, Landmark, Castle, Church,
  Stethoscope, Briefcase, Calendar,
} from 'lucide-react';

/**
 * Mapa de nome de ícone → componente Lucide.
 * Centraliza todos os ícones de atividade usados em ItineraryTab e SettingsTab.
 * Os nomes devem corresponder exatamente aos valores de ACTIVITY_ICONS em constants/index.ts.
 */
export const ACTIVITY_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Plane, Bus, Train, Ship, Car, Hotel, Utensils, Coffee, ShoppingBag,
  Camera, MapPin, Music, Ticket, Umbrella, Mountain, Waves, Palmtree,
  Wine, Beer, Footprints, Bike, Theater, Landmark, Castle, Church,
  Stethoscope, Briefcase, Calendar,
};
