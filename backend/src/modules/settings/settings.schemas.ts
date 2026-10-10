import { z } from 'zod';
import { optionalText, safeLink } from '../../lib/validation.js';

export const INFO_ICONS = ['whatsapp', 'truck', 'card', 'shield', 'medal', 'trophy', 'clock', 'diamond'] as const;

const infoItem = z.object({
  icon: z.enum(INFO_ICONS),
  title: z.string().trim().min(1).max(40),
  text: z.string().trim().max(60).default(''),
});

/** Conteúdo editável da página inicial (seções comerciais). Valores padrão = textos do site original. */
export const contentSchema = z.object({
  topbarMessages: z
    .array(z.string().trim().min(1).max(120))
    .max(4)
    .default(['**PEDIDO PELO WHATSAPP** · rápido e fácil', '🏆 Artigos esportivos, suplementos, tênis e moda fitness']),
  benefits: z
    .array(infoItem)
    .max(4)
    .default([
      { icon: 'whatsapp', title: 'Pedido no WhatsApp', text: 'Atendimento direto' },
      { icon: 'truck', title: 'Retirada ou entrega', text: 'Videira e região' },
      { icon: 'card', title: 'Pix ou cartão', text: 'Combinado na conversa' },
      { icon: 'shield', title: 'Produtos originais', text: 'Marcas de confiança' },
    ]),
  trustItems: z
    .array(infoItem)
    .max(4)
    .default([
      { icon: 'medal', title: 'Qualidade', text: 'Produtos selecionados' },
      { icon: 'trophy', title: 'Loja local', text: 'Aqui em Videira' },
      { icon: 'clock', title: 'Resposta rápida', text: 'Atendimento pelo Zap' },
      { icon: 'diamond', title: 'Do futsal à academia', text: 'Tudo em um só lugar' },
    ]),
  brandBanner: z
    .object({
      enabled: z.boolean().default(true),
      kicker: z.string().trim().max(60).default('Feito pra campeões'),
      title: z.string().trim().max(60).default('Entra em campo.'),
      highlight: z.string().trim().max(60).default('Sobe no pódio.'),
      text: z.string().trim().max(200).default('Chuteiras de futsal, society e campo das marcas que você confia.'),
      buttonLabel: z.string().trim().max(40).default('Ver chuteiras →'),
      buttonUrl: safeLink.default('/produtos?categoria=chuteiras'),
      brands: z
        .array(z.string().trim().min(1).max(20))
        .max(12)
        .default(['Nike', 'Adidas', 'Umbro', 'Joma', 'Penalty', 'Poker']),
    })
    .prefault({}),
  cta: z
    .object({
      enabled: z.boolean().default(true),
      title: z.string().trim().max(60).default('Dúvida no tamanho ou sabor?'),
      text: z.string().trim().max(200).default('Chama a gente no WhatsApp que a gente te ajuda a escolher.'),
      buttonLabel: z.string().trim().max(40).default('Falar no WhatsApp →'),
    })
    .prefault({}),
  home: z
    .object({
      featuredTitle: z.string().trim().max(40).default('Destaques'),
      showNewArrivals: z.boolean().default(true),
      showOnSale: z.boolean().default(true),
      showCategories: z.boolean().default(true),
      showCatalog: z.boolean().default(true),
    })
    .prefault({}),
  footerAbout: z
    .string()
    .trim()
    .max(300)
    .default('Loja de artigos esportivos, suplementação, tênis e moda fitness em Videira, SC.'),
  serviceNotes: z
    .array(z.string().trim().min(1).max(120))
    .max(6)
    .default(['Como comprar: monte a sacola e envie pelo WhatsApp', 'Trocas: combine com a loja']),
  cartNote: z.string().trim().max(160).default('Tamanho, cor e sabor a gente confirma no WhatsApp.'),
});

export type StoreContent = z.infer<typeof contentSchema>;

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v), 'Use uma URL https://.')
  .nullish()
  .transform((v) => v || null);

export const updateSettingsSchema = z
  .object({
    storeName: z.string().trim().min(2).max(80),
    logoPath: z
      .string()
      .regex(/^store\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Imagem inválida.')
      .nullable(),
    whatsappNumber: z
      .string()
      .transform((v) => v.replace(/\D/g, ''))
      .pipe(z.string().regex(/^[0-9]{12,13}$/, 'Informe o número com DDI e DDD, ex.: 55 49 99809-0818.')),
    phoneDisplay: optionalText(30),
    email: z.email('E-mail inválido.').max(254).nullish().transform((v) => v || null),
    address: optionalText(200),
    city: optionalText(100),
    openingHours: optionalText(300),
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    pickupInfo: optionalText(300),
    deliveryInfo: optionalText(300),
    instagramUrl: httpsUrl,
    facebookUrl: httpsUrl,
    tiktokUrl: httpsUrl,
    whatsappGreeting: z.string().trim().min(2).max(300),
    orderMessageIntro: z.string().trim().min(2).max(300),
    orderMessageFooter: optionalText(300),
    heroIntervalSeconds: z.number().int().min(3).max(30),
    pendingOrderTtlHours: z.number().int().min(1).max(720),
    content: contentSchema,
  })
  .partial()
  .refine((v) => !(v.pickupEnabled === false && v.deliveryEnabled === false), {
    message: 'Mantenha ao menos uma forma de recebimento (retirada ou entrega).',
    path: ['pickupEnabled'],
  });
