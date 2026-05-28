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

## Limites intencionais da V1

- Sem persistencia de segredos em disco.
- Sem multiplas sessoes SSH simultaneas.
- Sem suporte a comandos interativos como nano, vim ou top.
- Triggers com sudo so executam quando a sessao remota e root ou aceita sudo sem prompt.

## Scripts

- npm run cli
- npm run build
- npm test