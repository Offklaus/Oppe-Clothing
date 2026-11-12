import { useState } from 'react';
import { useSessao } from '../Sessao.jsx';
import Campo, { Alerta } from '../componentes/Campo.jsx';
import logoPreto from '../../assets/logo-preto.png';

export default function Login() {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      await entrar(email, senha);
    } catch (falha) {
      setErro(falha.message);
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="adm-login">
      <form className="adm-login__caixa" onSubmit={enviar} noValidate>
        <img className="adm-login__logo" src={logoPreto} alt="Oppe Clothing" width="564" height="447" />
        <h1 className="adm-titulo">Painel</h1>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="E-mail" tipo="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Senha" tipo="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        <button type="submit" className="btn btn--dark btn--lg btn--block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <a className="adm-login__voltar" href="/">← Voltar ao site</a>
      </form>
    </div>
  );
}
