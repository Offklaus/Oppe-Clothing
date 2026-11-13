-- O cliente informa nome, e-mail, telefone e endereço antes de abrir o WhatsApp, e consulta o pedido
-- pelo código na página "Acompanhar pedido". Para isso:
--   * código com 8 caracteres (32^8 combinações: não dá para adivinhar o código de outra pessoa);
--   * dados do cliente e da entrega no pedido (vistos só no painel, nunca na consulta pública);
--   * situações na ordem das etapas que o cliente vê: pagamento, preparação, envio e entrega;
--   * histórico com a data de cada mudança de situação.

-- situações: sai "em_conversa", entra "em_preparacao"
UPDATE pedidos SET status = 'novo' WHERE status = 'em_conversa';
ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('novo', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado'));

-- novos pedidos usam 8 caracteres; os de 6 (criados antes desta migração) continuam válidos
ALTER TABLE pedidos DROP CONSTRAINT pedidos_codigo_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_codigo_check
  CHECK (codigo ~ '^[2-9A-HJ-NP-Z]{6}$' OR codigo ~ '^[2-9A-HJ-NP-Z]{8}$');

-- dados do cliente (o campo livre de contato vira e-mail e telefone)
ALTER TABLE pedidos DROP COLUMN cliente_contato;
ALTER TABLE pedidos
  ADD COLUMN cliente_email       text NOT NULL DEFAULT '' CHECK (char_length(cliente_email) <= 254),
  ADD COLUMN cliente_telefone    text NOT NULL DEFAULT '' CHECK (cliente_telefone ~ '^([0-9]{12,13})?$'),
  ADD COLUMN entrega_cep         text NOT NULL DEFAULT '' CHECK (entrega_cep ~ '^([0-9]{8})?$'),
  ADD COLUMN entrega_logradouro  text NOT NULL DEFAULT '' CHECK (char_length(entrega_logradouro) <= 120),
  ADD COLUMN entrega_numero      text NOT NULL DEFAULT '' CHECK (char_length(entrega_numero) <= 20),
  ADD COLUMN entrega_complemento text NOT NULL DEFAULT '' CHECK (char_length(entrega_complemento) <= 80),
  ADD COLUMN entrega_bairro      text NOT NULL DEFAULT '' CHECK (char_length(entrega_bairro) <= 80),
  ADD COLUMN entrega_cidade      text NOT NULL DEFAULT '' CHECK (char_length(entrega_cidade) <= 80),
  ADD COLUMN entrega_uf          text NOT NULL DEFAULT '' CHECK (entrega_uf ~ '^([A-Z]{2})?$'),
  -- código de rastreio da transportadora, mostrado ao cliente quando o pedido é enviado
  ADD COLUMN codigo_rastreio     text NOT NULL DEFAULT '' CHECK (char_length(codigo_rastreio) <= 60);

-- histórico de situações (datas da linha do tempo do cliente)
CREATE TABLE pedido_eventos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id  integer NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('novo', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado')),
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedido_eventos_pedido_idx ON pedido_eventos (pedido_id, criado_em);
INSERT INTO pedido_eventos (pedido_id, status, criado_em) SELECT id, status, criado_em FROM pedidos;

-- mesma regra da 002: a Data API do Supabase (anon/authenticated) não lê nem grava
ALTER TABLE pedido_eventos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON pedido_eventos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON SEQUENCE pedido_eventos_id_seq FROM %I', papel);
    END IF;
  END LOOP;
END $$;
