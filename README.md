# Meu Orçamento · JUREL

PWA React/Vite com Neon Auth, API Node e PostgreSQL Neon. É independente do MeuAtelie.

O login continua no Neon Auth. O servidor valida o JWT com as chaves públicas do Auth e consulta o PostgreSQL diretamente, conferindo `app_members` em cada leitura/gravação. A Data API não é mais utilizada: essa mudança evita a falha `jwk not found` reproduzida no serviço. As tabelas e contas existentes são preservadas.

## Ativar o Neon

1. No painel Neon, habilite **Neon Auth** (e-mail/senha). Configure os domínios permitidos para `http://127.0.0.1:5174` e a URL do deploy.
2. No arquivo `.env` da pasta MeuOrcamento, mantenha `VITE_NEON_AUTH_URL` e adicione `DATABASE_URL` com a connection string PostgreSQL fornecida por **Connect**, escolhendo a mesma branch/banco e o usuário proprietário do banco. A senha fica exclusivamente no servidor: nunca use `VITE_DATABASE_URL`. `.env.local`, se existir, tem prioridade sobre `.env`. `VITE_NEON_DATA_API_URL` não é mais necessária.
3. Somente em uma instalação nova, execute [neon/server-schema.sql](neon/server-schema.sql) no SQL Editor. Se você já executou o antigo `schema.sql`, não precisa executar outro script nem recriar tabelas.
4. Execute `npm install` e `npm run dev`. Abra `http://127.0.0.1:5174`, crie sua conta em **Criar conta** e confirme o e-mail se o Neon solicitar.
5. No SQL Editor, autorize sua conta substituindo o e-mail:

```sql
insert into public.app_members (user_id, role)
select id, 'Administrador' from neon_auth."user" where email = 'SEU_EMAIL_AQUI'
on conflict (user_id) do update set role = excluded.role;
```

Se a consulta afetar zero linhas, a conta ainda não foi criada/confirmada nessa branch. Faça login e toque em **Atualizar**. Não autorize contas desconhecidas.

## Migrar o backup local

Depois de autorizar o acesso, vá a **Configurações → Importar backup para o Neon** e escolha o JSON exportado anteriormente. A importação **substitui** os dados atuais do Neon para todos os aparelhos. Os hashes de senha locais são descartados; cada pessoa deve criar a própria conta no Neon Auth. Revise clientes, produtos, numeração e faturamentos após importar. Preserve o arquivo de backup original.

O antigo arquivo `src/clients-seed.json` não é mais incluído no bundle nem usado como dados iniciais. Ele permanece apenas no seu computador, ignorado pelo Git. Os produtos e condições padrão aparecem quando o Neon ainda está vazio.

## Uso em vários aparelhos

Todos os usuários autorizados em `app_members` compartilham os mesmos clientes, produtos, orçamentos, condições e configurações. As gravações usam controle de versão e repetem a operação em caso de alteração simultânea, evitando números duplicados. Atualize a página para ver alterações feitas em outros aparelhos. É necessária conexão com a internet; o app não grava alterações offline.

## Gerenciar usuários

Entre como administrador e abra **Configurações → Usuários**. Não é necessário executar outro SQL para esta funcionalidade.

- **Novo usuário**: informe nome, e-mail, senha inicial (8–128 caracteres) e perfil. O servidor cria a conta no Neon Auth e autoriza o acesso, sem trocar a sessão do administrador. Entregue as credenciais por um canal seguro; não as inclua em backups. O Neon pode exigir confirmação de e-mail.
- **Contas existentes**: quem se cadastrar na tela de login aparece na lista como **Sem acesso**. Selecione perfil e **Autorizado**, depois **Salvar acesso**.
- **Perfis**: somente administradores podem listar e gerenciar contas, com validação no servidor. Representantes e administradores continuam compartilhando e editando os dados comerciais, incluindo configurações e backup; não há separação de carteiras por representante.
- **Bloquear ou reativar**: altere o acesso e salve. O bloqueio impede novas leituras/gravações mesmo com uma sessão ainda válida, mas não apaga dados já exibidos em outro aparelho, a identidade no Neon ou o histórico de orçamentos. Não é uma exclusão permanente da conta.
- O próprio administrador não pode alterar seu perfil ou bloquear a si mesmo. Alterações de permissões são serializadas no banco para proteger o acesso administrativo.
- Se o cadastro criar a identidade, mas falhar ao autorizar, use **Atualizar lista** e autorize a conta existente. Não repita a criação. Nome/e-mail e redefinição de senha não são editados por esta tela.

O gerenciamento usa `app_members` como fonte de autorização; campos de perfil em backups não concedem privilégios. Nenhuma senha é gravada em `app_state`. As senhas são geridas pelo Neon Auth.

## Deploy

Passo a passo completo: [DEPLOY-RENDER.md](DEPLOY-RENDER.md). O projeto inclui
`render.yaml` sem credenciais e `.node-version` com Node 22.

No Render, crie um **Web Service** com runtime Node e Root Directory `MeuOrcamento` (deixe vazio se o repositório contiver somente este projeto). Use:

- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Variáveis: `VITE_NEON_AUTH_URL` e `DATABASE_URL`.
- Health Check Path: `/api/health`.

O servidor entrega o frontend de `dist` e a API no mesmo domínio. Cadastre o domínio final em Neon Auth → Domains. O app agora exige um servidor Node; publicar apenas `dist` como site estático não disponibiliza a API. Não envie `.env` ou `.env.local` ao Git.

Para desenvolvimento, `npm run dev` inicia frontend e API juntos na porta fixa 5174. Para testar o build, pare o servidor de desenvolvimento, execute `npm run build` e depois `npm start`. O comando `vite preview` serve apenas o frontend.

## Funcionalidades

Clientes, produtos, condições de pagamento, orçamentos numerados, PDF A4, faturamento manual por parcela, comissões sobre valores faturados, financeiro e backup JSON. Confira os preços históricos sinalizados para revisão antes de enviar propostas.
