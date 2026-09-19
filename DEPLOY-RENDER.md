# Publicar no Render

O Render executa o frontend e a API Node. Os dados continuam no Neon existente.
Use **Web Service**, não Static Site. Não é necessário executar o schema novamente.

## 1. Enviar ao GitHub

Crie um repositório **privado**, vazio, chamado `MeuOrcamento` no GitHub (sem README inicial).
No terminal, dentro da pasta MeuOrcamento:

```bash
git init -b main
git add .
git status --short
```

Antes do commit, confira os arquivos: NÃO devem aparecer `.env`, `.env.local`,
`node_modules`, `dist`, backups com dados de clientes ou `src/clients-seed.json`.
O `.gitignore` já exclui esses arquivos; `.env.example` pode ser enviado.
Nunca cole credenciais em comandos de commit ou na URL do repositório.

Depois da conferência:

```bash
git commit -m "Prepara MeuOrcamento para Render"
git remote add origin https://github.com/SEU_USUARIO/MeuOrcamento.git
git push -u origin main
```

Substitua SEU_USUARIO. O GitHub pode solicitar autenticação pelo navegador ou um token;
nunca use a senha do Neon. Se o repositório já estiver configurado, não repita `git init`
nem `git remote add`; use o remoto existente.

## 2. Criar o serviço

No Render: **New → Web Service**, conecte o GitHub e selecione o repositório privado.

| Campo | Valor |
| --- | --- |
| Runtime | Node |
| Branch | main |
| Root Directory | Vazio se package.json estiver na raiz do repositório |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free, se disponível e adequado às suas necessidades |
| Health Check Path | `/api/health` |

Se enviar a pasta MeuOrcamento dentro de um repositório maior, Root Directory será
`MeuOrcamento`. Não envie o projeto MeuAtelie por engano.

Alternativa: **New → Blueprint** usa o `render.yaml` incluído, preparado para um
repositório contendo somente o conteúdo de MeuOrcamento. Escolha apenas uma forma
de criação, para não duplicar serviços.

## 3. Variáveis de ambiente

Antes do primeiro deploy, adicione no painel do Render:

| Chave | Valor |
| --- | --- |
| VITE_NEON_AUTH_URL | O mesmo endereço completo do Neon Auth usado no `.env`, incluindo `/meuorcamento/auth` |
| DATABASE_URL | A mesma connection string PostgreSQL do `.env` |

Copie apenas os valores, sem aspas, e mantenha DATABASE_URL exclusivamente no servidor.
Não crie VITE_DATABASE_URL. Não envie o arquivo `.env` ao GitHub.
Não configure HOST=127.0.0.1: o servidor já escuta em 0.0.0.0 e usa PORT do Render.
O arquivo `.node-version` seleciona Node 22.

Clique **Deploy Web Service**. Aguarde o status **Live** e copie a URL HTTPS real.
Se mudar VITE_NEON_AUTH_URL depois, escolha **Save, rebuild, and deploy**: ela é
incorporada ao frontend durante a compilação.

## 4. Autorizar o domínio no Neon

No mesmo projeto/branch Neon usado localmente, abra **Settings → Auth → Domains**.
Adicione a origem HTTPS exata fornecida pelo Render, por exemplo:
`https://meu-orcamento-xxxx.onrender.com` (substitua pela URL real).
Não inclua caminhos como `/login` ou `/api`. Mantenha os domínios locais se continuar
desenvolvendo no Mac. Isso também permite o cadastro pela tela de usuários.

## 5. Conferir

1. Abra `https://SEU_DOMINIO/api/health`: deve retornar `{"configured":true}`.
   Esse teste verifica configuração; o login e a leitura a seguir validam a conexão.
2. Entre com a conta existente, sem criar outra nem executar o schema novamente.
3. Confira clientes, produtos e orçamentos. O banco é o mesmo: alterações locais e
   publicadas afetam os mesmos dados.
4. Abra Configurações → Usuários com uma conta administradora.
5. Confira a geração de um PDF e teste também no celular.
6. No Safari do iPhone, use Compartilhar → Adicionar à Tela de Início, se desejar.

O plano gratuito pode suspender o serviço após inatividade; a primeira abertura pode
demorar. Isso não transfere os dados do Neon para o disco temporário do Render.

## Atualizações

Depois de alterar e testar o código, faça commit e push. Com deploy automático
habilitado no Render, isso publica uma nova versão. Nunca use `npm run dev` como
Start Command em produção.

Documentação: https://render.com/docs/web-services e
https://render.com/docs/configure-environment-variables
