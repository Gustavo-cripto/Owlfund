export default function Home() {
  const metrics = [
    { label: "Ativos monitorados", value: "120+" },
    { label: "Categorias personalizadas", value: "15" },
    { label: "Atualizações ao vivo", value: "1 min" },
  ];

  const features = [
    {
      title: "Resumo de mercado inteligente",
      description:
        "Tabela com variações 1h, 24h e 7d, sparklines e volume para decisões rápidas.",
    },
    {
      title: "Gestão simples de ativos",
      description:
        "Adicione, edite e organize investimentos por categoria sem perder o contexto.",
    },
    {
      title: "PNL claro e direto",
      description:
        "Visualize PNL da posição, do dia e média semanal com leitura imediata.",
    },
    {
      title: "Tema escuro premium",
      description:
        "Interface escura com destaque em laranja para foco total nos números.",
    },
  ];

  const steps = [
    {
      title: "Cadastre seus ativos",
      description: "Escolha categorias e registre o valor investido em segundos.",
    },
    {
      title: "Acompanhe o desempenho",
      description: "Veja evolução, variações e dados de mercado em um só lugar.",
    },
    {
      title: "Ajuste quando quiser",
      description: "Edite posições e mantenha seu portfólio sempre atualizado.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 text-lg font-semibold text-orange-400">
            PI
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-300/80">
              Portfolio Insight
            </p>
            <p className="text-sm text-slate-400">Controle inteligente de investimentos</p>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a className="transition hover:text-white" href="/wallets">
            Carteiras
          </a>
          <a className="transition hover:text-white" href="/portfolio">
            Portfolio
          </a>
          <a className="transition hover:text-white" href="/mercado">
            Mercado
          </a>
          <a className="transition hover:text-white" href="#recursos">
            Recursos
          </a>
          <a className="transition hover:text-white" href="#fluxo">
            Fluxo
          </a>
          <a className="transition hover:text-white" href="#contato">
            Contato
          </a>
        </nav>
        <a
          className="rounded-full border border-orange-400/40 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          href="#contato"
        >
          Solicitar demo
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 pt-8">
        <section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-300/80">
              Dashboard completo
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
              Organize seu portfólio com dados que fazem sentido.
            </h1>
            <p className="text-base text-slate-300 md:text-lg">
              Acompanhe variações, tendências e resultado real das suas posições com um
              painel focado em clareza e velocidade.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                className="rounded-full bg-orange-500 px-6 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                href="#contato"
              >
                Quero testar
              </a>
              <a
                className="rounded-full border border-orange-400/40 px-6 py-3 text-center text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                href="/wallets"
              >
                Carteiras
              </a>
              <a
                className="rounded-full border border-slate-700 px-6 py-3 text-center text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="/portfolio"
              >
                Portfolio
              </a>
              <a
                className="rounded-full border border-slate-700 px-6 py-3 text-center text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="/mercado"
              >
                Mercado
              </a>
              <a
                className="rounded-full border border-slate-700 px-6 py-3 text-center text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="#recursos"
              >
                Ver recursos
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 via-slate-900 to-slate-950 p-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Resumo</p>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">PNL da posição</p>
                  <p className="text-lg font-semibold text-emerald-400">+ € 2.150</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">PNL de hoje</p>
                  <p className="text-lg font-semibold text-orange-300">+ € 120</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">PNL diário (7 dias)</p>
                  <p className="text-lg font-semibold text-rose-300">- € 35</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center"
                  >
                    <p className="text-lg font-semibold text-white">{metric.value}</p>
                    <p className="text-[11px] text-slate-400">{metric.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="space-y-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
                Recursos principais
              </p>
              <h2 className="text-3xl font-semibold text-white">
                Tudo que você precisa para decisões rápidas
              </h2>
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Inspirado na experiência da aplicação mobile para dar contexto em segundos.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
              >
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="fluxo" className="grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
                Passo {index + 1}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{step.description}</p>
            </div>
          ))}
        </section>
      </main>

      <footer
        id="contato"
        className="border-t border-slate-900 bg-slate-950/60 py-12"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Vamos conversar?</p>
            <p className="text-sm text-slate-400">
              Envie uma mensagem para receber o acesso beta e o kit de marca.
            </p>
          </div>
          <a
            className="rounded-full bg-orange-500 px-6 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
            href="mailto:contato@portfolioinsight.com"
          >
            contato@portfolioinsight.com
          </a>
        </div>
      </footer>
    </div>
  );
}
