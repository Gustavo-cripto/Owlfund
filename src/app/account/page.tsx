"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
 
 type SubscriptionStatus = {
   status: string;
   current_period_end: string | null;
 };
 
 export default function AccountPage() {
   const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
   const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     const load = async () => {
       const { data } = await supabase.auth.getUser();
       const user = data.user;
       if (!user) {
         window.location.href = "/login";
         return;
       }
 
      setEmail(user.email ?? null);
      setUserId(user.id);
 
       const { data: subData } = await supabase
         .from("subscriptions")
         .select("status, current_period_end")
         .eq("user_id", user.id)
         .order("current_period_end", { ascending: false })
         .limit(1)
         .maybeSingle();
 
       setSubscription(subData ?? null);
       setLoading(false);
     };
 
     load();
   }, [supabase]);
 
   const handleLogout = async () => {
     await supabase.auth.signOut();
     window.location.href = "/";
   };
 
   const handleManageBilling = async () => {
    if (!userId) return;
    const response = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
     const data = (await response.json()) as { url?: string };
     if (data.url) {
       window.location.href = data.url;
     }
   };
 
   return (
     <div className="min-h-screen bg-slate-950 text-slate-100">
       <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-20 pt-12">
         <a
           className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
           href="/"
         >
           Voltar para início
         </a>
         <div className="space-y-2">
           <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
             Conta
           </p>
           <h1 className="text-3xl font-semibold text-white">Minha conta</h1>
           <p className="text-sm text-slate-400">
             Gere o acesso ao plano e o seu portfólio.
           </p>
         </div>
 
         <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
           <div className="flex flex-col gap-3 text-sm text-slate-300">
             <p>Email: {email ?? "—"}</p>
             <p>
               Plano:{" "}
               {loading
                 ? "A carregar..."
                 : subscription?.status
                 ? subscription.status
                 : "Free"}
             </p>
           </div>
 
           <div className="mt-6 flex flex-col gap-3 sm:flex-row">
             <button
               className="rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
               onClick={handleManageBilling}
               type="button"
             >
               Gerir assinatura
             </button>
             <button
               className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
               onClick={handleLogout}
               type="button"
             >
               Sair
             </button>
           </div>
         </div>
       </main>
     </div>
   );
 }
