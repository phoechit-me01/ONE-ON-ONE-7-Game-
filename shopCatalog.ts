import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  resolveActiveUserId,
  resolveDisplayNameFromUser,
  SESSION_CHANGE_EVENT,
} from '../firebase';

export type ItemCategory = 'star' | 'crown' | 'frame';
export type ItemTier = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Royal' | 'Special';

export interface ShopItem {
  item_id: string;
  item_name: string;
  category: ItemCategory;
  tier: ItemTier;
  price_gold: number;
  price_gems: number;
  image_url: string;
  sortOrder: number;
}

export type EquippedLocation =
  | { area: 'showcase'; slotIndex: number; label: string }
  | { area: 'vault'; slotKey: string; slotNumber: number; label: string };

/**
 * Complete 56-Item Master Catalog with Balanced & Progressive Tiered Pricing (GDD Sections 5 & 6):
 * - Stars (25 Items): Bronze -> Silver -> Gold -> Diamond (1,000 - 15,000 Gold), University (15 - 45 Gems)
 * - Crowns (20 Items): Bronze -> Silver -> Gold (20,000 - 50,000 Gold), Royal (50 - 200 Gems)
 * - Frames (11 Items): Frames 01-06 (5,000 - 25,000 Gold), Frames 07-11 (30 - 100 Gems)
 */
