import { type ReactNode, useCallback, useMemo } from "react";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";

type UseAuth = () => { isLoading: boolean; user: unknown; getAccessToken: () => Promise<string | null> };

// From get-convex/templates template-react-vite-authkit: adapts AuthKit's useAuth to Convex.
export function ConvexProviderWithAuthKit({ children, client, useAuth }: {
  children: ReactNode; client: ConvexReactClient; useAuth: UseAuth;
}) {
  const useAuthFromWorkOS = useMemo(() => function useAuthFromWorkOS() {
    const { isLoading, user, getAccessToken } = useAuth();
    const fetchAccessToken = useCallback(async () => {
      try { return await getAccessToken(); } catch (error) { console.error("Error fetching WorkOS access token:", error); return null; }
    }, [getAccessToken]);
    return useMemo(() => ({ isLoading, isAuthenticated: !!user, fetchAccessToken }), [isLoading, user, fetchAccessToken]);
  }, [useAuth]);
  return <ConvexProviderWithAuth client={client} useAuth={useAuthFromWorkOS}>{children}</ConvexProviderWithAuth>;
}
