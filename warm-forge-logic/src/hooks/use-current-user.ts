/**
 * useCurrentUser — shared hook
 *
 * Returns the currently authenticated user from the backend (GET /api/auth/me).
 * The Axios interceptor in api.ts attaches the JWT automatically.
 * A 401 response simply means the user is a guest — no redirect is triggered
 * because /auth/me is exempted in the api.ts 401 interceptor.
 *
 * Rules:
 *   - NEVER reads from localStorage or sessionStorage for user data.
 *   - The backend is the single source of truth for authentication state.
 *   - The JWT token itself stays in localStorage (standard practice, per arch rules).
 */
import { useState, useEffect } from "react";
import api from "@/lib/api";

export interface CurrentUser {
  _id: string;
  userId: string;
  username: string;
  name: string;
  role: "admin" | "staff" | "faculty" | "dean" | "user";
  encryptedIdeaKey?: string;
  passwordSalt?: string;
  studentId?: string;
  employee_id?: string;
  color?: string;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  loading: boolean;
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<CurrentUser>("/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        // 401 = guest or token expired — not an error, just unauthenticated
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
}