export const DEFAULT_SHOP_CATALOG: ShopItem[] = [
  // ================= STARS (25 ITEMS) =================
  // Bronze Stars (1,000 - 2,600 Gold)
  {
    item_id: 'item_bronze_star_1',
    item_name: 'Bronze Star 1',
    category: 'star',
    tier: 'Bronze',
    price_gold: 1000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1W5hMwRTXgGdxB9oyCgEnGJVVG-4_s7AL/view',
    sortOrder: 1,
  },
  {
    item_id: 'item_bronze_star_2',
    item_name: 'Bronze Star 2',
    category: 'star',
    tier: 'Bronze',
    price_gold: 1400,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1sNeln3D4btMSG6ZvKzK1HPVhsEwPdp9S/view',
    sortOrder: 2,
  },
  {
    item_id: 'item_bronze_star_3',
    item_name: 'Bronze Star 3',
    category: 'star',
    tier: 'Bronze',
    price_gold: 1800,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/19-9_JtNqFfMwaIveXfnFyuEfNg3pm9qI/view',
    sortOrder: 3,
  },
  {
    item_id: 'item_bronze_star_4',
    item_name: 'Bronze Star 4',
    category: 'star',
    tier: 'Bronze',
    price_gold: 2200,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/15Tg79t6BJxvpJNJ-mS1Dn6YZfedy5js2/view',
    sortOrder: 4,
  },
  {
    item_id: 'item_bronze_star_5',
    item_name: 'Bronze Star 5',
    category: 'star',
    tier: 'Bronze',
    price_gold: 2600,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1Tmk3xSQJAnwLQbUWlkzipVnxAztm7d3s/view',
    sortOrder: 5,
  },

  // Silver Stars (3,200 - 6,000 Gold)
  {
    item_id: 'item_silver_star_1',
    item_name: 'Silver Star 1',
    category: 'star',
    tier: 'Silver',
    price_gold: 3200,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1GGP6J4MN3FBicGcAPGsWkaBAcqgrTjlD/view',
    sortOrder: 6,
  },
  {
    item_id: 'item_silver_star_2',
    item_name: 'Silver Star 2',
    category: 'star',
    tier: 'Silver',
    price_gold: 3900,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1A23HMLjSYdO0BZjcevr71WLLOkVMQ2mT/view',
    sortOrder: 7,
  },
  {
    item_id: 'item_silver_star_3',
    item_name: 'Silver Star 3',
    category: 'star',
    tier: 'Silver',
    price_gold: 4600,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1wCKJBIwAjqZhudAT3hSOs2QyLaZoh6xI/view',
    sortOrder: 8,
  },
  {
    item_id: 'item_silver_star_4',
    item_name: 'Silver Star 4',
    category: 'star',
    tier: 'Silver',
    price_gold: 5300,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1exJHsI2AQcNvJCshbYzP4AUhPoJuFGJc/view',
    sortOrder: 9,
  },
  {
    item_id: 'item_silver_star_5',
    item_name: 'Silver Star 5',
    category: 'star',
    tier: 'Silver',
    price_gold: 6000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/13Ofg-pFjGdrm7IZoAK5QYKB9oA6C8fos/view',
    sortOrder: 10,
  },

  // Gold Stars (7,000 - 11,000 Gold)
  {
    item_id: 'item_gold_star_1',
    item_name: 'Gold Star 1',
    category: 'star',
    tier: 'Gold',
    price_gold: 7000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1GMlhMmVs67svJdYyF2s1H0ywJ8UvGgNj/view',
    sortOrder: 11,
  },
  {
    item_id: 'item_gold_star_2',
    item_name: 'Gold Star 2',
    category: 'star',
    tier: 'Gold',
    price_gold: 8000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1ScUexc-WGbdClSXvw-7-8MhpPu_ZyefY/view',
    sortOrder: 12,
  },
  {
    item_id: 'item_gold_star_3',
    item_name: 'Gold Star 3',
    category: 'star',
    tier: 'Gold',
    price_gold: 9000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1SN2NQ6ObOYs0rRof_slpgwJCveM9h4HD/view',
    sortOrder: 13,
  },
  {
    item_id: 'item_gold_star_4',
    item_name: 'Gold Star 4',
    category: 'star',
    tier: 'Gold',
    price_gold: 10000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1FCAlm-DsOJLCfFRLQrGu_sDYuou0N9SA/view',
    sortOrder: 14,
  },
  {
    item_id: 'item_gold_star_5',
    item_name: 'Gold Star 5',
    category: 'star',
    tier: 'Gold',
    price_gold: 11000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1RPCDND23Vn8UcH3b_U5n2NfbOlU9DyNI/view',
    sortOrder: 15,
  },

  // Diamond Stars (12,000 - 15,000 Gold)
  {
    item_id: 'item_diamond_star_1',
    item_name: 'Diamond Star 1',
    category: 'star',
    tier: 'Diamond',
    price_gold: 12000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1-pjHPMwrX0ggS9ogYceiilTF6aeZDVTE/view',
    sortOrder: 16,
  },
  {
    item_id: 'item_diamond_star_2',
    item_name: 'Diamond Star 2',
    category: 'star',
    tier: 'Diamond',
    price_gold: 12750,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1ke3IYkpGxqZsObJ-uKQUzhRYGRnPyRcH/view',
    sortOrder: 17,
  },
  {
    item_id: 'item_diamond_star_3',
    item_name: 'Diamond Star 3',
    category: 'star',
    tier: 'Diamond',
    price_gold: 13500,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1vlajk6RBYLoMuqPSYR6bsBCnLkl5LNma/view',
    sortOrder: 18,
  },
  {
    item_id: 'item_diamond_star_4',
    item_name: 'Diamond Star 4',
    category: 'star',
    tier: 'Diamond',
    price_gold: 14250,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1mumJhxsGFBvfRU9KTb4nI-impRnRtgCw/view',
    sortOrder: 19,
  },
  {
    item_id: 'item_diamond_star_5',
    item_name: 'Diamond Star 5',
    category: 'star',
    tier: 'Diamond',
    price_gold: 15000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1zZ-Kz5lgYAMyKhaZZyRBxSsOI-4lkgfp/view',
    sortOrder: 20,
  },

  // University Stars (Special Designs: 15 - 45 Gems)
  {
    item_id: 'item_university_star_1',
    item_name: 'University Star 1',
    category: 'star',
    tier: 'Special',
    price_gold: 0,
    price_gems: 15,
    image_url: 'https://drive.google.com/file/d/1OLkrr6O_vRDuW6NONOiRNZsjMCfYRWTH/view',
    sortOrder: 21,
  },
  {
    item_id: 'item_university_star_2',
    item_name: 'University Star 2',
    category: 'star',
    tier: 'Special',
    price_gold: 0,
    price_gems: 22,
    image_url: 'https://drive.google.com/file/d/1-MFo3xcmBC4RBKkKK6EDTO4oR-coCAd9/view',
    sortOrder: 22,
  },
  {
    item_id: 'item_university_star_3',
    item_name: 'University Star 3',
    category: 'star',
    tier: 'Special',
    price_gold: 0,
    price_gems: 30,
    image_url: 'https://drive.google.com/file/d/1snmtBVQduqC9BEUJmWy7Lk5zDZlqiUZb/view',
    sortOrder: 23,
  },
  {
    item_id: 'item_university_star_4',
    item_name: 'University Star 4',
    category: 'star',
    tier: 'Special',
    price_gold: 0,
    price_gems: 38,
    image_url: 'https://drive.google.com/file/d/1QAkarEpRkHl-9dzpMWNdghMasvWWNDi3/view',
    sortOrder: 24,
  },
  {
    item_id: 'item_university_star_5',
    item_name: 'University Star 5',
    category: 'star',
    tier: 'Special',
    price_gold: 0,
    price_gems: 45,
    image_url: 'https://drive.google.com/file/d/1Sw3aaxyb1flMpGc_fmyiEZ2XQULA30Mk/view',
    sortOrder: 25,
  },

  // ================= CROWNS (20 ITEMS) =================
  // Bronze Crowns (20,000 - 28,000 Gold)
  {
    item_id: 'item_bronze_crown_1',
    item_name: 'Bronze Crown 1',
    category: 'crown',
    tier: 'Bronze',
    price_gold: 20000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1LggislWa3vIiBFlF8WlE1j8zkHrUBBk7/view',
    sortOrder: 26,
  },
  {
    item_id: 'item_bronze_crown_2',
    item_name: 'Bronze Crown 2',
    category: 'crown',
    tier: 'Bronze',
    price_gold: 22000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1SSiDo3J5HwB6uOxYCreeF2ebIS77jPJU/view',
    sortOrder: 27,
  },
  {
    item_id: 'item_bronze_crown_3',
    item_name: 'Bronze Crown 3',
    category: 'crown',
    tier: 'Bronze',
    price_gold: 24000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/12PsLdyzshBV3g7AosaypG21mxCWqCWE_/view',
    sortOrder: 28,
  },
  {
    item_id: 'item_bronze_crown_4',
    item_name: 'Bronze Crown 4',
    category: 'crown',
    tier: 'Bronze',
    price_gold: 26000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1PEuqr6NYZXDsgKj_XtELX8nr7vo7Sd4k/view',
    sortOrder: 29,
  },
  {
    item_id: 'item_bronze_crown_5',
    item_name: 'Bronze Crown 5',
    category: 'crown',
    tier: 'Bronze',
    price_gold: 28000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1u-8Oy-BBgiKwPlk_bxOV9qOM1WMtKLAS/view',
    sortOrder: 30,
  },

  // Silver Crowns (30,000 - 38,000 Gold)
  {
    item_id: 'item_silver_crown_1',
    item_name: 'Silver Crown 1',
    category: 'crown',
    tier: 'Silver',
    price_gold: 30000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1eEeDg5XXPKSkXRQeWHhb9CTpnO2fPqFX/view',
    sortOrder: 31,
  },
  {
    item_id: 'item_silver_crown_2',
    item_name: 'Silver Crown 2',
    category: 'crown',
    tier: 'Silver',
    price_gold: 32000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1p-OSs56heodRUFyTQM6_r9z6pZPk1oYK/view',
    sortOrder: 32,
  },
  {
    item_id: 'item_silver_crown_3',
    item_name: 'Silver Crown 3',
    category: 'crown',
    tier: 'Silver',
    price_gold: 34000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1Ve1SMhjRnaLYpjXUsflCC7pY4Caz-lmE/view',
    sortOrder: 33,
  },
  {
    item_id: 'item_silver_crown_4',
    item_name: 'Silver Crown 4',
    category: 'crown',
    tier: 'Silver',
    price_gold: 36000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1ZaaZkvvFcMDw93C7crnbH6v_umxiic3A/view',
    sortOrder: 34,
  },
  {
    item_id: 'item_silver_crown_5',
    item_name: 'Silver Crown 5',
    category: 'crown',
    tier: 'Silver',
    price_gold: 38000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1pNUwL5ZTC0gnTdN3O2x7NN8mV0eFkJ6g/view',
    sortOrder: 35,
  },

  // Gold Crowns (40,000 - 50,000 Gold)
  {
    item_id: 'item_gold_crown_1',
    item_name: 'Gold Crown 1',
    category: 'crown',
    tier: 'Gold',
    price_gold: 40000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1IUBURhnv_zajGtGAOEIra-i3KuBn8gN4/view',
    sortOrder: 36,
  },
  {
    item_id: 'item_gold_crown_2',
    item_name: 'Gold Crown 2',
    category: 'crown',
    tier: 'Gold',
    price_gold: 42500,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1hsDArgKvtPrx-3TEVeNzF-FS_1LtAEu1/view',
    sortOrder: 37,
  },
  {
    item_id: 'item_gold_crown_3',
    item_name: 'Gold Crown 3',
    category: 'crown',
    tier: 'Gold',
    price_gold: 45000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1zD6i1TsMLeKa6-0NKEmpQ3UWyQKIDPUh/view',
    sortOrder: 38,
  },
  {
    item_id: 'item_gold_crown_4',
    item_name: 'Gold Crown 4',
    category: 'crown',
    tier: 'Gold',
    price_gold: 47500,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1RWl0xw5rrygNTBB1knSuE7hCuka17hB-/view',
    sortOrder: 39,
  },
  {
    item_id: 'item_gold_crown_5',
    item_name: 'Gold Crown 5',
    category: 'crown',
    tier: 'Gold',
    price_gold: 50000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1Wp6QlnSWqqWshGiL1C0nhlPWFY1vZ2RH/view',
    sortOrder: 40,
  },

  // Royal Crowns (Elite Gem Crowns: 50 - 200 Gems)
  {
    item_id: 'item_royal_crown_1',
    item_name: 'Royal Crown 1',
    category: 'crown',
    tier: 'Royal',
    price_gold: 0,
    price_gems: 50,
    image_url: 'https://drive.google.com/file/d/1BmPcbiHrf82LkvNqgTh2bS0xQBktUD-w/view',
    sortOrder: 41,
  },
  {
    item_id: 'item_royal_crown_2',
    item_name: 'Royal Crown 2',
    category: 'crown',
    tier: 'Royal',
    price_gold: 0,
    price_gems: 85,
    image_url: 'https://drive.google.com/file/d/1cFpmPaly-NCP0gpKreNjju_c3LC6Pl4m/view',
    sortOrder: 42,
  },
  {
    item_id: 'item_royal_crown_3',
    item_name: 'Royal Crown 3',
    category: 'crown',
    tier: 'Royal',
    price_gold: 0,
    price_gems: 120,
    image_url: 'https://drive.google.com/file/d/1LdrTROP-OcSW_0DySyw-pKIFozkbCaOd/view',
    sortOrder: 43,
  },
  {
    item_id: 'item_royal_crown_4',
    item_name: 'Royal Crown 4',
    category: 'crown',
    tier: 'Royal',
    price_gold: 0,
    price_gems: 160,
    image_url: 'https://drive.google.com/file/d/1mJLyKwsBkeMwOPeODrGAf1KR2p81Vd_n/view',
    sortOrder: 44,
  },
  {
    item_id: 'item_royal_crown_5',
    item_name: 'Royal Crown 5',
    category: 'crown',
    tier: 'Royal',
    price_gold: 0,
    price_gems: 200,
    image_url: 'https://drive.google.com/file/d/1S4YPxYHrrAIXJ9AzhG4ZmdTWP0tXVlUa/view',
    sortOrder: 45,
  },

  // ================= FRAMES (11 ITEMS) =================
  // Gold-Tier Decorative Frames (5,000 - 25,000 Gold)
  {
    item_id: 'item_frame_01_frost_dragon',
    item_name: 'Frost Dragon Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 5000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1q5QCAOFar0BZ_HjHTQN9nqBE2S90x1dO/view',
    sortOrder: 46,
  },
  {
    item_id: 'item_frame_02_starlight_guardian',
    item_name: 'Starlight Guardian Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 9000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1UPwLngcKBFFTl21FfIe1Q8DDKQY6lVdv/view',
    sortOrder: 47,
  },
  {
    item_id: 'item_frame_03_galaxy_griffin',
    item_name: 'Galaxy Griffin Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 13000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/18vgAs7AlTrNu2-7495q6HYnUTG4oKZru/view',
    sortOrder: 48,
  },
  {
    item_id: 'item_frame_04_ice_castle',
    item_name: 'Ice Castle Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 17000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1kkpT7jo8EkQFSGry6Lzs0sCrmS1XDI9R/view',
    sortOrder: 49,
  },
  {
    item_id: 'item_frame_05_lion_gladiator',
    item_name: 'Lion Gladiator Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 21000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/14KQt4WkcSjP0C6JAeQYsWseW4nddgWZP/view',
    sortOrder: 50,
  },
  {
    item_id: 'item_frame_06_arcane_orb',
    item_name: 'Arcane Orb Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 25000,
    price_gems: 0,
    image_url: 'https://drive.google.com/file/d/1dRgYEEcf_GmkprIELna_sJPPkqlpaD-t/view',
    sortOrder: 51,
  },

  // Gem-Tier Decorative Frames (30 - 100 Gems)
  {
    item_id: 'item_frame_07_cosmic_phoenix',
    item_name: 'Cosmic Phoenix Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 0,
    price_gems: 30,
    image_url: 'https://drive.google.com/file/d/1Vo9OrMhXejLSg3usmGQu-YB7LdUlc1Ee/view',
    sortOrder: 52,
  },
  {
    item_id: 'item_frame_08_nine_tail_fox',
    item_name: 'Nine Tail Fox Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 0,
    price_gems: 45,
    image_url: 'https://drive.google.com/file/d/1RLa3J1YG7vHfv1rGX6t34K9Jp_0arSxN/view',
    sortOrder: 53,
  },
  {
    item_id: 'item_frame_09_sapphire_dragon',
    item_name: 'Sapphire Dragon Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 0,
    price_gems: 65,
    image_url: 'https://drive.google.com/file/d/1NPebw9oPFi3WE2L-0hRCwanuMjf_zUGU/view',
    sortOrder: 54,
  },
  {
    item_id: 'item_frame_10_pegasus_unicorn',
    item_name: 'Pegasus Unicorn Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 0,
    price_gems: 85,
    image_url: 'https://drive.google.com/file/d/1sooE_UDGhbdm8hOuu0jS9ylpfyZT1e7W/view',
    sortOrder: 55,
  },
  {
    item_id: 'item_frame_11_nature_earth',
    item_name: 'Nature Earth Frame',
    category: 'frame',
    tier: 'Special',
    price_gold: 0,
    price_gems: 100,
    image_url: 'https://drive.google.com/file/d/1XiVgLx73txRew77SrK1kmy6Og4DzmRs2/view',
    sortOrder: 56,
  },
];

