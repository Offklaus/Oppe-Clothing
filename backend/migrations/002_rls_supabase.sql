-- O Supabase publica automaticamente as tabelas do schema "public" pela Data API (PostgREST),
-- acessível com as chaves do projeto. O site não usa essa API: tudo passa pelo nosso backend.
-- Por isso: RLS ligado em todas as tabelas, SEM nenhuma política. Assim a Data API não lê nem grava nada.
-- O backend continua funcionando porque conecta como dono das tabelas (o dono não é barrado pelo RLS).
-- Num Postgres comum (desenvolvimento) isso não muda nada.

ALTER TABLE usuarios_admin     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_admin      ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria          ENABLE ROW LEVEL SECURITY;
ALTER TABLE colecoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_imagens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations  ENABLE ROW LEVEL SECURITY;

-- No Supabase existem os papéis "anon" e "authenticated" da Data API: tira deles qualquer acesso.
DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
    END IF;
  END LOOP;
END $$;
