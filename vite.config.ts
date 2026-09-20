import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const firstHttpUrl = (values: Array<string | undefined>) =>
  values.find((value) => {
    if (!value) return false;

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }) ?? "";

const firstPublicKey = (values: Array<string | undefined>) =>
  values.find((value) => Boolean(value?.trim()))?.trim() ?? "";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = firstHttpUrl([
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.VITE_SUPABASE_URL
  ]);
  const supabaseAnonKey = firstPublicKey([
    env.SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_ANON_KEY
  ]);

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      sourcemap: true
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey)
    }
  };
});
