"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
 
 export default function AuthButton() {
   const supabase = createClient();
   const [isReady, setIsReady] = useState(false);
   const [isLoggedIn, setIsLoggedIn] = useState(false);
 
   useEffect(() => {
     let isMounted = true;
 
     supabase.auth.getSession().then(({ data }) => {
       if (!isMounted) return;
       setIsLoggedIn(!!data.session);
       setIsReady(true);
     });
 
     const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
       setIsLoggedIn(!!session);
     });
 
     return () => {
       isMounted = false;
       subscription.subscription.unsubscribe();
     };
   }, [supabase]);
 
   if (!isReady) {
     return (
       <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
         Carregando
       </span>
     );
   }
 
   if (isLoggedIn) {
     return (
       <a
         className="text-sm font-semibold text-slate-200 transition hover:text-white"
        href="/dashboard"
       >
        Dashboard
       </a>
     );
   }
 
   return (
     <a
       className="text-sm font-semibold text-slate-200 transition hover:text-white"
       href="/login"
     >
       Entrar
     </a>
   );
 }
