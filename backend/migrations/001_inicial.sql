-- Oppe Clothing — esquema inicial
-- Datas sempre em timestamptz (UTC). Dinheiro sempre em centavos (integer).

-- ---------- Administração ----------
CREATE TABLE usuarios_admin (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 80),
  email             text NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  -- só o hash Argon2id é guardado; a senha em texto nunca chega ao banco
  senha_hash        text NOT NULL CHECK (senha_hash LIKE '$argon2id$%'),
  ativo             boolean NOT NULL DEFAULT true,
  tentativas_falhas integer NOT NULL DEFAULT 0 CHECK (tentativas_falhas >= 0),
  bloqueado_ate     timestamptz,
  ultimo_login_em   timestamptz,
  senha_alterada_em timestamptz NOT NULL DEFAULT now(),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_admin_email_un ON usuarios_admin (email);

CREATE TABLE sessoes_admin (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios_admin (id) ON DELETE CASCADE,
  -- sha256 do token do cookie; o token em si nunca é guardado
  token_hash    bytea NOT NULL UNIQUE,
  criada_em     timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL,
  ip            inet,
  user_agent    text CHECK (char_length(user_agent) <= 300)
);
CREATE INDEX sessoes_admin_usuario_idx ON sessoes_admin (usuario_id);
CREATE INDEX sessoes_admin_expira_idx ON sessoes_admin (expira_em);

CREATE TABLE auditoria (
  id            bigserial PRIMARY KEY,
  usuario_id    uuid REFERENCES usuarios_admin (id) ON DELETE SET NULL,
  usuario_email text,
  acao          text NOT NULL,
  entidade      text NOT NULL,
  entidade_id   text,
  detalhes      jsonb,
  ip            inet,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_criado_idx ON auditoria (criado_em DESC);

-- ---------- Catálogo ----------
CREATE TABLE colecoes (
  id            serial PRIMARY KEY,
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  nome          text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 60),
  chamada       text NOT NULL DEFAULT '' CHECK (char_length(chamada) <= 80),
  frase         text NOT NULL DEFAULT '' CHECK (char_length(frase) <= 300),
  descricao     text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 300),
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativa         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX colecoes_nome_un ON colecoes (lower(nome));

CREATE TABLE produtos (
  id             serial PRIMARY KEY,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  nome           text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  cor            text NOT NULL CHECK (char_length(cor) BETWEEN 1 AND 60),
  descricao_cor  text NOT NULL DEFAULT '' CHECK (char_length(descricao_cor) <= 120),
  colecao_id     integer NOT NULL REFERENCES colecoes (id) ON DELETE RESTRICT,
  tag            text NOT NULL DEFAULT '' CHECK (char_length(tag) <= 20),
  preco_centavos integer CHECK (preco_centavos IS NULL OR preco_centavos BETWEEN 0 AND 10000000),
  frase          text NOT NULL DEFAULT '' CHECK (char_length(frase) <= 300),
  referencia     text NOT NULL DEFAULT '' CHECK (char_length(referencia) <= 60),
  estampa        text NOT NULL DEFAULT '' CHECK (char_length(estampa) <= 300),
  ativo          boolean NOT NULL DEFAULT true,
  ordem          integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX produtos_colecao_idx ON produtos (colecao_id);

-- posição 0 = foto principal, 1 = o outro lado
CREATE TABLE produto_imagens (
  produto_id integer NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  posicao    smallint NOT NULL CHECK (posicao IN (0, 1)),
  arquivo    text NOT NULL CHECK (arquivo ~ '^[a-z0-9_-]+/[a-z0-9_-]+\.webp$'),
  lado       text NOT NULL CHECK (lado IN ('Frente', 'Costas')),
  PRIMARY KEY (produto_id, posicao)
);
CREATE INDEX produto_imagens_arquivo_idx ON produto_imagens (arquivo);

-- ---------- Loja (linha única) ----------
CREATE TABLE configuracoes_loja (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  whatsapp_numero       text NOT NULL DEFAULT '' CHECK (whatsapp_numero ~ '^([0-9]{12,15})?$'),
  instagram             text NOT NULL DEFAULT '' CHECK (instagram ~ '^[a-z0-9._]{0,30}$'),
  preco_padrao_centavos integer CHECK (preco_padrao_centavos IS NULL OR preco_padrao_centavos BETWEEN 0 AND 10000000),
  tamanhos              text[] NOT NULL DEFAULT ARRAY['P', 'M', 'G', 'GG']
                        CHECK (cardinality(tamanhos) BETWEEN 1 AND 12),
  modelagem             text NOT NULL DEFAULT '' CHECK (char_length(modelagem) <= 200),
  malha                 text NOT NULL DEFAULT '' CHECK (char_length(malha) <= 200),
  tecnica_estampa       text NOT NULL DEFAULT '' CHECK (char_length(tecnica_estampa) <= 60),
  cuidados              text NOT NULL DEFAULT '' CHECK (char_length(cuidados) <= 200),
  sobre                 text NOT NULL DEFAULT '' CHECK (char_length(sobre) <= 600),
  medidas               jsonb NOT NULL DEFAULT '{"colunas": [], "linhas": []}',
  mensagens             jsonb NOT NULL DEFAULT '{}',
  destaque_produto_id   integer REFERENCES produtos (id) ON DELETE SET NULL,
  colecao_destaque_id   integer REFERENCES colecoes (id) ON DELETE SET NULL,
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);
