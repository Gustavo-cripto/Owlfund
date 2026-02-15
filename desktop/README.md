## App desktop (macOS)

### Requisitos
- Node.js
- Xcode nao e necessario para o build do Electron
 - Uma conta Apple Developer (para assinar e notarizar)

### Instalar dependencias
```bash
cd /Users/Gustavo/Desktop/IA/next-shadcn-app/desktop
npm install
```

### Icone do app
1) Coloque um PNG em `desktop/assets/app-icon.png` (1024x1024).
2) Rode:
```bash
cd /Users/Gustavo/Desktop/IA/next-shadcn-app/desktop
./scripts/generate-icons.sh
```

### Gerar e abrir o app no Mac
Configure as variaveis de ambiente para assinatura e notarizacao:
```bash
export APPLE_ID="seu-email@icloud.com"
export APPLE_ID_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="SEU_TEAM_ID"
```

```bash
cd /Users/Gustavo/Desktop/IA/next-shadcn-app/desktop
npm run build:mac
```

O instalador vai aparecer em `desktop/dist/`.

### Atualizacoes automaticas
As atualizacoes usam um feed HTTP. Ajuste a URL em `desktop/package.json`:
```json
"publish": [
  { "provider": "generic", "url": "https://example.com/portfolio" }
]
```

Depois de cada build, envie o conteudo de `desktop/dist/` para essa URL.

### Rodar em modo dev
1) Em um terminal, rode o web do Expo:
```bash
cd /Users/Gustavo/Desktop/IA/next-shadcn-app/mobile
npm run web
```

2) Em outro terminal, rode o Electron apontando para o web:
```bash
cd /Users/Gustavo/Desktop/IA/next-shadcn-app/desktop
ELECTRON_START_URL=http://localhost:19006 npm run start
```
