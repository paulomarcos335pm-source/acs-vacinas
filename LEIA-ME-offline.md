# ACS Vacinas Offline

Arquivos principais:
- `acs-vacinas-offline.html`: app atualizado com IndexedDB local.
- `manifest.webmanifest`, `sw.js` e `icon.svg`: suporte para instalar como PWA quando hospedado.

## Como testar

Abra `acs-vacinas-offline.html` no navegador. Cadastre um paciente, entre em `Visitas`, registre uma visita e selecione uma foto. Os dados ficam no banco local do navegador do aparelho.

## No celular

Para capturar foto, use a tela `Visitas` e o campo `Foto da visita`.

Para funcionar como app instalável e abrir offline depois, hospede a pasta `outputs` em um endereço HTTPS e abra `acs-vacinas-offline.html` pelo celular. Depois use a opção do navegador para adicionar à tela inicial.

Observação: abrindo direto como arquivo (`file://`), o banco local funciona, mas o service worker do modo instalável não é ativado por regra dos navegadores.

## Backup

Use o botão `Backup` no topo do app para baixar um JSON com os registros e fotos convertidas em texto base64.
