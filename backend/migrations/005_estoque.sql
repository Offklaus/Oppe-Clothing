-- Controle de estoque por tamanho.
--   * Cada peça escolhe se controla estoque. As que já existem começam SEM controle (vendem como antes),
--     até a loja ligar e informar as quantidades no painel.
--   * O pedido retira as peças do estoque ao ser criado; cancelar devolve; reativar retira de novo.
--   * Toda entrada e saída fica registrada (motivo, pedido, quem fez), para conferência.

ALTER TABLE produtos ADD COLUMN controla_estoque boolean NOT NULL DEFAULT false;

CREATE TABLE estoque (
  produto_id  integer NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  tamanho     text NOT NULL CHECK (char_length(tamanho) BETWEEN 1 AND 8),
  quantidade  integer NOT NULL DEFAULT 0 CHECK (quantidade BETWEEN 0 AND 99999),
  PRIMARY KEY (produto_id, tamanho)
);

-- a peça deste pedido saiu do estoque? (é o que volta se o pedido for cancelado)
ALTER TABLE pedido_itens ADD COLUMN reservado boolean NOT NULL DEFAULT false;

CREATE TABLE estoque_movimentos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id  integer NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  tamanho     text NOT NULL CHECK (char_length(tamanho) BETWEEN 1 AND 8),
  variacao    integer NOT NULL CHECK (variacao <> 0),
  saldo       integer NOT NULL CHECK (saldo >= 0),
  motivo      text NOT NULL CHECK (motivo IN ('ajuste', 'pedido', 'cancelamento', 'reativacao')),
  pedido_id   integer REFERENCES pedidos (id) ON DELETE SET NULL,
  usuario_id  uuid REFERENCES usuarios_admin (id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX estoque_movimentos_produto_idx ON estoque_movimentos (produto_id, criado_em DESC, id DESC);

-- mesma regra da 002: a Data API do Supabase (anon/authenticated) não lê nem grava
ALTER TABLE estoque            ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_movimentos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON estoque, estoque_movimentos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON SEQUENCE estoque_movimentos_id_seq FROM %I', papel);
    END IF;
  END LOOP;
END $$;
