# Configurar saldo por endereço (Cardano)

Para o saldo aparecer em carteiras Cardano adicionadas **por endereço** (sem conectar extensão), é preciso configurar a variável **`BLOCKFROST_PROJECT_ID`**.

---

## Passo 1 – Obter o Project ID

1. Abre [blockfrost.io](https://blockfrost.io).
2. Regista-te ou inicia sessão.
3. Cria um **novo projeto** (Add Project).
4. Escolhe **Cardano Mainnet**.
5. Copia o **Project ID** (começa por `mainnet...`).

---

## Passo 2 – Configurar no projeto

### Em local (desenvolvimento)

1. Na **raiz do projeto** (pasta `next-shadcn-app`), abre ou cria o ficheiro **`.env.local`**.
2. Adiciona uma linha com o teu Project ID:
   ```bash
   BLOCKFROST_PROJECT_ID=mainnetxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   (substitui pelo valor que copiaste)
3. Guarda o ficheiro.
4. **Reinicia o servidor** (para o Next.js carregar a variável):
   - Para o `npm run dev` (Ctrl+C).
   - Volta a correr: `npm run dev`.

### Na Vercel (produção)

1. Abre o teu projeto no [Vercel Dashboard](https://vercel.com).
2. Clica em **Settings** (Definições).
3. No menu da esquerda, escolhe **Environment Variables**.
4. Clica em **Add New** (ou **Add**).
5. Em **Name** escreve: `BLOCKFROST_PROJECT_ID`.
6. Em **Value** cola o teu Project ID do Blockfrost.
7. Escolhe os ambientes (Production, Preview, Development) conforme quiseres.
8. Clica em **Save**.
9. Faz um **novo deploy** (Deployments → ⋮ no último deploy → Redeploy, ou push de um commit).

---

## Passo 3 – Verificar na app

1. Abre a página **Carteiras**.
2. Na secção Cardano, carrega em **"Tentar novamente"** na carteira que mostrava o erro.
3. O saldo deve carregar; se continuar a dar erro, confirma que o Project ID está correto e que reiniciaste o servidor / fizeste redeploy.

---

**Nota:** O ficheiro `.env.local` não é enviado para o Git (está no `.gitignore`). Na Vercel as variáveis são configuradas apenas no dashboard.
