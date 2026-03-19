export type Y3StoryType = 'narrative' | 'informative' | 'letter' | 'article' | 'fantasy';

export type Y3Story = {
  id: string;
  title: string;
  type: Y3StoryType;
  imageUrl?: string;
  altText: string;
  paragraphs: string[];
};

export const Y3_STORIES: Y3Story[] = [
  {
    id: 'rm-y3-001',
    title: 'The Lost Lunchbox',
    type: 'narrative',
    altText: 'A school lunchbox on a bench',
    paragraphs: [
      'On Monday, Mia put her lunchbox in her bag. It was bright yellow and very easy to spot.',
      'At recess, Mia opened her bag and gasped. The lunchbox was gone. She checked again and again.',
      'Mia asked her teacher, Mr Reed, for help. Together they walked to the oval and the library.',
      'Near the bubblers, Mia saw a yellow shape. It was her lunchbox, tucked behind a bin.',
      'A windy gust must have knocked it out. Mia smiled and thanked Mr Reed. Her sandwich was safe.'
    ],
  },
  {
    id: 'rm-y3-002',
    title: 'Wombats at Work',
    type: 'informative',
    altText: 'A wombat digging in the ground',
    paragraphs: [
      'Wombats are strong animals that live in Australia. They have short legs and powerful claws.',
      'A wombat digs a burrow to sleep and stay safe. The burrow can be long and cool inside.',
      'Wombats mostly eat grasses and roots. They come out at dusk when the air feels calmer.',
      'If you see a wombat in the wild, stay quiet and keep your distance. Wombats need space.'
    ],
  },
  {
    id: 'rm-y3-003',
    title: 'Dear Grandma, Guess What!',
    type: 'letter',
    altText: 'A letter with a stamp and a small drawing',
    paragraphs: [
      'Dear Grandma,',
      'Today our class planted seedlings in the garden bed. My plant is a tiny basil sprout.',
      'We labelled our plants with paddle pop sticks. I wrote my name in neat letters.',
      'When the leaves grow bigger, we will pick some for cooking. I hope it smells wonderful.',
        'Love from, Ava'
    ],
  },
  {
    id: 'rm-y3-004',
    title: 'Why Do Leaves Change Colour?',
    type: 'article',
    altText: 'Leaves in green, yellow, and red colours',
    paragraphs: [
      'In some places, trees change colour in autumn. The leaves can turn yellow, orange, or red.',
      'Leaves have a green colour called chlorophyll. It helps the tree use sunlight to make food.',
      'When days get cooler and shorter, the tree makes less chlorophyll. Other colours can show.',
      'After a while, the leaf dries and falls. This helps the tree rest until warmer weather returns.'
    ],
  },
  {
    id: 'rm-y3-005',
    title: 'The Pebble that Glowed',
    type: 'fantasy',
    altText: 'A small glowing pebble near a stream',
    paragraphs: [
      'Kai found a smooth pebble by the creek. It was warm, even in the shade.',
      'That night, the pebble glowed like a tiny lantern. It lit up Kai’s room with soft light.',
      'Kai whispered, “Are you magic?” The pebble flashed once, as if it answered.',
      'The next day, Kai carried it to the creek. The glow pointed to a hidden path of stepping stones.',
      'Kai crossed carefully and discovered a small garden. The pebble dimmed, like its job was done.'
    ],
  },
  {
    id: 'rm-y3-006',
    title: 'A Guide to Safe Sun Time',
    type: 'informative',
    altText: 'A hat, sunscreen, and sunglasses on a towel',
    paragraphs: [
      'Sunny days are great for playing outside. It is important to protect your skin and eyes.',
      'Wear a broad-brimmed hat to shade your face. Use sunscreen and reapply it later.',
      'Try to find shade when the sun feels strong. Drink water to help your body stay cool.',
      'These simple steps help you enjoy sport and games more safely.'
    ],
  },
  {
    id: 'rm-y3-007',
    title: 'The School Library Map',
    type: 'narrative',
    altText: 'A simple map with shelves and a reading corner',
    paragraphs: [
      'Sam loved the school library, but he got lost between the shelves. Every aisle looked the same.',
      'Mrs Tan gave Sam a small map. It showed the shelves, the desk, and the reading corner.',
      'Sam followed the map to the animal books. He found one about sharks and another about ants.',
      'On the way back, Sam used the map again. He reached the desk with a proud grin.',
      'Now Sam helps his friends find books too. The library feels friendly and easy to explore.'
    ],
  },
  {
    id: 'rm-y3-008',
    title: 'How a Sandwich Is Made',
    type: 'article',
    altText: 'A simple sandwich with bread, lettuce, and cheese',
    paragraphs: [
      'A sandwich can be quick to make. You can choose fillings that you enjoy.',
      'First, wash your hands and get two slices of bread. Put them on a clean plate.',
      'Next, add your fillings, like cheese, tomato, or lettuce. Keep the pieces small and neat.',
      'Finally, place the top slice on and press gently. Cut the sandwich in half and eat slowly.'
    ],
  },
];