export const VAULT_SLOT_KEYS: string[] = Array.from({ length: 30 }, (_, i) => `slot_${i + 1}`);

export function isPreciousShimmerItem(item: ShopItem): boolean {
  if (item.category === 'crown') return true;
  if (item.tier === 'Diamond' || item.tier === 'Royal' || item.tier === 'Special') return true;
  if (item.price_gems > 0) return true;
  return false;
}

export function formatItemPriceLabel(item: ShopItem): string {
  if (item.price_gems > 0) {
    return `💎 ${item.price_gems.toLocaleString('en-US')}`;
  }
  return `🪙 ${item.price_gold.toLocaleString('en-US')}`;
}

export function normalizeHomeSlots(raw: unknown): (string | null)[] {
  if (Array.isArray(raw)) {
    return [
      typeof raw[0] === 'string' && raw[0] ? raw[0] : null,
      typeof raw[1] === 'string' && raw[1] ? raw[1] : null,
      typeof raw[2] === 'string' && raw[2] ? raw[2] : null,
    ];
  }
  return [null, null, null];
}

export function normalizeVaultSlots(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  for (const [key, val] of entries) {
    if (typeof val !== 'string' || !val) continue;
    if (/^slot_\d+$/.test(key)) {
      const num = parseInt(key.replace('slot_', ''), 10);
      if (num >= 1 && num <= 30) {
        result[`slot_${num}`] = val;
      }
    } else if (/^[A-F][1-5]$/i.test(key)) {
      const row = key.toUpperCase().charCodeAt(0) - 65; // 0..5
      const col = parseInt(key[1], 10) - 1; // 0..4
      const slotNum = row * 5 + col + 1;
      if (slotNum >= 1 && slotNum <= 30 && !result[`slot_${slotNum}`]) {
        result[`slot_${slotNum}`] = val;
      }
    }
  }
  return result;
}

