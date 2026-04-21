/**
 * Currency Service
 * Handles currency conversion using exchange rates from external API
 * Implements caching to minimize API calls
 */

interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface CacheEntry {
  rates: ExchangeRates;
  timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = 'currency_exchange_rates';
const API_URL = '/api/exchange-rates';
const SUPPORTED_CURRENCIES = ['USD', 'BRL', 'EUR', 'GBP', 'JPY'];

class CurrencyService {
  private cache: Map<string, CacheEntry> = new Map();

  constructor() {
    this.loadCacheFromStorage();
  }

  /**
   * Load cached rates from localStorage
   */
  private loadCacheFromStorage(): void {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.cache = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('Failed to load currency cache:', error);
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveCacheToStorage(): void {
    try {
      const cacheObj = Object.fromEntries(this.cache);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
    } catch (error) {
      console.error('Failed to save currency cache:', error);
    }
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(entry: CacheEntry, baseCurrency: string): boolean {
    const today = new Date().toISOString().split("T")[0];
    const isFreshByTime = Date.now() - entry.timestamp < CACHE_DURATION;
    const isSameApiDate = entry?.rates?.date === today;
    const hasBaseRate = Number(entry?.rates?.rates?.[baseCurrency]) > 0;
    return isFreshByTime && isSameApiDate && hasBaseRate;
  }

  /**
   * Get exchange rates for a base currency
   */
  async getExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRates> {
    const cacheKey = baseCurrency.toUpperCase();
    const cached = this.cache.get(cacheKey);

    // Return cached rates if valid
    if (cached && this.isCacheValid(cached, cacheKey)) {
      return cached.rates;
    }

    try {
      // Always fetch rates with USD as base (free tier limitation)
      // Then convert to requested currency if needed
      const apiBaseCurrency = 'USD';
      const targetCurrencies = SUPPORTED_CURRENCIES.filter((code) => code !== apiBaseCurrency).join(',');
      const params = new URLSearchParams({
        base_currency: apiBaseCurrency,
        currencies: targetCurrencies,
      });
      const response = await fetch(`${API_URL}?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data: ExchangeRates = await response.json();

      // Defensive check in case API/proxy returns malformed payload
      // Note: Some APIs might not return the base currency in the rates object
      if (!data?.rates || Object.keys(data.rates).length === 0) {
        throw new Error("Malformed exchange-rate payload: no rates found");
      }

      // If requested base currency is not USD, convert the rates
      let resultData = data;
      if (baseCurrency !== apiBaseCurrency) {
        const conversionRate = data.rates[cacheKey];
        if (!conversionRate || conversionRate <= 0) {
          throw new Error(`Cannot convert to ${cacheKey}: rate not available`);
        }
        // Convert all rates from USD base to requested currency base
        resultData = {
          base: cacheKey,
          date: data.date,
          rates: Object.fromEntries(
            Object.entries(data.rates).map(([currency, rate]) => [
              currency,
              (rate as number) / conversionRate,
            ])
          ),
        };
      }

      // Cache the result
      this.cache.set(cacheKey, { rates: resultData, timestamp: Date.now() });
      this.saveCacheToStorage();

      return resultData;
    } catch (error) {
      console.error("Failed to fetch exchange rates:", error);
      // If API call fails, try to return expired cache as fallback
      if (cached) {
        console.warn("Using expired cache as fallback");
        return cached.rates;
      }
      throw error;
    }
  }

  /**
   * Get default/fallback exchange rates
   */
  private getDefaultRates(baseCurrency: string): ExchangeRates {
    // Approximate rates as of 2024 (fallback only)
    const defaultRates: Record<string, Record<string, number>> = {
      USD: {
        USD: 1,
        BRL: 5.0,
        EUR: 0.92,
        GBP: 0.79,
        JPY: 149.0,
        ARS: 350.0,
        CLP: 900.0,
        PYG: 7300.0,
      },
      BRL: {
        USD: 0.20,
        BRL: 1,
        EUR: 0.18,
        GBP: 0.16,
        JPY: 29.8,
        ARS: 70.0,
        CLP: 180.0,
        PYG: 1460.0,
      },
      EUR: {
        USD: 1.09,
        BRL: 5.45,
        EUR: 1,
        GBP: 0.86,
        JPY: 162.0,
        ARS: 381.5,
        CLP: 981.0,
        PYG: 7957.0,
      },
    };

    const rates = defaultRates[baseCurrency] || defaultRates.USD;

    return {
      base: baseCurrency,
      date: new Date().toISOString().split('T')[0],
      rates,
    };
  }

  /**
   * Convert amount from one currency to another
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rates = await this.getExchangeRates(fromCurrency);
    const rate = rates.rates[toCurrency.toUpperCase()];

    if (!rate) {
      console.error(`Exchange rate not found for ${toCurrency}`);
      return amount; // Return original amount if rate not found
    }

    return amount * rate;
  }

  /**
   * Get exchange rate between two currencies
   */
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const rates = await this.getExchangeRates(fromCurrency);
    return rates.rates[toCurrency.toUpperCase()] || 1;
  }

  /**
   * Format currency value
   */
  formatCurrency(amount: number, currency: string, locale = "pt-BR"): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch (error) {
      // Fallback if currency code is invalid
      return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  /**
   * Clear cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cache.clear();
    localStorage.removeItem(CACHE_KEY);
  }
}

// Export singleton instance
export const currencyService = new CurrencyService();
export type { ExchangeRates };
