import { sugerirEmail } from "@/lib/auth/sugestaoEmail";
let fails = 0;
const eq = (name: string, got: string | null, want: string | null) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
eq("gmial.com", sugerirEmail("ana@gmial.com"), "ana@gmail.com");
eq("gmai1.com", sugerirEmail("ana@gmai1.com"), "ana@gmail.com");
eq("gmail.con", sugerirEmail("ana@gmail.con"), "ana@gmail.com");
eq("hotmai.com", sugerirEmail("Ana@Hotmai.com"), "ana@hotmail.com");
eq("hotmial.com", sugerirEmail("ana@hotmial.com"), "ana@hotmail.com");
eq("outlok.pt", sugerirEmail("ana@outlok.pt"), "ana@outlook.pt");
eq("gmail.com certo", sugerirEmail("ana@gmail.com"), null);
eq("mail.com existe", sugerirEmail("ana@mail.com"), null);
eq("me.com existe", sugerirEmail("ana@me.com"), null);
eq("domínio de empresa", sugerirEmail("ana@chainfolioai.com"), null);
eq("alias com +", sugerirEmail("ana+t2@gmial.com"), "ana+t2@gmail.com");
eq("incompleto", sugerirEmail("ana@"), null);
eq("sem @", sugerirEmail("ana"), null);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
