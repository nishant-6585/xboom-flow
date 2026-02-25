import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const applyTheme = (t: string) => {
  const root = document.documentElement;
  if (t === "dark") {
    root.classList.add("dark");
  } else if (t === "light") {
    root.classList.remove("dark");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
};

export function useThemeLoader() {
  useEffect(() => {
    // Try localStorage cache first for instant apply
    const cached = localStorage.getItem("xboom-theme");
    if (cached) applyTheme(cached);

    const loadTheme = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_settings")
        .select("theme")
        .eq("user_id", user.id)
        .maybeSingle();

      const theme = data?.theme || "light";
      localStorage.setItem("xboom-theme", theme);
      applyTheme(theme);
    };

    loadTheme();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") loadTheme();
      if (event === "SIGNED_OUT") {
        localStorage.removeItem("xboom-theme");
        applyTheme("light");
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
