# @ismael1361/vps-manager

CLI em Node.js para subir um painel local em localhost e gerenciar VPS Linux por SSH com base em add-ons descritos em XML.

## Estado atual

Esta primeira implementacao entrega:

- CLI executavel via npx com bootstrap de servidor local.
- Painel web estatico servido pelo backend.
- Uma sessao SSH ativa por processo local.
- Leitura de add-ons do pacote e de ./addons no diretorio atual.
- Execucao sequencial de comandos com streaming via SSE.
- Bloqueio explicito de comandos interativos na V1.
- Preflight simples para detectar root e sudo sem senha.

## Uso local

```bash
npm install
npm run cli
```

Opcionalmente:

```bash
npm run cli -- --port 3010 --host 127.0.0.1 --no-open
```

## Modelo de add-on

O parser valida estritamente o schema abaixo:

```xml
<addon>
  <name>nginx</name>
  <version>1.0.0</version>
  <description>...</description>
  <triggers>
    <trigger event="install">
      <actions>
        <command>sudo apt update</command>
      </actions>
      <inputs>
        <input name="domain" type="text" placeholder="example.com" />
      </inputs>
    </trigger>
  </triggers>
</addon>
```

O loader aceita arquivos XML com extensao .xml e, por compatibilidade local, tambem arquivos XML sem extensao dentro da pasta addons.

## Runtime de views

As views de add-on agora sao executadas em um iframe filho compilado para HTML em blob.

- O iframe isola window, document, estilos e bibliotecas carregadas pela view.
- O script da view pode usar top-level await e imports ESM remotos, como imports via CDN.
- render, state, setState e getState existem apenas no escopo do iframe.
- executeTrigger e $super.* sao expostos por bridge via postMessage para o host.
- install, initialize e uninstall continuam executando no host, fora do iframe.

Na pratica, isso significa que a view pode usar APIs locais do navegador dentro do iframe, como document, alert e confirm, sem acessar diretamente o store ou o escopo global da aplicacao pai.

### APIs da view

- state: objeto de estado local da view.
- setState(key, valueOrUpdater): atualiza estado local e agenda rerender.
- getState(key, fallback): le estado local com fallback.
- render(): forca rerender imediato dentro do iframe.
- executeTrigger(name, inputs): chama triggers do add-on no host.
- $super.readConfig(), $super.updateConfig(), $super.notify(), $super.uninstall(), $super.requireAddon(): operacoes privilegiadas encaminhadas ao host.

## Limites intencionais da V1

- Sem persistencia de segredos em disco.
- Sem multiplas sessoes SSH simultaneas.
- Sem suporte a comandos interativos como nano, vim ou top.
- Triggers com sudo so executam quando a sessao remota e root ou aceita sudo sem prompt.

## Scripts

- npm run cli
- npm run build
- npm test