"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const [status, setStatus] = useState("Checking Supabase...");

  useEffect(() => {
    async function checkConnection() {
      const supabase = createClient();

      const { error } = await supabase.auth.getSession();

      if (error) {
        setStatus(`Supabase error: ${error.message}`);
        return;
      }

      setStatus("Supabase connection OK");
    }

    checkConnection();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">
          Supabase Dashboard Practice
        </h1>

        <p className="mt-4">
          {status}
        </p>
      </div>
    </main>
  );
}