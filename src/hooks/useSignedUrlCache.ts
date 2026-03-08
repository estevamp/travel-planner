import { useCallback, useRef, useState } from "react";
import { supabase } from "../supabase";

const SIGNED_URL_TTL_SECONDS = 3600;

export function useSignedUrlCache(bucket: string): {
  getSignedUrl: (path: string) => Promise<string>;
  cachedUrls: Record<string, string>;
  setCachedUrl: (path: string, url: string) => void;
} {
  const signedUrlCache = useRef<Map<string, string>>(new Map());
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({});

  const setCachedUrl = useCallback((path: string, url: string) => {
    signedUrlCache.current.set(path, url);
    setCachedUrls((prev) => {
      if (prev[path] === url) return prev;
      return { ...prev, [path]: url };
    });
  }, []);

  const getSignedUrl = useCallback(
    async (path: string) => {
      const cached = signedUrlCache.current.get(path);
      if (cached) {
        return cached;
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        throw error || new Error("Failed to generate signed URL");
      }

      setCachedUrl(path, data.signedUrl);
      return data.signedUrl;
    },
    [bucket, setCachedUrl]
  );

  return { getSignedUrl, cachedUrls, setCachedUrl };
}
