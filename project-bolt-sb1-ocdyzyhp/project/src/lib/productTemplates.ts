/**
 * Ready-made list of Uttarakhand / Himalayan products for the "Quick add" dropdown in Catalog.
 * Picking one pre-fills name, category, description and a SKU. Prices, pack size and stock are
 * always entered by the owner. Edit this list freely: add, remove or reword items.
 */
export interface ProductTemplate {
  code: string; // used to build the SKU (letters, digits, hyphen only)
  name: string;
  category: string;
  description: string;
}

const VEG = 'Dehydrated Vegetables';
const FRUIT = 'Dehydrated Fruits';
const FOREST = 'Himalayan Forest Produce';
const HERB = 'Mountain Herbs';
const POWDER = 'Powders & Seasonings';
const GRAIN = 'Pahadi Grains & Pulses';

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  // Vegetables
  { code: 'POTATO-SLICES', name: 'Dehydrated Potato Slices', category: VEG, description: 'Evenly sliced hill potatoes, electrically dehydrated for long storage. Easy to rehydrate for curries, soups and snacks.' },
  { code: 'TOMATO-SLICES', name: 'Dehydrated Tomato Slices', category: VEG, description: 'Ripe tomatoes sliced and electrically dehydrated. Use in gravies, soups and chutneys.' },
  { code: 'ONION-SLICES', name: 'Dehydrated Onion Slices', category: VEG, description: 'Sliced onions, electrically dehydrated. Convenient for everyday cooking.' },
  { code: 'GREEN-PEAS', name: 'Dehydrated Green Peas (Matar)', category: VEG, description: 'Hill green peas, electrically dehydrated. Soak and cook in pulao, curries and snacks.' },
  { code: 'CARROT-FLAKES', name: 'Dehydrated Carrot Flakes', category: VEG, description: 'Carrot cut into small pieces and electrically dehydrated. Good for soups, pulao and noodles.' },
  { code: 'CABBAGE-FLAKES', name: 'Dehydrated Cabbage Flakes', category: VEG, description: 'Shredded cabbage, electrically dehydrated for easy storage and quick cooking.' },
  { code: 'CAULIFLOWER', name: 'Dehydrated Cauliflower Florets (Gobhi)', category: VEG, description: 'Cauliflower florets, electrically dehydrated. Soak before use in curries and fried rice.' },
  { code: 'SPINACH-FLAKES', name: 'Dehydrated Spinach Flakes (Palak)', category: VEG, description: 'Spinach leaves, washed, cut and electrically dehydrated. Use in dal, paratha and soups.' },
  { code: 'CAPSICUM-FLAKES', name: 'Dehydrated Capsicum Flakes', category: VEG, description: 'Capsicum pieces, electrically dehydrated. Useful for pizza toppings, pulao and stir-fries.' },
  { code: 'GREEN-CHILLI', name: 'Dehydrated Green Chilli Flakes', category: VEG, description: 'Green chilli pieces, electrically dehydrated for long shelf life.' },
  { code: 'PUMPKIN-SLICES', name: 'Dehydrated Pumpkin Slices (Kaddu)', category: VEG, description: 'Pumpkin slices, electrically dehydrated. Rehydrate for sabzi, soup and halwa.' },
  { code: 'LAUKI-SLICES', name: 'Dehydrated Bottle Gourd Slices (Lauki)', category: VEG, description: 'Bottle gourd slices, electrically dehydrated for easy storage.' },
  { code: 'BRINJAL-SLICES', name: 'Dehydrated Brinjal Slices (Baingan)', category: VEG, description: 'Brinjal slices, electrically dehydrated. Soak before cooking.' },
  { code: 'FRENCH-BEANS', name: 'Dehydrated French Beans', category: VEG, description: 'Cut French beans, electrically dehydrated. Use in pulao and mixed vegetables.' },
  { code: 'OKRA-SLICES', name: 'Dehydrated Okra Slices (Bhindi)', category: VEG, description: 'Okra slices, electrically dehydrated for long storage.' },
  { code: 'RADISH-SLICES', name: 'Dehydrated Radish Slices (Mooli)', category: VEG, description: 'Radish slices, electrically dehydrated. Traditional hill kitchen ingredient.' },
  { code: 'MIXED-VEG', name: 'Dehydrated Mixed Vegetables', category: VEG, description: 'A mix of carrot, peas, beans, cabbage and more, electrically dehydrated. Ready to soak and cook.' },

  // Fruits
  { code: 'APPLE-SLICES', name: 'Dehydrated Himalayan Apple Slices', category: FRUIT, description: 'Crisp apple slices from the hills, electrically dehydrated with no added sugar.' },
  { code: 'PEAR-SLICES', name: 'Dehydrated Pear Slices (Nashpati)', category: FRUIT, description: 'Hill pear slices, electrically dehydrated. Eat as a snack or add to muesli.' },
  { code: 'PEACH-SLICES', name: 'Dehydrated Peach Slices (Aadu)', category: FRUIT, description: 'Peach slices from the hills, electrically dehydrated.' },
  { code: 'PLUM-SLICES', name: 'Dehydrated Plum (Aaru)', category: FRUIT, description: 'Hill plums, electrically dehydrated. Naturally tangy-sweet.' },
  { code: 'APRICOT', name: 'Dehydrated Apricot (Khubani)', category: FRUIT, description: 'Apricots from the hills, electrically dehydrated.' },
  { code: 'MALTA-SLICES', name: 'Dehydrated Pahadi Malta Slices', category: FRUIT, description: 'Tangy Pahadi malta slices, electrically dehydrated. Use in tea, drinks or as a snack.' },
  { code: 'LEMON-SLICES', name: 'Dehydrated Lemon Slices', category: FRUIT, description: 'Lemon slices, electrically dehydrated. Useful for tea and drinks.' },
  { code: 'GALGAL-SLICES', name: 'Dehydrated Galgal (Hill Lemon) Slices', category: FRUIT, description: 'Large Pahadi galgal lemon slices, electrically dehydrated.' },
  { code: 'AMLA-SLICES', name: 'Dehydrated Amla Slices', category: FRUIT, description: 'Amla (Indian gooseberry) slices, electrically dehydrated.' },
  { code: 'KIWI-SLICES', name: 'Dehydrated Kiwi Slices', category: FRUIT, description: 'Kiwi slices, electrically dehydrated.' },
  { code: 'STRAWBERRY', name: 'Dehydrated Strawberry Slices', category: FRUIT, description: 'Strawberry slices, electrically dehydrated.' },
  { code: 'KAFAL', name: 'Dehydrated Kafal Berries', category: FRUIT, description: 'Seasonal Kafal hill berries, electrically dehydrated.' },

  // Himalayan forest produce
  { code: 'BURANSH-PETALS', name: 'Wild Buransh (Rhododendron) Petals', category: FOREST, description: 'Hand-harvested Buransh petals from the Himalayan forests, dried for storage.' },
  { code: 'TIMUR', name: 'Timur (Himalayan Pepper)', category: FOREST, description: 'Aromatic Himalayan Timur pepper with a citrusy, tingling flavour. Used in pahadi chutney and dals.' },
  { code: 'JAKHYA', name: 'Jakhya Seeds', category: FOREST, description: 'Traditional Uttarakhand Jakhya seeds used for tempering dals and sabzis.' },
  { code: 'LINGURA', name: 'Lingura (Fiddlehead Fern)', category: FOREST, description: 'Seasonal Himalayan fiddlehead fern, dried for storage.' },
  { code: 'WILD-HONEY', name: 'Himalayan Wild Honey', category: FOREST, description: 'Honey collected from the hills of Uttarakhand.' },

  // Mountain herbs
  { code: 'TULSI-LEAVES', name: 'Dried Tulsi Leaves', category: HERB, description: 'Tulsi leaves, dried for tea and kadha.' },
  { code: 'NETTLE-LEAVES', name: 'Dried Himalayan Nettle Leaves (Bichhu Buti)', category: HERB, description: 'Himalayan nettle leaves, dried. Used for herbal tea and traditional cooking.' },
  { code: 'LEMONGRASS', name: 'Dried Lemongrass', category: HERB, description: 'Lemongrass, dried for herbal tea.' },
  { code: 'MINT-LEAVES', name: 'Dried Mint Leaves (Pudina)', category: HERB, description: 'Mint leaves, dried for chutney, raita and tea.' },
  { code: 'KASURI-METHI', name: 'Kasuri Methi (Dried Fenugreek Leaves)', category: HERB, description: 'Dried fenugreek leaves for curries, parathas and gravies.' },
  { code: 'CORIANDER-LEAVES', name: 'Dried Coriander Leaves (Dhania Patta)', category: HERB, description: 'Coriander leaves, dried for garnishing and cooking.' },
  { code: 'CURRY-LEAVES', name: 'Dried Curry Leaves', category: HERB, description: 'Curry leaves, dried for tempering.' },
  { code: 'BAY-LEAF', name: 'Tej Patta (Bay Leaf)', category: HERB, description: 'Aromatic bay leaves for pulao, biryani and curries.' },
  { code: 'WILD-THYME', name: 'Pahadi Wild Thyme (Jambu / Faran)', category: HERB, description: 'Traditional Himalayan herb used for tempering dals and vegetables.' },

  // Powders & seasonings
  { code: 'TOMATO-POWDER', name: 'Tomato Powder', category: POWDER, description: 'Fine tomato powder made from dehydrated tomatoes. Adds tomato flavour to gravies, soups and sauces.' },
  { code: 'ONION-POWDER', name: 'Onion Powder', category: POWDER, description: 'Fine powder from dehydrated onions for gravies, marinades and seasoning.' },
  { code: 'GARLIC-POWDER', name: 'Garlic Powder', category: POWDER, description: 'Fine powder from dehydrated garlic for seasoning and cooking.' },
  { code: 'TURMERIC-POWDER', name: 'Turmeric Powder (Haldi)', category: POWDER, description: 'Ground turmeric for everyday cooking.' },
  { code: 'RED-CHILLI-POWDER', name: 'Pahadi Red Chilli Powder', category: POWDER, description: 'Ground red chilli with a rich colour and heat.' },
  { code: 'AMCHUR-POWDER', name: 'Raw Mango Powder (Amchur)', category: POWDER, description: 'Tangy raw mango powder for chaat, curries and chutneys.' },
  { code: 'AMLA-POWDER', name: 'Amla Powder', category: POWDER, description: 'Amla (Indian gooseberry) powder.' },
  { code: 'SPINACH-POWDER', name: 'Spinach Powder (Palak)', category: POWDER, description: 'Fine spinach powder for rotis, soups and smoothies.' },
  { code: 'PAHADI-NAMAK', name: 'Pahadi Namak (Pisyu Loon)', category: POWDER, description: 'Traditional Uttarakhand flavoured salt blend with herbs and spices.' },
  { code: 'GARAM-MASALA', name: 'Garam Masala', category: POWDER, description: 'Aromatic blend of ground whole spices.' },

  // Pahadi grains & pulses
  { code: 'GAHAT', name: 'Gahat (Horse Gram)', category: GRAIN, description: 'Traditional Uttarakhand pulse used for gahat dal and kafuli.' },
  { code: 'BHATT', name: 'Bhatt (Black Soybean)', category: GRAIN, description: 'Traditional pahadi black soybean used in bhatt ki churkani and dal.' },
  { code: 'RAJMA', name: 'Pahadi Rajma', category: GRAIN, description: 'Rajma (kidney beans) grown in the hills of Uttarakhand.' },
  { code: 'MANDUA-FLOUR', name: 'Mandua Flour (Finger Millet)', category: GRAIN, description: 'Finger millet flour for traditional rotis and porridge.' },
  { code: 'JHANGORA', name: 'Jhangora (Barnyard Millet)', category: GRAIN, description: 'Hill barnyard millet, cooked like rice or kheer.' },
  { code: 'CHAULAI', name: 'Chaulai (Amaranth)', category: GRAIN, description: 'Amaranth seeds from the hills, used for laddoos and porridge.' },
  { code: 'KUTTU-FLOUR', name: 'Kuttu Flour (Buckwheat)', category: GRAIN, description: 'Buckwheat flour for rotis, puris and fasting meals.' },
  { code: 'RED-RICE', name: 'Pahadi Red Rice', category: GRAIN, description: 'Traditional red rice grown in the hills of Uttarakhand.' },
];
