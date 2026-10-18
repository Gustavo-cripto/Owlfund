import { suspeitaNft } from "@/lib/nft/suspeito";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${String(got)}${ok ? "" : ` (esperado ${String(want)})`}`);
};
eq("convite a reclamar", suspeitaNft({ name: "Claim your $ETH reward", image: "x" }), "isco");
eq("domínio no nome", suspeitaNft({ name: "Visit uni-drop.xyz", image: "x" }), "isco");
eq("telegram", suspeitaNft({ name: "Join t.me/abc", image: "x" }), "isco");
eq("sem imagem nem metadados", suspeitaNft({ name: "Carol" }), "sem_dados");
eq("NFT normal", suspeitaNft({ name: "Bored Ape #123", image: "https://img" }), null);
eq("só tokenUri", suspeitaNft({ name: "Pudgy #9", tokenUri: "ipfs://x" }), null);
eq("palavra parecida não conta", suspeitaNft({ name: "Clarity", image: "x" }), null);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