/**
 * Enforces the Unique Item Rule across all 3 Home Showcase slots and all 30 Vault slots:
 * Any item appearing more than once keeps only its first placement.
 */
export function enforceUniquePlacements(
  homeSlots: (string | null)[],
  vaultSlots: Record<string, string>
): { homeSlots: (string | null)[]; vaultSlots: Record<string, string> } {
  const seen = new Set<string>();
  const cleanHome: (string | null)[] = [null, null, null];
  for (let i = 0; i < 3; i++) {
    const id = homeSlots[i];
    if (id && !seen.has(id)) {
      seen.add(id);
      cleanHome[i] = id;
    }
  }
  const cleanVault: Record<string, string> = {};
  for (const slotKey of VAULT_SLOT_KEYS) {
    const id = vaultSlots[slotKey];
    if (id && !seen.has(id)) {
      seen.add(id);
      cleanVault[slotKey] = id;
    }
  }
  return { homeSlots: cleanHome, vaultSlots: cleanVault };
}

export function findItemEquippedLocation(
  itemId: string,
  homeSlots: (string | null)[],
  vaultSlots: Record<string, string>
): EquippedLocation | null {
  for (let i = 0; i < 3; i++) {
    if (homeSlots[i] === itemId) {
      return {
        area: 'showcase',
        slotIndex: i,
        label: `Showcase #${i + 1}`,
      };
    }
  }
  for (let i = 0; i < VAULT_SLOT_KEYS.length; i++) {
    const key = VAULT_SLOT_KEYS[i];
    if (vaultSlots[key] === itemId) {
      return {
        area: 'vault',
        slotKey: key,
        slotNumber: i + 1,
        label: `Vault #${i + 1}`,
      };
    }
  }
  return null;
}

