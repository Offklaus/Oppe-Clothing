import { useEffect } from 'react';
import { Link } from 'react-router';
import { useLoja } from '../context/LojaContext.jsx';
import { LINK_CONTATO_WHATSAPP } from '../api/client.js';
import '../components/privacidade/Privacidade.css';

const ATUALIZADA_EM = '17 de novembro de 2026';

export default function PrivacidadePage() {
  const { loja } = useLoja();

  useEffect(() => { document.title = 'Política de privacidade — Oppe Clothing'; }, []);

  const whatsapp = (
    <a href={LINK_CONTATO_WHATSAPP} target="_blank" rel="noopener">
      WhatsApp{loja?.whatsappExibicao ? ` ${loja.whatsappExibicao}` : ''}
    </a>
  );

  return (
    <article className="container privacidade">
      <header className="privacidade__topo">
        <span className="eyebrow">PRIVACIDADE ✦ LGPD</span>
        <h1 className="display privacidade__titulo">Política de privacidade</h1>
        <p className="serif privacidade__intro">Seus dados servem para uma coisa: o seu pedido chegar até você.</p>
      </header>

      <section>
        <h2>Quem cuida dos seus dados</h2>
        <p>
          A Oppe Clothing é a responsável pelos dados informados neste site. Para qualquer assunto sobre eles,
          fale com a gente pelo {whatsapp}
          {loja?.instagram && <> ou no Instagram <a href={loja.instagram.url} target="_blank" rel="noopener">{loja.instagram.usuario}</a></>}.
        </p>
      </section>

      <section>
        <h2>O que coletamos</h2>
        <p>
          Quando você finaliza um pedido: <strong>nome, e-mail, WhatsApp e endereço de entrega</strong>, junto com as
          peças escolhidas. Não pedimos CPF, senha nem dados de cartão — o pagamento é combinado direto com a loja,
          pelo WhatsApp.
        </p>
      </section>

      <section>
        <h2>Para que usamos</h2>
        <p>
          Para separar e entregar o seu pedido, combinar pagamento e frete e falar com você sobre ele (base legal:
          execução do pedido, LGPD art. 7º, V). Não vendemos seus dados e não os usamos para propaganda.
        </p>
      </section>

      <section>
        <h2>Com quem compartilhamos</h2>
        <p>
          Só o necessário: a transportadora ou os Correios recebem nome e endereço para fazer a entrega. Os dados ficam
          guardados com os fornecedores que mantêm o site no ar (hospedagem e banco de dados), que não podem usá-los
          para outros fins.
        </p>
      </section>

      <section>
        <h2>Acompanhar pedido</h2>
        <p>
          Quem tem o código do pedido vê só o andamento, as peças e o total — nunca o seu nome, contato ou endereço.
          Mesmo assim, guarde o código com você.
        </p>
      </section>

      <section>
        <h2>No seu navegador</h2>
        <p>
          Não usamos cookies de propaganda nem ferramentas de rastreamento. O navegador guarda só a sua sacola e o
          código do último pedido (este some quando você fecha a aba). As fontes do site são carregadas de um serviço
          externo, que recebe o endereço de IP de quem visita. Registros técnicos do servidor, como o IP, podem ficar
          guardados por pouco tempo, por segurança.
        </p>
      </section>

      <section>
        <h2>Por quanto tempo guardamos</h2>
        <p>
          Enquanto for preciso para atender o pedido, trocas e obrigações legais, como as fiscais. Quando você pedir, ou
          quando não forem mais necessários, apagamos seus dados pessoais do pedido: fica só o registro das peças, do
          valor e das datas.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir para ver, corrigir ou apagar seus dados e saber com quem foram compartilhados (LGPD, art. 18).
          É só chamar no {whatsapp}: respondemos em até 15 dias.
        </p>
      </section>

      <section>
        <h2>Segurança</h2>
        <p>
          O site usa conexão segura (HTTPS), o painel da loja tem acesso restrito por senha e os dados ficam num banco
          protegido, sem acesso público.
        </p>
      </section>

      <footer className="privacidade__rodape">
        <span>Última atualização: {ATUALIZADA_EM}.</span>
        <Link className="btn btn--dark btn--lg" to="/#catalogo">Voltar ao catálogo</Link>
      </footer>
    </article>
  );
}
