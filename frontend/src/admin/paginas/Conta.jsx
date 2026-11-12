import { useState } from 'react';
import { api } from '../api.js';
import { useSessao } from '../Sessao.jsx';
import Campo, { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const VAZIO = { senhaAtual: '', novaSenha: '', confirmacao: '' };

export default function Conta() {
  const { usuario } = useSessao();
  const [form, setForm] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErros({});
    setMensagem('');
    setAviso('');
    if (form.novaSenha !== form.confirmacao) {
      setErros({ confirmacao: 'As senhas não conferem.' });
      return;
    }
    setSalvando(true);
    try {
      await api.put('/conta/senha', { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha });
      setForm(VAZIO);
      setAviso('Senha alterada. Os outros aparelhos conectados foram desconectados.');
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho sobre={usuario.email.toUpperCase()} titulo="Minha conta" />
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem}</Alerta>
      <form className="adm-bloco" onSubmit={salvar} noValidate style={{ maxWidth: 560 }}>
        <h2 className="adm-subtitulo">Trocar senha</h2>
        <Campo rotulo="Senha atual" tipo="password" autoComplete="current-password" value={form.senhaAtual} onChange={mudar('senhaAtual')} erro={erros.senhaAtual} />
        <Campo rotulo="Nova senha" tipo="password" autoComplete="new-password" value={form.novaSenha} onChange={mudar('novaSenha')} erro={erros.novaSenha} ajuda="Mínimo de 12 caracteres. Uma frase fácil de lembrar funciona bem." />
        <Campo rotulo="Repita a nova senha" tipo="password" autoComplete="new-password" value={form.confirmacao} onChange={mudar('confirmacao')} erro={erros.confirmacao} />
        <div>
          <button type="submit" className="btn btn--dark btn--lg" disabled={salvando}>{salvando ? 'Salvando…' : 'Trocar senha'}</button>
        </div>
      </form>
    </>
  );
}
