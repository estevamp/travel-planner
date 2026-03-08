import { useCallback } from "react";
import { useToast } from "./useToast";
import { supabase } from "../supabase";
import { getErrorMessage } from "../utils";
import type { Trip, Visibility } from "../types";

type VisibilityEntity = { id: string; visibility: Visibility };

export function useOptimisticVisibility<
  T extends VisibilityEntity
>(
  collection: keyof Trip,
  table: string,
  onTripUpdate: (updater: (prev: Trip) => Trip) => void
): {
  toggleVisibility: (item: T) => Promise<void>;
} {
  const { toast } = useToast();

  const toggleVisibility = useCallback(
    async (item: T) => {
      const nextVisibility: Visibility =
        item.visibility === "public" ? "private" : "public";

      onTripUpdate((prev) => {
        const items = prev[collection] as unknown as T[];
        return {
          ...prev,
          [collection]: items.map((current) =>
            current.id === item.id
              ? { ...current, visibility: nextVisibility }
              : current
          ),
        } as Trip;
      });

      const { error } = await supabase
        .from(table)
        .update({ visibility: nextVisibility })
        .eq("id", item.id);

      if (error) {
        toast(getErrorMessage(error), "error");
        onTripUpdate((prev) => {
          const items = prev[collection] as unknown as T[];
          return {
            ...prev,
            [collection]: items.map((current) =>
              current.id === item.id
                ? { ...current, visibility: item.visibility }
                : current
            ),
          } as Trip;
        });
      }
    },
    [collection, onTripUpdate, table, toast]
  );

  return { toggleVisibility };
}
