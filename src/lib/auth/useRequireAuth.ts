"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function useRequireAuth(redirectTo: string = "/login") {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!isMounted) return;

      if (!user) {
        window.location.href = redirectTo;
        return;
      }

      setUserId(user.id);
      setIsLoading(false);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [redirectTo, supabase]);

  return { isLoading, userId };
}

