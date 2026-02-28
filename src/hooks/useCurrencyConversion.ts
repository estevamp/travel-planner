import { useState, useEffect, useCallback } from "react";
import { currencyService } from "../services/currencyService";

interface UseCurrencyConversionReturn {
  rates: Record<string, number>;      // taxas brutas indexadas por código de moeda
  isLoading: boolean;                 // true enquanto faz o primeiro fetch
  convert: (amount: number, fromCurrency: string) => number; // converte para baseCurrency
}

export function useCurrencyConversion(baseCurrency: string): UseCurrencyConversionReturn {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchRates = async () => {
      setIsLoading(true);
      try {
        const data = await currencyService.getExchangeRates(baseCurrency);
        if (isMounted) {
          setRates(data.rates);
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
  }, [baseCurrency]);

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
    isLoading,
    convert
  };
}
