import { Game } from './types';

export const ADMIN_EMAILS = [
  'playersarena.site@gmail.com',
  'tournament909@gmail.com',
  'harsha.cpr001@gmail.com',
  'admin@khelgalli.com',
  'chouhanadarsh99@gmail.com',
  'qupagaming@gmail.com',
  'mahendrathakur9009@gmail.com',
  'mahendrar9009@gmail.com'
];

export const DEFAULT_ADMIN_CREDENTIALS = {
  email: 'playersarena.site@gmail.com',
  password: 'loveanu@harsh'
};

export interface GameMode {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
}

export const GAME_MODES_DATA: Record<string, GameMode[]> = {
  freefire: [
    { id: 'br_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop' },
    { id: 'br_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop' },
    { id: 'br_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop' },
    { id: 'cs_solo', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop' },
    { id: 'cs_duo', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop' },
    { id: 'cs_squad', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop' },
    { id: 'lone_wolf_solo', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=800&auto=format&fit=crop' },
    { id: 'lone_wolf_duo', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=800&auto=format&fit=crop' },
    { id: 'cs_headshot', title: 'CS HEADSHOT', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop' },
  ],
  bgmi: [
    { id: 'erangel_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop' },
    { id: 'erangel_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop' },
    { id: 'erangel_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop' },
    { id: 'tdm_4v4', title: 'TDM 4V4', subtitle: 'Team Deathmatch', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=800&auto=format&fit=crop' },
    { id: 'tdm_1v1', title: 'TDM 1V1', subtitle: 'Arena Duel', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=800&auto=format&fit=crop' },
  ]
};

export const GAMES: Game[] = [
  {
    id: 'freefire',
    title: 'FREE FIRE',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop',
    players: 0,
    order: 1,
    isActive: true
  },
  {
    id: 'bgmi',
    title: 'BATTLEGROUNDS MOBILE INDIA',
    image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1000&auto=format&fit=crop',
    players: 0,
    order: 2,
    isActive: true
  }
];
