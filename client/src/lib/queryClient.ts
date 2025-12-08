import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { useAuthStore, refreshAccessToken } from "./auth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const body = await res.text();
    let message = res.statusText;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || res.statusText;
    } catch {
      message = body || res.statusText;
    }
    throw new Error(message);
  }
}

function getAuthHeaders(): HeadersInit {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };
  }
  return { "Content-Type": "application/json" };
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...getAuthHeaders(), ...options.headers };
  let response = await fetch(url, { ...options, headers, credentials: "include" });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = {
        ...options.headers,
        "Content-Type": "application/json",
        "Authorization": `Bearer ${newToken}`,
      };
      response = await fetch(url, { ...options, headers: retryHeaders, credentials: "include" });
    }
  }

  return response;
}

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: unknown
): Promise<T> {
  const res = await fetchWithAuth(url, {
    method,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const res = await fetchWithAuth(url, {
      method: "GET",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes("401")) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
