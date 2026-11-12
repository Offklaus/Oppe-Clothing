# Oppe Clothing — catálogo e painel

Site-catálogo da Oppe Clothing. O cliente escolhe a peça e o tamanho e o pedido abre no WhatsApp da loja.
A loja gerencia tudo pelo painel em `/admin`: coleções, peças e fotos, preços, textos, WhatsApp, Instagram, tabela de medidas e admins.

```
Oppe Clothing/
├── frontend/   Vite + React — só exibe o que a API manda
│   └── src/
│       ├── components/   site público (layout, home, produto, sacola, ui)
│       ├── pages/        Home, ProdutoPage, NaoEncontrado
│       └── admin/        painel (carregado só em /admin)
└── backend/    Express + PostgreSQL — todas as regras de negócio
    ├── migrations/   esquema do banco (SQL)
    ├── seed/         catálogo inicial importado na primeira execução
    ├── public/images/  fotos (camisetas/ = originais, produtos/ = enviadas pelo painel)
    ├── src/
    │   ├── rotas/       publico.js (site) e admin.js (painel)
    │   ├── servicos/    regras: catálogo, pedido, fotos, login
    │   ├── repos/       SQL (sempre parametrizado)
    │   ├── seguranca/   senha (Argon2id), sessão, CSRF, limites
    │   └── validacao/   esquemas de entrada (zod)
    └── test/        testes com banco de testes real
```

## Rodar no computador

Precisa do Node 22+ e do PostgreSQL. Na primeira vez:

```bash
npm install
```

```bash
npm run db:preparar
```

```bash
npm run admin:criar
```

O `admin:criar` pergunta e-mail, nome e senha (a senha não aparece na tela). Depois, para trabalhar:

```bash
npm run dev
```

- Site: http://localhost:5173
- Painel: http://localhost:5173/admin

```bash
npm test
```

## O que fica onde

| Coisa | Onde |
| --- | --- |
| Peças, coleções, preços, fotos, textos, WhatsApp, Instagram | Painel (`/admin`), gravado no banco |
| Conexão do banco, endereço do site, porta | `backend/.env` (modelo em `backend/.env.example`) |
| Esquema do banco | `backend/migrations/*.sql` (aplicado sozinho ao subir a API) |

## Segurança

- **Senhas:** hash Argon2id (64 MB, 3 iterações). A senha em texto nunca é gravada. Mínimo de 12 caracteres, com recusa de senhas comuns.
- **Login:**
  - mesma resposta para e-mail inexistente ou senha errada;
  - 5 erros bloqueiam a conta por 15 minutos;
  - limite de tentativas por IP (o `X-Forwarded-For` só é aceito com `TRUST_PROXY` definido, então não dá para inventar IP).
- **Sessão:**
  - cookie `httpOnly`, `SameSite=Strict` e `Secure` sempre que o site roda em HTTPS;
  - no banco fica só o hash do token;
  - expira com 2h parada ou 12h no total;
  - trocar a senha desconecta os outros aparelhos.
- **CSRF:** toda alteração exige o cabeçalho do painel e uma origem permitida.
- **Entradas:** todas validadas no servidor (campos desconhecidos são recusados). O SQL é sempre parametrizado.
- **Fotos:** só JPG, PNG ou WebP até 5 MB. Toda foto é reprocessada para WebP 1000×1000, sem metadados e com nome aleatório.
- **Cabeçalhos de segurança (helmet):** CSP, `frame-ancestors 'none'` e `nosniff`.
- **Auditoria:** cada ação do painel fica registrada em "Atividade", inclusive logins que falharam.
- **Banco:** a aplicação usa um usuário próprio, sem privilégios de superusuário.
- **Regras de negócio:** só no backend. O site e o painel apenas exibem o que a API devolve.

## Publicar

```bash
npm run build
```

```bash
npm start
```

O Express serve a API, as fotos e o site compilado num servidor só. Na hospedagem, defina:
- `NODE_ENV=production`;
- `DATABASE_URL`;
- `SITE_URL` (o domínio da loja);
- `TRUST_PROXY=1`, se houver proxy.

As fotos enviadas pelo painel ficam em `backend/public/images/produtos/`. Use um disco persistente.
