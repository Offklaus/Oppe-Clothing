import { useEffect } from 'react';
import { useLoja } from '../context/LojaContext.jsx';
import { useRolarParaAncora } from '../hooks/useRolarParaAncora.js';
import Hero from '../components/home/Hero.jsx';
import Faixa from '../components/home/Faixa.jsx';
import Catalogo from '../components/home/Catalogo.jsx';
import ColecaoDestaque from '../components/home/ColecaoDestaque.jsx';
import Sobre from '../components/home/Sobre.jsx';

export default function Home() {
  const { status } = useLoja();
  useRolarParaAncora(status !== 'carregando');

  useEffect(() => { document.title = 'Oppe Clothing — Streetwear com fé'; }, []);

  return (
    <>
      <Hero />
      <Faixa />
      <Catalogo />
      <ColecaoDestaque />
      <Sobre />
    </>
  );
}
