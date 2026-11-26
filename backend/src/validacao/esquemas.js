import { z } from 'zod';
import { STATUS } from '../servicos/pedido.js';
import { ESTOQUE_MAXIMO, TELEFONE_BR, UFS, telefoneComPais } from '../servicos/formatos.js';

const texto = (max, rotulo) => z.string({ error: `${rotulo}: valor inválido.` }).trim().max(max, `${rotulo}: no máximo ${max} caracteres.`);
const obrigatorio = (max, rotulo) => texto(max, rotulo).min(1, `Preencha: ${rotulo.toLowerCase()}.`);
const opcional = (max, rotulo) => texto(max, rotulo).default('');
const slugOpcional = z.string().trim().toLowerCase().max(80, 'Endereço: no máximo 80 caracteres.')
  .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Endereço: use só letras minúsculas, números e hífen.').optional();
const preco = z.union([z.string().max(20, 'Preço inválido.'), z.number(), z.null()]).optional();
const ordem = z.number({ error: 'Ordem: use um número inteiro.' }).int('Ordem: use um número inteiro.').min(0).max(9999).default(0);
const idOpcional = z.number().int().positive().nullable().default(null);

export const esquemaLogin = z.strictObject({
  email: z.string().trim().toLowerCase().max(254),
  senha: z.string().max(128)
});

export const esquemaColecao = z.strictObject({
  nome: obrigatorio(60, 'Nome'),
  slug: slugOpcional,
  chamada: opcional(80, 'Chamada'),
  frase: opcional(300, 'Frase'),
  descricao: opcional(300, 'Descrição'),
  ordem,
  ativa: z.boolean().default(true)
});

export const esquemaProduto = z.strictObject({
  nome: obrigatorio(80, 'Nome'),
  cor: obrigatorio(60, 'Cor'),
  descricaoCor: opcional(120, 'Descrição da cor'),
  colecaoId: z.number({ error: 'Escolha a coleção.' }).int().positive('Escolha a coleção.'),
  tag: opcional(20, 'Selo'),
  preco,
  frase: opcional(300, 'Frase'),
  referencia: opcional(60, 'Referência'),
  estampa: opcional(300, 'Estampa'),
  ordem,
  ativo: z.boolean().default(true),
  slug: slugOpcional
});

export const esquemaLado = z.strictObject({
  lado: z.enum(['Frente', 'Costas'], { error: 'Escolha se a foto é da frente ou das costas.' })
});

export const esquemaLoja = z.strictObject({
  whatsapp: opcional(30, 'WhatsApp'),
  instagram: opcional(120, 'Instagram'),
  precoPadrao: preco,
  tamanhos: z.array(z.string().trim().min(1, 'Tamanho vazio.').max(8, 'Tamanho: no máximo 8 caracteres.'))
    .min(1, 'Informe pelo menos um tamanho.').max(12, 'No máximo 12 tamanhos.')
    .refine((lista) => new Set(lista.map((t) => t.toUpperCase())).size === lista.length, 'Há tamanhos repetidos.'),
  modelagem: opcional(200, 'Modelagem'),
  malha: opcional(200, 'Malha'),
  tecnicaEstampa: opcional(60, 'Técnica de estampa'),
  cuidados: opcional(200, 'Cuidados'),
  sobre: opcional(600, 'Sobre'),
  medidas: z.strictObject({
    colunas: z.array(z.string().trim().min(1, 'Coluna sem nome.').max(30)).min(1, 'A tabela precisa de colunas.').max(6),
    linhas: z.array(z.array(z.string().trim().max(20))).max(20)
  }).refine((m) => m.linhas.every((l) => l.length === m.colunas.length), 'Cada linha da tabela precisa ter todas as colunas.'),
  mensagens: z.strictObject({
    saudacao: opcional(200, 'Saudação'),
    pedido: opcional(200, 'Abertura do pedido'),
    fechamento: opcional(300, 'Fechamento'),
    contato: opcional(300, 'Mensagem de contato')
  }),
  destaqueProdutoId: idOpcional
});