/**
 * Finds the active equipped Frame item from either the 3 Profile Showcase slots
 * (checked first) or the 30 DataBoard Vault Matrix slots.
 */
export function findEquippedFrameItem(
  homeSlots: (string | null)[],
  vaultSlots: Record<string, string>,
  catalogMap: Record<string, ShopItem>
): ShopItem | null {
  for (let i = 0; i < 3; i++) {
    const id = homeSlots[i];
    const item = id ? catalogMap[id] : undefined;
    if (item && item.category === 'frame') {
      return item;
    }
  }
  for (const key of VAULT_SLOT_KEYS) {
    const id = vaultSlots[key];
    const item = id ? catalogMap[id] : undefined;
    if (item && item.category === 'frame') {
      return item;
    }
  }
  return null;
}

export interface PurchaseResult {
  ok: boolean;
  code?: 'ALREADY_OWNED' | 'INSUFFICIENT_GOLD' | 'INSUFFICIENT_GEMS' | 'ERROR';
  error?: string;
}

/**
 * Atomically validates user wallet (`wallet.gold` >= `price_gold` AND `wallet.gems` >= `price_gems`),
 * deducts exact currency cost, and adds the purchased item to `vault_inventory`.
 */
export async function purchaseShopItemTransaction(
  userId: string,
  item: ShopItem
): Promise<PurchaseResult> {
  const userDocRef = doc(db, 'users', userId);
  const requiredGold = Math.max(0, Number(item.price_gold) || 0);
  const requiredGems = Math.max(0, Number(item.price_gems) || 0);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userDocRef);
      const data = snap.exists() ? snap.data() : {};

      const existingWallet =
        data.wallet && typeof data.wallet === 'object' ? data.wallet : {};
      const currentGold = Math.max(
        0,
        Number(
          data.gold ??
            existingWallet.gold ??
            data.coins ??
            data.goldBalance ??
            data.currency?.gold ??
            0
        ) || 0
      );
      const currentGems = Math.max(
        0,
        Number(
          data.gems ??
            existingWallet.gems ??
            data.gem ??
            data.gemBalance ??
            data.currency?.gems ??
            0
        ) || 0
      );

      const rawInv = Array.isArray(data.vault_inventory)
        ? data.vault_inventory
        : Array.isArray(data.showcase_data?.vault_inventory)
        ? data.showcase_data.vault_inventory
        : [];
      const inventory: string[] = rawInv.filter(
        (x: unknown): x is string => typeof x === 'string' && x.length > 0
      );

      if (inventory.includes(item.item_id)) {
        throw new Error('ALREADY_OWNED');
      }

      if (requiredGems > 0 && currentGems < requiredGems) {
        throw new Error(`INSUFFICIENT_GEMS:${requiredGems}:${currentGems}`);
      }

      if (requiredGold > 0 && currentGold < requiredGold) {
        throw new Error(`INSUFFICIENT_GOLD:${requiredGold}:${currentGold}`);
      }

      const nextGold = currentGold - requiredGold;
      const nextGems = currentGems - requiredGems;
      const nextInventory = [...inventory, item.item_id];
      const existingShowcaseData =
        data.showcase_data && typeof data.showcase_data === 'object' ? data.showcase_data : {};

      const starIdsInCatalog = new Set(
        DEFAULT_SHOP_CATALOG.filter((c) => c.category === 'star').map((c) => c.item_id)
      );
      const ownedStarsCount = nextInventory.filter(
        (id) => starIdsInCatalog.has(id) || (id === item.item_id && item.category === 'star')
      ).length;

      const updatedPayload: Record<string, unknown> = {
        gold: nextGold,
        gems: nextGems,
        wallet: {
          ...existingWallet,
          gold: nextGold,
          gems: nextGems,
        },
        vault_inventory: nextInventory,
        owned_items_count: nextInventory.length,
        total_stars: Math.max(Number(data.total_stars ?? 0) || 0, ownedStarsCount),
        showcase_data: {
          ...existingShowcaseData,
          vault_inventory: nextInventory,
        },
        updatedAt: Date.now(),
      };

      tx.set(userDocRef, updatedPayload, { merge: true });
    });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ALREADY_OWNED')) {
      return {
        ok: false,
        code: 'ALREADY_OWNED',
        error: 'You already own this item!',
      };
    }
    if (msg.startsWith('INSUFFICIENT_GEMS')) {
      const parts = msg.split(':');
      const req = Number(parts[1] || requiredGems).toLocaleString('en-US');
      const cur = Number(parts[2] || 0).toLocaleString('en-US');
      return {
        ok: false,
        code: 'INSUFFICIENT_GEMS',
        error: `Insufficient Gems! Need 💎 ${req} (Your balance: 💎 ${cur}).`,
      };
    }
    if (msg.startsWith('INSUFFICIENT_GOLD')) {
      const parts = msg.split(':');
      const req = Number(parts[1] || requiredGold).toLocaleString('en-US');
      const cur = Number(parts[2] || 0).toLocaleString('en-US');
      return {
        ok: false,
        code: 'INSUFFICIENT_GOLD',
        error: `Insufficient Gold! Need 🪙 ${req} (Your balance: 🪙 ${cur}).`,
      };
    }
    return {
      ok: false,
      code: 'ERROR',
      error: 'Unable to complete purchase. Please try again.',
    };
  }
}

