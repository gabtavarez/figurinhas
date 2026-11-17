# Figurinhas

Web app de figurinhas para WhatsApp (iPhone) + app iOS leve que adiciona pacotes inteiros.

- Web: https://figurinhas-gabtavarez.vercel.app (Vercel, pasta `public/` + funções em `api/`)
- Acervo: diretório público signalstickers (CC BY-NC-SA 4.0), gerado no build por `build.mjs`
- `api/wa` entrega figurinhas no formato do WhatsApp (WebP 512×512 ≤100 KB, tray PNG 96×96)
- `ios/`: app SwiftUI com WKWebView + ponte `wa` que envia o pacote ao WhatsApp
  (pasteboard `net.whatsapp.third-party.sticker-pack` + `whatsapp://stickerPack`)

## Instalar o app no iPhone (sem Mac, grátis)
1. Baixe o `Figurinhas.ipa` da última release deste repositório.
2. No Windows, instale o Sideloadly e o iTunes/iCloud (versões do site da Apple, não da Microsoft Store).
3. Conecte o iPhone no cabo, arraste o `.ipa` no Sideloadly, entre com seu Apple ID e clique Start.
4. No iPhone: Ajustes → Geral → VPN e Gerenciamento de Dispositivo → confie no seu Apple ID.
   Em iOS 16+: Ajustes → Privacidade e Segurança → Modo de Desenvolvedor → ativar.
5. Com Apple ID gratuito o app expira em 7 dias: reabra o Sideloadly e reinstale (ou ative auto-refresh).

## Variáveis (Vercel)
- `TELEGRAM_BOT_TOKEN` (opcional): habilita importar pacotes do Telegram.
