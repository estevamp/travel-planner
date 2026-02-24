import { MapPin, Shield } from "lucide-react";
import { Trip } from "../../types";

interface TripHeaderProps {
  trip: Trip;
  isAdmin: boolean;
}

export function TripHeader({ trip, isAdmin }: TripHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 mb-8">
      <div>
        <h2 className="text-3xl font-bold">{trip.name}</h2>
        <div className="flex items-center gap-2 text-zinc-500 mt-1">
          <MapPin size={16} />
          {trip.destination}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && (
          <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold uppercase flex items-center gap-1">
            <Shield size={12} />
            Admin
          </div>
        )}
      </div>
    </header>
  );
}