/**
 * Atomically equips or unequips an item in one of the 3 Home Profile Showcase slots (0, 1, 2).
 * Enforces the Unique Item Rule (removes the item from any other showcase or vault slot).
 */
export async function equipHomeShowcaseSlotTransaction(
  userId: string,
  slotIndex: number,
  itemId: string | null
): Promise<void> {
  if (slotIndex < 0 || slotIndex > 2) return;
  const userDocRef = doc(db, 'users', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userDocRef);
    const data = snap.exists() ? snap.data() : {};

    const rawHome = data.home_slots ?? data.showcase_data?.home_slots;
    const rawVault = data.equipped_vault_slots ?? data.showcase_data?.equipped_vault_slots;

    const currentHome = normalizeHomeSlots(rawHome);
    const currentVault = normalizeVaultSlots(rawVault);

    if (itemId) {
      // Remove itemId from all showcase slots & all vault slots (No Duplicates)
      for (let i = 0; i < 3; i++) {
        if (currentHome[i] === itemId) currentHome[i] = null;
      }
      for (const k of Object.keys(currentVault)) {
        if (currentVault[k] === itemId) {
          delete currentVault[k];
        }
      }
      currentHome[slotIndex] = itemId;
    } else {
      currentHome[slotIndex] = null;
    }

    const deduped = enforceUniquePlacements(currentHome, currentVault);
    const existingShowcaseData =
      data.showcase_data && typeof data.showcase_data === 'object' ? data.showcase_data : {};

    tx.set(userDocRef, {
      ...data,
      home_slots: deduped.homeSlots,
      equipped_vault_slots: deduped.vaultSlots,
      showcase_data: {
        ...existingShowcaseData,
        home_slots: deduped.homeSlots,
        equipped_vault_slots: deduped.vaultSlots,
      },
      updatedAt: Date.now(),
    });
  });
}

/**
 * Atomically equips or unequips an item in one of the 30 Vault Matrix slots (`slot_1` .. `slot_30`).
 * Enforces the Unique Item Rule (removes the item from any home showcase or other vault slot).
 */
