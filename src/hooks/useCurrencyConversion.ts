import { useState, useEffect, useCallback } from "react";
import { currencyService } from "../services/currencyService";

interface UseCurrencyConversionReturn {
  rates: Record<string, number>;      // taxas brutas indexadas por código de moeda
  rateDate: string | null;            // data (YYYY-MM-DD) da cotação retornada pela API
  isLoading: boolean;                 // true enquanto faz o primeiro fetch
  convert: (amount: number, fromCurrency: string) => number; // converte para baseCurrency
  refresh: () => void;                // força um novo fetch, ignorando o cache local
}

export function useCurrencyConversion(baseCurrency: string): UseCurrencyConversionReturn {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchRates = async () => {
      setIsLoading(true);
      try {
        if (refreshToken > 0) {
          currencyService.clearCache();
        }
        const data = await currencyService.getExchangeRates(baseCurrency);
        if (isMounted) {
          setRates(data.rates);
          setRateDate(data.date ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch rates in useCurrencyConversion:", error);
        // Silently handle failure as per requirements
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRates();
    return () => {
      isMounted = false;
    };
  }, [baseCurrency, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

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
    convert,
    refresh
  };
}
