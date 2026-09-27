# Emails de autenticação do Supabase, na língua do cliente

O Supabase tem UM modelo por tipo de email e não sabe a língua do utilizador.
A app resolve isso assim: o URL de destino de cada email (`redirectTo`) é fixo
por língua, e o modelo compara-o com `{{ if eq .RedirectTo "…" }}`.

| Língua | Ligação mágica / confirmação (`redirectTo`) | Repor palavra-passe |
|---|---|---|
| pt (por omissão) | `https://chainfolioai.com/api/auth/callback?lang=pt` | `https://chainfolioai.com/reset-password?lang=pt` |
| en | `https://chainfolioai.com/api/auth/callback?lang=en` | `https://chainfolioai.com/reset-password?lang=en` |
| es | `https://chainfolioai.com/api/auth/callback?lang=es` | `https://chainfolioai.com/reset-password?lang=es` |
| fr | `https://chainfolioai.com/api/auth/callback?lang=fr` | `https://chainfolioai.com/reset-password?lang=fr` |

Quem os constrói é `src/lib/auth/emailRedirect.ts`. O destino depois do login
(`next`) vai num cookie de 1 hora, lido pelo `/api/auth/callback` e pelo
`/api/auth/confirm`. Qualquer outro domínio (pré-visualizações `*.vercel.app`)
cai no ramo por omissão, em português.

## O link dentro do email: `token_hash`, não `ConfirmationURL` (set 2026)

Os modelos `magic-link.html` e `confirm-signup.html` já NÃO usam
`{{ .ConfirmationURL }}`. Esse URL leva `?code=` (fluxo PKCE) e só funciona no
browser que pediu o email — quem pedia a ligação no portátil e a abria no
telemóvel via sempre "link inválido". O botão aponta agora para

```
https://chainfolioai.com/api/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&lang=xx   (ligação mágica)
https://chainfolioai.com/api/auth/confirm?token_hash={{ .TokenHash }}&type=signup&lang=xx      (confirmação)
https://chainfolioai.com/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&lang=xx    (repor palavra-passe)
```

e a rota `src/app/api/auth/confirm/route.ts` chama `verifyOtp({ type, token_hash })`
no servidor — funciona em qualquer aparelho. O `lang=` de cada ramo do modelo é
o da língua desse ramo (o `.RedirectTo` continua a escolher o ramo) e fica no
cookie `cfa-lang`, para a app abrir logo nessa língua no aparelho novo.

Os modelos antigos ficam como referência com o sufixo `.pkce.html` — não os
colar. O `/api/auth/callback` mantém-se para o OAuth Google (e para emails
antigos ainda por abrir).

### Repor palavra-passe (lote G, set 2026)

`reset-password.html` passou também a `token_hash` (`type=recovery`). A rota
`/api/auth/confirm` faz o `verifyOtp` no servidor, cria a sessão e manda a
pessoa para `/reset-password?lang=xx`, com um cookie curto (`cfa-recovery`,
15 min, com o id do utilizador). A página só mostra o formulário de nova
palavra-passe quando esse cookie é do mesmo utilizador da sessão — uma sessão
normal não chega. Funciona em qualquer aparelho. Ver `src/lib/auth/recuperacao.ts`.

O modelo antigo fica em `reset-password.pkce.html` (não colar). A página
continua a aceitar o fluxo antigo (`?code=` e o evento `PASSWORD_RECOVERY`),
por isso os emails já enviados antes da troca continuam a funcionar — no
browser onde foram pedidos, como sempre.

## Onde colar (uma vez, projeto `owlfund`)

Supabase → Authentication → **Emails** → Templates:

| Template no Supabase | Assunto (`*.subject.txt`) | Corpo (`*.html`) |
|---|---|---|
| Magic Link | `magic-link.subject.txt` | `magic-link.html` |
| Confirm sign up | `confirm-signup.subject.txt` | `confirm-signup.html` |
| Reset Password | `reset-password.subject.txt` | `reset-password.html` (o novo, com `type=recovery`) |

Colar o conteúdo inteiro de cada ficheiro. O assunto também é um modelo Go, mas
tem um limite de **255 caracteres** no Supabase — por isso só distingue PT do
resto (o resto sai em inglês; o corpo sai sempre na língua certa). Guardar. Não é
preciso deploy: os modelos vivem no Supabase.

Confirmar também, em Authentication → **URL Configuration**, que
`https://chainfolioai.com/api/auth/confirm` não precisa de estar na lista de
redirect URLs (o link não passa pelo Supabase; só o `.RedirectTo` dos
callbacks acima é que tem de lá estar, como já estava).

Depois de colar o `reset-password.html` novo, testar uma vez: pedir "Esqueci-me
da palavra-passe" no portátil, abrir o email no telemóvel → tem de abrir o
formulário de nova palavra-passe (e não "link inválido").

Ainda em inglês (não usados pela app hoje): Invite user, Change Email Address,
Reauthentication.
