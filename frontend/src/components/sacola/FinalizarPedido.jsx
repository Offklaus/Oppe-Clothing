import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { criarPedido, novaChavePedido } from '../../api/client.js';
import { useLoja } from '../../context/LojaContext.jsx';
import { useSacola } from '../../context/SacolaContext.jsx';
import Estrela from '../ui/Estrela.jsx';

const VAZIO = { nome: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
const ORDEM_CAMPOS = Object.keys(VAZIO);

/**
 * Etapa "seus dados": nome, contato e endereço de entrega.
 * Quem valida e normaliza é o servidor; aqui só mostramos o erro de cada campo.
 */
export default function FinalizarPedido({ itens, previa, onVoltar, onCriado }) {
  const id = useId();
  const { loja } = useLoja();
  const { rascunho, setRascunho } = useSacola();
  // volta com o que o cliente já tinha digitado se a gaveta foi fechada no meio
  const [form, setForm] = useState(() => ({ ...VAZIO, ...(rascunho ?? {}) }));
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  // uma chave por tentativa de finalizar: clique duplo (ou repetir após falha de rede) cai no mesmo pedido
  const [chave] = useState(novaChavePedido);
  const refForm = useRef(null);

  useEffect(() => { setRascunho(form); }, [form, setRascunho]);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // leva o foco ao primeiro campo com problema
  useEffect(() => {
    const primeiro = ORDEM_CAMPOS.find((c) => erros[c]);
    if (primeiro) refForm.current?.querySelector(`[name="${primeiro}"]`)?.focus();
  }, [erros]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErros({});
    setMensagem('');
    try {
      onCriado(await criarPedido({ chave, itens, cliente: form }));
    } catch (falha) {
      // erro de um campo do formulário fica no campo; qualquer outro (peças, chave…) aparece por extenso
      const doFormulario = {};
      const outros = [];
      for (const [campo, texto] of Object.entries(falha.campos ?? {})) {
        const nome = campo.startsWith('cliente.') ? campo.slice('cliente.'.length) : null;
        if (nome && ORDEM_CAMPOS.includes(nome)) doFormulario[nome] = texto;
        else outros.push(texto);
      }
      setErros(doFormulario);
      if (outros.length) setMensagem(outros.join(' '));
      else setMensagem(Object.keys(doFormulario).length ? 'Confira os campos destacados.' : falha.message);
    } finally {
      setEnviando(false);
    }
  }

  const campo = (nome, rotulo, props = {}) => (
    <Campo id={`${id}-${nome}`} name={nome} rotulo={rotulo} value={form[nome]} onChange={mudar(nome)} erro={erros[nome]} {...props} />
  );

  return (
    <form ref={refForm} className="bag__form" onSubmit={enviar} noValidate>
      <div className="bag__body">
        <p className="bag__note bag__intro">
          Preencha para a gente separar e entregar seu pedido. Depois você envia a mensagem pronta no WhatsApp.
        </p>
        {mensagem && <p className="bag__alerta" role="alert">{mensagem}</p>}

        {previa?.itens.length > 0 && (
          <section className="bag__resumo" aria-labelledby={`${id}-resumo`}>
            <div className="bag__resumo-topo">
              <h3 id={`${id}-resumo`}>Seu pedido</h3>
              <button type="button" className="bag__clear" onClick={onVoltar}>Alterar</button>
            </div>
            <ul>
              {previa.itens.map((i) => (
                <li key={`${i.id}-${i.tamanho}`}>
                  <span>{i.qtd}x {i.nome} ({i.cor}) · Tam. {i.tamanho}</span>
                  <span>{i.precoTexto}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <fieldset className="bag__grupo">
          <legend>Seus dados</legend>
          {campo('nome', 'Nome completo', { autoComplete: 'name', maxLength: 80, required: true })}
          {campo('email', 'E-mail', { type: 'email', autoComplete: 'email', maxLength: 254, required: true })}
          {campo('telefone', 'WhatsApp', {
            type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 20, placeholder: '(35) 99999-9999', required: true
          })}
        </fieldset>

        <fieldset className="bag__grupo">
          <legend>Entrega</legend>
          {campo('cep', 'CEP', { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 9, placeholder: '00000-000', className: 'campo--curto', required: true })}
          <div className="bag__linha">
            {campo('logradouro', 'Rua', { autoComplete: 'address-line1', maxLength: 120, required: true })}
            {campo('numero', 'Número', { maxLength: 20, className: 'campo--curto', required: true })}
          </div>
          {campo('complemento', 'Complemento', { autoComplete: 'address-line2', maxLength: 80, opcional: true })}
          {campo('bairro', 'Bairro', { autoComplete: 'address-level3', maxLength: 80, required: true })}
          <div className="bag__linha">
            {campo('cidade', 'Cidade', { autoComplete: 'address-level2', maxLength: 80, required: true })}
            <Campo id={`${id}-uf`} name="uf" rotulo="Estado" erro={erros.uf} className="campo--curto">
              <select value={form.uf} onChange={mudar('uf')} autoComplete="address-level1" required>
                <option value="">UF</option>
                {(loja?.ufs ?? []).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </Campo>
          </div>
        </fieldset>

        <p className="bag__note">Seus dados ficam só com a Oppe Clothing e servem para combinar o pagamento e entregar o pedido.</p>
      </div>

      <div className="bag__foot">
        {previa && (
          <div className="bag__total">
            <span className="bag__total-label">{previa.rotuloPecas}</span>
            <span className="bag__total-value">{previa.totalTexto}</span>
          </div>
        )}
        <button type="submit" className="btn btn--dark btn--xl btn--block" disabled={enviando}>
          <Estrela tamanho={16} cor="#E01E14" />
          {enviando ? 'Confirmando…' : 'Confirmar pedido'}
        </button>
        <button type="button" className="bag__clear" onClick={onVoltar}>← Voltar à sacola</button>
      </div>
    </form>
  );
}

/** Campo com rótulo e o erro que veio do servidor (ligado ao campo para leitores de tela). */
function Campo({ id, name, rotulo, erro, opcional = false, className = '', children, ...props }) {
  const idErro = `${id}-erro`;
  const ligacao = { id, name, 'aria-invalid': erro ? true : undefined, 'aria-describedby': erro ? idErro : undefined };
  return (
    <div className={`campo${erro ? ' campo--erro' : ''} ${className}`.trim()}>
      <label htmlFor={id}>{rotulo}{opcional && <span className="campo__opcional"> (opcional)</span>}</label>
      {children ? cloneElement(children, ligacao) : <input type="text" {...props} {...ligacao} />}
      {erro && <span className="campo__erro" id={idErro}>{erro}</span>}
    </div>
  );
}
