# Emails de autenticação do Supabase, na língua do cliente

O Supabase tem UM modelo por tipo de email e não sabe a língua do utilizador.
A app resolve isso assim: o URL de destino de cada email (`redirectTo`) é fixo
por língua, e o modelo compara-o com `{{ if eq .RedirectTo "…" }}`.

| Língua | Ligação mágica / confirmação | Repor palavra-passe |
|---|---|---|
| pt (por omissão) | `https://chainfolioai.com/api/auth/callback?lang=pt` | `https://chainfolioai.com/reset-password?lang=pt` |
| en | `https://chainfolioai.com/api/auth/callback?lang=en` | `https://chainfolioai.com/reset-password?lang=en` |
| es | `https://chainfolioai.com/api/auth/callback?lang=es` | `https://chainfolioai.com/reset-password?lang=es` |
| fr | `https://chainfolioai.com/api/auth/callback?lang=fr` | `https://chainfolioai.com/reset-password?lang=fr` |

Quem os constrói é `src/lib/auth/emailRedirect.ts`. O destino depois do login
(`next`) vai num cookie de 1 hora, lido pelo `/api/auth/callback`. Qualquer outro
domínio (pré-visualizações `*.vercel.app`) cai no ramo por omissão, em português.

## Onde colar (uma vez, projeto `owlfund`)

Supabase → Authentication → **Emails** → Templates:

| Template no Supabase | Assunto (`*.subject.txt`) | Corpo (`*.html`) |
|---|---|---|
| Magic Link | `magic-link.subject.txt` | `magic-link.html` |
| Confirm sign up | `confirm-signup.subject.txt` | `confirm-signup.html` |
| Reset Password | `reset-password.subject.txt` | `reset-password.html` |

Colar o conteúdo inteiro de cada ficheiro (o assunto também é um modelo Go e
aceita o `{{ if … }}`). Guardar. Não é preciso deploy: os modelos vivem no
Supabase.

Ainda em inglês (não usados pela app hoje): Invite user, Change Email Address,
Reauthentication.
