import { useState, useEffect, useCallback, useRef } from "react";
import { currencyService } from "../services/currencyService";

interface UseCurrencyConversionReturn {
  rates: Record<string, number>;      // taxas brutas indexadas por código de moeda
  rateDate: string | null;            // data (YYYY-MM-DD) da cotação retornada pela API
  isLoading: boolean;                 // true enquanto faz o primeiro fetch (sem dados em cache ainda)
  isRefreshing: boolean;              // true durante um refresh manual, com dados antigos ainda disponíveis
  convert: (amount: number, fromCurrency: string) => number; // converte para baseCurrency
  refresh: () => Promise<void>;       // força um novo fetch, ignorando o cache local
}

export function useCurrencyConversion(baseCurrency: string): UseCurrencyConversionReturn {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasRatesRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchRates = useCallback(async (forceRefresh: boolean) => {
    // Só bloqueia a tela (isLoading) quando ainda não há nenhuma cotação em memória.
    // Em um refresh manual já temos dados antigos para exibir, então só sinalizamos
    // isRefreshing (usado apenas para animar o ícone do botão) e mantemos a tela estável.
    if (hasRatesRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      if (forceRefresh) {
        currencyService.clearCache();
      }
      const data = await currencyService.getExchangeRates(baseCurrency);
      if (isMountedRef.current) {
        setRates(data.rates);
        setRateDate(data.date ?? null);
        hasRatesRef.current = true;
      }
    } catch (error) {
      console.error("Failed to fetch rates in useCurrencyConversion:", error);
      throw error;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [baseCurrency]);

  useEffect(() => {
    isMountedRef.current = true;
    hasRatesRef.current = false;
    void fetchRates(false).catch(() => {
      // Falha silenciosa no carregamento inicial, conforme requisito original.
    });
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchRates]);

  const refresh = useCallback(() => fetchRates(true), [fetchRates]);

  const convert = useCallback((amount: number, fromCurrency: string): number => {
    const normalizedFrom = fromCurrency.toUpperCase();
    const normalizedBase = baseCurrency.toUpperCase();

    if (normalizedFrom === normalizedBase) {
      return amount;
    }

    const rate = rates[normalizedFrom];
    if (rate) {
      return amount / rate;
    }

    return amount;
  }, [baseCurrency, rates]);

  return {
    rates,
    rateDate,
    isLoading,
    isRefreshing,
    convert,
    refresh
  };
}
