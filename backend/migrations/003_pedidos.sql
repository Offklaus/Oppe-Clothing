-- Pedidos enviados pelo site. O registro nasce quando o cliente toca em "Enviar pedido" e o WhatsApp abre;
-- o site não sabe se a mensagem foi mesmo enviada, então todo pedido começa como "novo" e a loja atualiza.
-- Dados do cliente (nome, contato) só existem se a loja preencher no painel. IP não é guardado.

CREATE TABLE pedidos (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- código que vai na mensagem do WhatsApp, para a loja achar o pedido de cada conversa
  codigo          text NOT NULL UNIQUE CHECK (codigo ~ '^[2-9A-HJ-NP-Z]{6}$'),
  -- gerada pelo site a cada sacola: repetir o link (clique duplo, "abrir de novo") não cria outro pedido
  chave           uuid NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'novo'
                  CHECK (status IN ('novo', 'em_conversa', 'pago', 'enviado', 'entregue', 'cancelado')),
  pecas           integer NOT NULL CHECK (pecas > 0),
  total_centavos  bigint CHECK (total_centavos >= 0),          -- NULL = alguma peça sem preço ("a combinar")
  mensagem        text NOT NULL CHECK (char_length(mensagem) <= 20000),
  cliente_nome    text NOT NULL DEFAULT '' CHECK (char_length(cliente_nome) <= 80),
  cliente_contato text NOT NULL DEFAULT '' CHECK (char_length(cliente_contato) <= 80),
  observacao      text NOT NULL DEFAULT '' CHECK (char_length(observacao) <= 1000),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_criado_em_idx ON pedidos (criado_em DESC, id DESC);
CREATE INDEX pedidos_status_idx ON pedidos (status, criado_em DESC);

-- cópia de cada peça como estava no momento do pedido (nome, cor e preço podem mudar depois)
CREATE TABLE pedido_itens (
  pedido_id       integer NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  posicao         smallint NOT NULL CHECK (posicao >= 0),
  produto_id      integer REFERENCES produtos (id) ON DELETE SET NULL,
  slug            text NOT NULL CHECK (char_length(slug) <= 80),
  nome            text NOT NULL CHECK (char_length(nome) <= 80),
  cor             text NOT NULL CHECK (char_length(cor) <= 60),
  tamanho         text NOT NULL CHECK (char_length(tamanho) <= 8),
  qtd             integer NOT NULL CHECK (qtd BETWEEN 1 AND 99),
  preco_centavos  integer CHECK (preco_centavos >= 0),         -- preço unitário na hora; NULL = sob consulta
  PRIMARY KEY (pedido_id, posicao)
);
CREATE INDEX pedido_itens_produto_idx ON pedido_itens (produto_id);

-- mesma regra da 002: no Supabase, a Data API (anon/authenticated) não lê nem grava estas tabelas
ALTER TABLE pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON pedidos, pedido_itens FROM %I', papel);
      EXECUTE format('REVOKE ALL ON SEQUENCE pedidos_id_seq FROM %I', papel);
    END IF;
  END LOOP;
END $$;
