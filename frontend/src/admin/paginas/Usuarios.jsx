import { useState } from 'react';
import { api, useCarregar } from '../api.js';
import Campo, { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const NOVO = { nome: '', email: '', senha: '' };
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function Usuarios() {
  const { dados, erro, carregando, recarregar } = useCarregar('/usuarios');
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(NOVO);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [redefinindo, setRedefinindo] = useState(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [erroSenha, setErroSenha] = useState('');

  const limpar = () => { setMensagem(''); setAviso(''); setErros({}); };

  async function criar(e) {
    e.preventDefault();
    limpar();
    try {
      const u = await api.post('/usuarios', form);
      setAviso(`Admin ${u.email} cadastrado.`);
      setForm(NOVO);
      setCriando(false);
      recarregar();
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    }
  }

  async function alternar(u) {
    limpar();
    try {
      await api.put(`/usuarios/${u.id}`, { ativo: !u.ativo });
      setAviso(u.ativo ? `${u.email} foi desativado e desconectado.` : `${u.email} foi reativado.`);
      recarregar();
    } catch (falha) {
      setMensagem(falha.message);
    }
  }

  async function redefinir(e) {
    e.preventDefault();
    setErroSenha('');
    try {
      await api.put(`/usuarios/${redefinindo.id}/senha`, { novaSenha });
      setAviso(`Senha de ${redefinindo.email} redefinida. Passe a nova senha para a pessoa por um canal seguro.`);
      setRedefinindo(null);
      setNovaSenha('');
      recarregar();
    } catch (falha) {
      setErroSenha(falha.campos?.novaSenha ?? falha.message);
    }
  }

  return (
    <>
      <Cabecalho sobre="ACESSO" titulo="Admins">
        <button type="button" className="btn btn--dark" onClick={() => { limpar(); setCriando(true); }}>Novo admin</button>
      </Cabecalho>
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem || erro?.message}</Alerta>

      {criando && (
        <form className="adm-bloco" onSubmit={criar} noValidate>
          <h2 className="adm-subtitulo">Novo admin</h2>
          <div className="adm-grade adm-grade--3">
            <Campo rotulo="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} erro={erros.nome} autoComplete="off" />
            <Campo rotulo="E-mail" tipo="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} erro={erros.email} autoComplete="off" />
            <Campo rotulo="Senha inicial" tipo="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} erro={erros.senha} ajuda="Mínimo de 12 caracteres." autoComplete="new-password" />
          </div>
          <div className="adm-acoes">
            <button type="submit" className="btn btn--dark">Cadastrar</button>
            <button type="button" className="btn" onClick={() => setCriando(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {redefinindo && (
        <form className="adm-bloco" onSubmit={redefinir} noValidate>
          <h2 className="adm-subtitulo">Nova senha para {redefinindo.email}</h2>
          <p className="adm-texto">A pessoa é desconectada de todos os aparelhos.</p>
          <Campo rotulo="Nova senha" tipo="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} erro={erroSenha} autoComplete="new-password" />
          <div className="adm-acoes">
            <button type="submit" className="btn btn--dark">Redefinir senha</button>
            <button type="button" className="btn" onClick={() => setRedefinindo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && (
        <div className="adm-tabela-wrap">
          <table className="adm-tabela">
            <thead>
              <tr>
                <th scope="col">Admin</th>
                <th scope="col" className="adm-ocultar-celular">Último acesso</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.map((u) => (
                <tr key={u.id}>
                  <td className="adm-tabela__nome">{u.nome}{u.voce && ' (você)'}<small>{u.email}</small></td>
                  <td className="adm-ocultar-celular">{dataHora(u.ultimoLoginEm)}</td>
                  <td>
                    <div className="adm-selos">
                      {u.ativo ? <span className="adm-selo adm-selo--ok">ATIVO</span> : <span className="adm-selo adm-selo--off">DESATIVADO</span>}
                      {u.bloqueado && <span className="adm-selo adm-selo--aviso">BLOQUEADO POR TENTATIVAS</span>}
                    </div>
                  </td>
                  <td>
                    {!u.voce && (
                      <div className="adm-acoes adm-acoes--fim">
                        <button type="button" className="btn" onClick={() => { limpar(); setNovaSenha(''); setErroSenha(''); setRedefinindo(u); }}>Redefinir senha</button>
                        <button type="button" className={`btn${u.ativo ? ' btn--perigo' : ''}`} onClick={() => alternar(u)}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