const email = z.string().trim().toLowerCase().max(254, 'E-mail longo demais.').pipe(z.email('E-mail inválido.'));

export const esquemaUsuarioNovo = z.strictObject({
  nome: obrigatorio(80, 'Nome').refine((n) => n.length >= 2, 'Nome: pelo menos 2 caracteres.'),
  email,
  senha: z.string().max(128)
});

export const esquemaUsuarioEdicao = z.strictObject({
  nome: obrigatorio(80, 'Nome').optional(),
  ativo: z.boolean().optional()
});

export const esquemaTrocaSenha = z.strictObject({
  senhaAtual: z.string().max(128),
  novaSenha: z.string().max(128)
});

export const esquemaNovaSenha = z.strictObject({ novaSenha: z.string().max(128) });

const STATUS_PEDIDO = Object.keys(STATUS);
const soNumeros = (s) => s.replace(/\D/g, '');

const telefone = z.string({ error: 'Telefone inválido.' }).max(30, 'Telefone inválido.')
  .transform(telefoneComPais)
  .refine((d) => TELEFONE_BR.test(d), 'Telefone: informe DDD + número, ex.: (35) 99999-9999.');

export const esquemaCliente = z.strictObject({
  nome: obrigatorio(80, 'Nome').refine((n) => n.split(/\s+/).length >= 2, 'Nome: escreva nome e sobrenome.'),
  email,
  telefone,
  cep: z.string({ error: 'CEP inválido.' }).max(12, 'CEP inválido.').transform(soNumeros)
    .refine((d) => /^[0-9]{8}$/.test(d), 'CEP: informe os 8 números.'),
  logradouro: obrigatorio(120, 'Rua'),
  numero: obrigatorio(20, 'Número'),
  complemento: opcional(80, 'Complemento'),
  bairro: obrigatorio(80, 'Bairro'),
  cidade: obrigatorio(80, 'Cidade'),
  uf: z.string({ error: 'Escolha o estado.' }).trim().toUpperCase().pipe(z.enum(UFS, { error: 'Escolha o estado.' }))
});

export const esquemaPedido = z.strictObject({
  status: z.enum(STATUS_PEDIDO, { error: 'Escolha uma situação válida.' }).optional(),
  rastreio: texto(60, 'Código de rastreio').optional(),
  observacao: texto(1000, 'Observações').optional(),
  cliente: esquemaCliente.optional()
});

export const esquemaFiltroPedidos = z.object({
  status: z.enum(STATUS_PEDIDO).optional().catch(undefined),
  busca: z.string().trim().max(40).optional().catch(undefined)
});

export const esquemaNovoPedido = z.strictObject({
  chave: z.uuid({ error: 'Pedido inválido. Recarregue a página e tente de novo.' }),
  itens: z.array(z.unknown(), { error: 'Pedido inválido.' }).max(50, 'Pedido grande demais.'),
  cliente: esquemaCliente
});

const quantidadeEstoque = z.number({ error: 'Quantidade: use um número inteiro.' })
  .int('Quantidade: use um número inteiro.').min(0, 'Quantidade não pode ser negativa.')
  .max(ESTOQUE_MAXIMO, `Quantidade: no máximo ${ESTOQUE_MAXIMO}.`);
const porTamanho = z.record(z.string().trim().min(1).max(8), quantidadeEstoque, { error: 'Quantidades inválidas.' });

export const esquemaEstoque = z.strictObject({
  controla: z.boolean({ error: 'Informe se a peça controla estoque.' }),
  quantidades: porTamanho,
  anteriores: porTamanho.optional()
});

export const esquemaConsulta = z.strictObject({
  codigo: z.string({ error: 'Informe o código do pedido.' }).trim().min(1, 'Informe o código do pedido.').max(40, 'Código inválido.')
});

export const idNumerico = z.coerce.number().int().positive().max(2_147_483_647);

export const pareceEmail = (texto) => z.email().max(254).safeParse(texto).success;
export const idUuid = z.uuid();
export const posicaoImagem = z.coerce.number().int().min(0).max(1);