export async function equipVaultSlotTransaction(
  userId: string,
  slotKey: string,
  itemId: string | null
): Promise<void> {
  if (!VAULT_SLOT_KEYS.includes(slotKey)) return;
  const userDocRef = doc(db, 'users', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userDocRef);
    const data = snap.exists() ? snap.data() : {};

    const rawHome = data.home_slots ?? data.showcase_data?.home_slots;
    const rawVault = data.equipped_vault_slots ?? data.showcase_data?.equipped_vault_slots;

    const currentHome = normalizeHomeSlots(rawHome);
    const currentVault = normalizeVaultSlots(rawVault);

    if (itemId) {
      for (let i = 0; i < 3; i++) {
        if (currentHome[i] === itemId) currentHome[i] = null;
      }
      for (const k of Object.keys(currentVault)) {
        if (currentVault[k] === itemId) {
          delete currentVault[k];
        }
      }
      currentVault[slotKey] = itemId;
    } else {
      delete currentVault[slotKey];
    }

    const deduped = enforceUniquePlacements(currentHome, currentVault);
    const existingShowcaseData =
      data.showcase_data && typeof data.showcase_data === 'object' ? data.showcase_data : {};

    // Note: setDoc with merge deep-merges maps, so overwrite equipped_vault_slots cleanly on existing doc
    const updatedDoc = {
      ...data,
      home_slots: deduped.homeSlots,
      equipped_vault_slots: deduped.vaultSlots,
      showcase_data: {
        ...existingShowcaseData,
        home_slots: deduped.homeSlots,
        equipped_vault_slots: deduped.vaultSlots,
      },
      updatedAt: Date.now(),
    };
    tx.set(userDocRef, updatedDoc);
  });
}

/**
 * Atomically moves or swaps items between two Vault Matrix slots (`slot_1` .. `slot_30`).
 */
export async function swapVaultSlotsTransaction(
  userId: string,
  fromSlotKey: string,
  toSlotKey: string
): Promise<void> {
  if (
    fromSlotKey === toSlotKey ||
    !VAULT_SLOT_KEYS.includes(fromSlotKey) ||
    !VAULT_SLOT_KEYS.includes(toSlotKey)
  ) {
    return;
  }
  const userDocRef = doc(db, 'users', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userDocRef);
    const data = snap.exists() ? snap.data() : {};

    const rawHome = data.home_slots ?? data.showcase_data?.home_slots;
    const rawVault = data.equipped_vault_slots ?? data.showcase_data?.equipped_vault_slots;

    const currentHome = normalizeHomeSlots(rawHome);
    const currentVault = normalizeVaultSlots(rawVault);

    const fromItem = currentVault[fromSlotKey] || null;
    const toItem = currentVault[toSlotKey] || null;

    if (fromItem) {
      currentVault[toSlotKey] = fromItem;
    } else {
      delete currentVault[toSlotKey];
    }

    if (toItem) {
      currentVault[fromSlotKey] = toItem;
    } else {
      delete currentVault[fromSlotKey];
    }

    const deduped = enforceUniquePlacements(currentHome, currentVault);
    const existingShowcaseData =
      data.showcase_data && typeof data.showcase_data === 'object' ? data.showcase_data : {};

    tx.set(userDocRef, {
      ...data,
      home_slots: deduped.homeSlots,
      equipped_vault_slots: deduped.vaultSlots,
      showcase_data: {
        ...existingShowcaseData,
        home_slots: deduped.homeSlots,
        equipped_vault_slots: deduped.vaultSlots,
      },
      updatedAt: Date.now(),
    });
  });
}

/**
 * Ensures any missing items or outdated prices in Firestore `shop_items` stay synced with GDD tiers.
 */
let hasSyncedShopCatalogOnce = false;
async function ensureFirestoreShopCatalogSynced(remoteIds: Set<string>) {
  if (hasSyncedShopCatalogOnce) return;
  hasSyncedShopCatalogOnce = true;
  if (remoteIds.size >= DEFAULT_SHOP_CATALOG.length) return;
  try {
    const missing = DEFAULT_SHOP_CATALOG.filter((item) => !remoteIds.has(item.item_id));
    await Promise.allSettled(
      missing.map((item) =>
        setDoc(
          doc(db, 'shop_items', item.item_id),
          {
            item_id: item.item_id,
            item_name: item.item_name,
            category: item.category,
            tier: item.tier,
            price_gold: item.price_gold,
            price_gems: item.price_gems,
            image_url: item.image_url,
          },
          { merge: true }
        )
      )
    );
  } catch {
    // Non-blocking seed fallback
  }
}

export interface ShopAndInventoryState {
  userId: string;
  displayName: string;
  catalog: ShopItem[];
  catalogMap: Record<string, ShopItem>;
  walletGold: number;
  walletGems: number;
  ownedItemIds: string[];
  homeSlots: (string | null)[];
  vaultSlots: Record<string, string>;
  isLoading: boolean;
}

/**
 * Real-time hook subscribing to `shop_items` (56 items) and active `/users/{userId}`
 * wallet, owned inventory, home showcase slots, and 6x5 vault matrix slots.
 */
export function useShopAndInventory(): ShopAndInventoryState {
  const [userId, setUserId] = useState<string>(() => resolveActiveUserId(auth.currentUser));
  const [displayName, setDisplayName] = useState<string>(() =>
    resolveDisplayNameFromUser(auth.currentUser)
  );
  const [catalog, setCatalog] = useState<ShopItem[]>(DEFAULT_SHOP_CATALOG);
  const [walletGold, setWalletGold] = useState<number>(0);
  const [walletGems, setWalletGems] = useState<number>(0);
  const [ownedItemIds, setOwnedItemIds] = useState<string[]>([]);
  const [homeSlots, setHomeSlots] = useState<(string | null)[]>([null, null, null]);
  const [vaultSlots, setVaultSlots] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Real-time subscription to `shop_items` collection
  useEffect(() => {
    const colRef = collection(db, 'shop_items');
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        if (snap.empty) {
          setCatalog(DEFAULT_SHOP_CATALOG);
          return;
        }
        const remoteMap = new Map<string, Partial<ShopItem>>();
        const remoteIds = new Set<string>();
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const id = String(d.item_id || docSnap.id);
          remoteIds.add(id);
          remoteMap.set(id, {
            item_id: id,
            item_name: typeof d.item_name === 'string' ? d.item_name : undefined,
            category: d.category as ItemCategory | undefined,
            tier: d.tier as ItemTier | undefined,
            price_gold: typeof d.price_gold === 'number' ? d.price_gold : undefined,
            price_gems: typeof d.price_gems === 'number' ? d.price_gems : undefined,
            image_url: typeof d.image_url === 'string' ? d.image_url : undefined,
          });
        });

        void ensureFirestoreShopCatalogSynced(remoteIds);

        const merged: ShopItem[] = DEFAULT_SHOP_CATALOG.map((seed) => {
          const remote = remoteMap.get(seed.item_id);
          if (!remote) return seed;
          const rGold = remote.price_gold ?? seed.price_gold;
          const rGems = remote.price_gems ?? seed.price_gems;
          return {
            ...seed,
            item_name: remote.item_name || seed.item_name,
            category: remote.category || seed.category,
            tier: remote.tier || seed.tier,
            price_gold: rGold > 0 || rGems > 0 ? rGold : seed.price_gold,
            price_gems: rGold > 0 || rGems > 0 ? rGems : seed.price_gems,
            image_url: remote.image_url || seed.image_url,
          };
        });

        // Include any extra custom items added to Firestore beyond the 56 defaults
        let extraSort = DEFAULT_SHOP_CATALOG.length + 1;
        remoteMap.forEach((remote, id) => {
          if (!merged.some((m) => m.item_id === id) && remote.item_name && remote.image_url) {
            merged.push({
              item_id: id,
              item_name: remote.item_name,
              category: remote.category || 'star',
              tier: remote.tier || 'Special',
              price_gold: remote.price_gold ?? 1000,
              price_gems: remote.price_gems ?? 0,
              image_url: remote.image_url,
              sortOrder: extraSort++,
            });
          }
        });

        merged.sort((a, b) => a.sortOrder - b.sortOrder);
        setCatalog(merged);
      },
      () => {
        setCatalog(DEFAULT_SHOP_CATALOG);
      }
    );

    return () => unsub();
  }, []);

  // 2. Real-time subscription to `/users/{userId}`
  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const bindActiveUserSubscription = (user = auth.currentUser) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      const activeId = resolveActiveUserId(user);
      setUserId(activeId);
      setDisplayName(resolveDisplayNameFromUser(user));

      const userDocRef = doc(db, 'users', activeId);
      unsubUser = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (typeof data.username === 'string' && data.username.trim()) {
              setDisplayName(resolveDisplayNameFromUser(user, data.username));
            }
            const gold = Number(data.gold ?? data.wallet?.gold ?? 0) || 0;
            const gems = Number(data.gems ?? data.wallet?.gems ?? 0) || 0;
            setWalletGold(gold);
            setWalletGems(gems);

            const rawInv = Array.isArray(data.vault_inventory)
              ? data.vault_inventory
              : Array.isArray(data.showcase_data?.vault_inventory)
              ? data.showcase_data.vault_inventory
              : [];
            const filteredOwned: string[] = (rawInv as unknown[]).filter(
              (x: unknown): x is string => typeof x === 'string' && x.length > 0
            );
            const uniqueOwned = Array.from(new Set<string>(filteredOwned));
            setOwnedItemIds(uniqueOwned);

            const rawHome = data.home_slots ?? data.showcase_data?.home_slots;
            const rawVault = data.equipped_vault_slots ?? data.showcase_data?.equipped_vault_slots;

            const deduped = enforceUniquePlacements(
              normalizeHomeSlots(rawHome),
              normalizeVaultSlots(rawVault)
            );
            setHomeSlots(deduped.homeSlots);
            setVaultSlots(deduped.vaultSlots);
          } else {
            setWalletGold(0);
            setWalletGems(0);
            setOwnedItemIds([]);
            setHomeSlots([null, null, null]);
            setVaultSlots({});
          }
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
        }
      );
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      bindActiveUserSubscription(user);
    });

    const handleSessionChange = () => {
      bindActiveUserSubscription(auth.currentUser);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    }

    return () => {
      unsubAuth();
      if (typeof window !== 'undefined') {
        window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      }
      if (unsubUser) unsubUser();
    };
  }, []);

  const catalogMap: Record<string, ShopItem> = {};
  for (const item of catalog) {
    catalogMap[item.item_id] = item;
  }

  return {
    userId,
    displayName,
    catalog,
    catalogMap,
    walletGold,
    walletGems,
    ownedItemIds,
    homeSlots,
    vaultSlots,
    isLoading,
  };
}
