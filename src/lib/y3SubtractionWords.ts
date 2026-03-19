// src/lib/y3SubtractionWords.ts

export type Difficulty = "easy" | "medium" | "hard";

export type WordSubCategory =
  | "takeaway"
  | "compare_more"
  | "compare_fewer"
  | "remaining"
  | "missing_start"
  | "went_away";

export type WordSubProblem = {
  id: string;
  kind: "word";
  category: WordSubCategory;
  difficulty: Difficulty;
  text: string;
  answer: number;
  meta: {
    nameA: string;
    nameB?: string;
    item: string;
    A: number;
    B: number;
    result: number;
  };
};

// Context system
type ItemGroup = "food" | "stationery" | "toys" | "money" | "sports" | "books";

type Item = {
  plural: string;
  group: ItemGroup;
  containerPhrases: string[];
};

type Action = {
  verbPast: string;
  phrase: string;
  allowedGroups: ItemGroup[];
};

// Utility functions
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(): string {
  return crypto.randomUUID();
}

function itemWord(count: number, plural: string): string {
  if (count === 1) {
    return plural.endsWith("s") ? plural.slice(0, -1) : plural;
  }
  return plural;
}

// Data pools
const NAMES = [
  "Alex", "Sam", "Jamie", "Taylor", "Jordan", "Casey", "Morgan", "Riley",
  "Emma", "Liam", "Olivia", "Noah", "Sophia", "Mason", "Isabella", "Lucas",
  "Ava", "Ethan", "Mia", "Jackson", "Charlotte", "Aiden", "Harper", "Sebastian"
];

const ITEMS: Item[] = [
  { plural: "apples", group: "food", containerPhrases: ["in a basket", "in the fridge", "on the table"] },
  { plural: "oranges", group: "food", containerPhrases: ["in a bowl", "in the bag", "on the counter"] },
  { plural: "cookies", group: "food", containerPhrases: ["in a jar", "in a box", "on a plate"] },
  { plural: "candies", group: "food", containerPhrases: ["in a bag", "in a bowl", "in a jar"] },
  { plural: "grapes", group: "food", containerPhrases: ["in a bowl", "in a bunch", "on the table"] },
  
  { plural: "pencils", group: "stationery", containerPhrases: ["in a pencil case", "in a jar", "on the desk"] },
  { plural: "crayons", group: "stationery", containerPhrases: ["in a box", "in a cup", "on the table"] },
  { plural: "erasers", group: "stationery", containerPhrases: ["in a box", "in a drawer", "on the desk"] },
  { plural: "stickers", group: "stationery", containerPhrases: ["on a sheet", "in a book", "in a box"] },
  { plural: "markers", group: "stationery", containerPhrases: ["in a box", "in a case", "on the desk"] },
  
  { plural: "marbles", group: "toys", containerPhrases: ["in a bag", "in a box", "on the floor"] },
  { plural: "blocks", group: "toys", containerPhrases: ["in a box", "on the table", "on the floor"] },
  { plural: "cards", group: "toys", containerPhrases: ["in a deck", "in a pile", "on the table"] },
  { plural: "toys", group: "toys", containerPhrases: ["in a box", "in a bag", "on the shelf"] },
  { plural: "balls", group: "toys", containerPhrases: ["in a bin", "on the field", "in the gym"] },
  
  { plural: "coins", group: "money", containerPhrases: ["in a jar", "in a wallet", "in a piggy bank"] },
  { plural: "dollars", group: "money", containerPhrases: ["in a wallet", "in an envelope", "in a purse"] },
  
  { plural: "books", group: "books", containerPhrases: ["on a shelf", "in a bag", "on the desk"] },
  { plural: "magazines", group: "books", containerPhrases: ["in a pile", "on a table", "in a rack"] },
  
  { plural: "points", group: "sports", containerPhrases: ["in the game", "on the scoreboard", "in total"] }
];

const ACTIONS: Action[] = [
  { verbPast: "ate", phrase: "ate", allowedGroups: ["food"] },
  { verbPast: "drank", phrase: "drank", allowedGroups: ["food"] },
  { verbPast: "gave away", phrase: "gave away", allowedGroups: ["food", "stationery", "toys", "books", "money"] },
  { verbPast: "used", phrase: "used", allowedGroups: ["stationery", "toys", "money"] },
  { verbPast: "spent", phrase: "spent", allowedGroups: ["money"] },
  { verbPast: "lost", phrase: "lost", allowedGroups: ["food", "stationery", "toys", "books", "money", "sports"] },
  { verbPast: "sold", phrase: "sold", allowedGroups: ["food", "stationery", "toys", "books"] },
  { verbPast: "broke", phrase: "broke", allowedGroups: ["toys", "stationery"] },
  { verbPast: "read", phrase: "read", allowedGroups: ["books"] },
  { verbPast: "borrowed", phrase: "borrowed", allowedGroups: ["books", "toys", "stationery"] }
];

// Recent history cache
let recentPairs: Array<{name: string, item: string}> = [];
const MAX_RECENT = 10;

function getCompatibleItems(category: WordSubCategory): Item[] {
  switch (category) {
    case "takeaway":
    case "remaining":
    case "missing_start":
    case "went_away":
      return ITEMS; // All items can be used with actions
    case "compare_more":
    case "compare_fewer":
      return ITEMS.filter(item => 
        ["stationery", "toys", "money", "books", "sports"].includes(item.group)
      ); // Avoid food for comparison as it's usually eaten, not owned long-term
    default:
      return ITEMS;
  }
}

function getCompatibleActions(item: Item, category: WordSubCategory): Action[] {
  const actions = ACTIONS.filter(action => action.allowedGroups.includes(item.group));
  
  // Additional filtering by category
  switch (category) {
    case "compare_more":
    case "compare_fewer":
      return []; // No actions needed for comparison
    default:
      return actions;
  }
}

function getUniqueItemContext(category: WordSubCategory): {nameA: string, nameB: string, item: Item, action?: Action} {
  let attempts = 0;
  let nameA: string, nameB: string, item: Item, action: Action | undefined;
  
  do {
    nameA = pick(NAMES);
    nameB = pick(NAMES.filter(n => n !== nameA));
    const compatibleItems = getCompatibleItems(category);
    item = pick(compatibleItems);
    
    const actions = getCompatibleActions(item, category);
    action = actions.length > 0 ? pick(actions) : undefined;
    
    attempts++;
  } while (
    attempts < 20 && 
    recentPairs.some(p => p.name === nameA && p.item === item.plural)
  );
  
  recentPairs.push({name: nameA, item: item.plural});
  if (recentPairs.length > MAX_RECENT) {
    recentPairs.shift();
  }
  
  return {nameA, nameB, item, action};
}

// Number ranges by difficulty
function getNumberRange(difficulty: Difficulty): {minA: number, maxA: number} {
  switch (difficulty) {
    case "easy":
      return {minA: 10, maxA: 50};
    case "medium":
      return {minA: 20, maxA: 99};
    case "hard":
      return {minA: 100, maxA: 999};
  }
}

// Template functions
const TEMPLATES = {
  takeaway: [
    (params: any) => `${params.nameA} had ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}. How many ${itemWord(params.result, params.item.plural)} does ${params.nameA} have left?`,
    (params: any) => `There were ${params.A} ${itemWord(params.A, params.item.plural)} ${pick(params.item.containerPhrases)}. ${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}. How many ${itemWord(params.result, params.item.plural)} are left?`,
    (params: any) => `${params.nameA} started with ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}. How many ${itemWord(params.result, params.item.plural)} remain?`
  ],
  
  remaining: [
    (params: any) => `${params.nameA} had ${params.A} ${itemWord(params.A, params.item.plural)}. After ${params.action.phrase === 'ate' ? 'eating' : params.action.phrase === 'used' ? 'using' : params.action.phrase === 'spent' ? 'spending' : params.action.phrase === 'lost' ? 'losing' : params.action.phrase === 'gave away' ? 'giving away' : params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}, how many ${itemWord(params.result, params.item.plural)} does ${params.nameA} have left?`,
    (params: any) => `The container had ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.B} ${itemWord(params.B, params.item.plural)} were ${params.action.phrase === 'gave away' ? 'given away' : params.action.phrase === 'ate' ? 'eaten' : params.action.phrase === 'used' ? 'used' : params.action.phrase === 'lost' ? 'lost' : params.action.phrase === 'sold' ? 'sold' : 'taken'}. How many ${itemWord(params.result, params.item.plural)} remain?`,
    (params: any) => `${params.nameA} collected ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}. How many ${itemWord(params.result, params.item.plural)} are left?`
  ],
  
  compare_more: [
    (params: any) => `${params.nameA} has ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.nameB} has ${params.B} ${itemWord(params.B, params.item.plural)}. How many more ${itemWord(params.result, params.item.plural)} does ${params.nameA} have than ${params.nameB}?`,
    (params: any) => `There are ${params.A} ${itemWord(params.A, params.item.plural)} in the red box and ${params.B} ${itemWord(params.B, params.item.plural)} in the blue box. How many more ${itemWord(params.result, params.item.plural)} are in the red box?`,
    (params: any) => `${params.nameA} scored ${params.A} ${params.item.group === 'sports' ? itemWord(params.A, params.item.plural) : itemWord(params.A, params.item.plural)} and ${params.nameB} scored ${params.B} ${params.item.group === 'sports' ? itemWord(params.B, params.item.plural) : itemWord(params.B, params.item.plural)}. How many more did ${params.nameA} score?`
  ],
  
  compare_fewer: [
    (params: any) => `${params.nameA} has ${params.A} ${itemWord(params.A, params.item.plural)}. ${params.nameB} has ${params.B} ${itemWord(params.B, params.item.plural)}. How many fewer ${itemWord(params.result, params.item.plural)} does ${params.nameB} have than ${params.nameA}?`,
    (params: any) => `The first group has ${params.A} ${itemWord(params.A, params.item.plural)} and the second group has ${params.B} ${itemWord(params.B, params.item.plural)}. How many fewer ${itemWord(params.result, params.item.plural)} does the second group have?`,
    (params: any) => `${params.nameA} collected ${params.A} ${itemWord(params.A, params.item.plural)} and ${params.nameB} collected ${params.B} ${itemWord(params.B, params.item.plural)}. How many fewer ${itemWord(params.result, params.item.plural)} did ${params.nameB} collect?`
  ],
  
  missing_start: [
    (params: any) => `${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)} and now has ${params.result} ${itemWord(params.result, params.item.plural)} left. How many ${itemWord(params.A, params.item.plural)} did ${params.nameA} have at first?`,
    (params: any) => `After ${params.action.phrase === 'used' ? 'using' : params.action.phrase === 'gave away' ? 'giving away' : params.action.phrase === 'ate' ? 'eating' : params.action.phrase === 'spent' ? 'spending' : params.action.phrase === 'lost' ? 'losing' : params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)}, ${params.nameA} has ${params.result} ${itemWord(params.result, params.item.plural)} left. How many ${itemWord(params.A, params.item.plural)} did ${params.nameA} start with?`,
    (params: any) => `${params.nameA} ${params.action.phrase} ${params.B} ${itemWord(params.B, params.item.plural)} and now has ${params.result} ${itemWord(params.result, params.item.plural)}. How many ${itemWord(params.A, params.item.plural)} did ${params.nameA} have originally?`
  ],
  
  went_away: [
    (params: any) => `${params.nameA} had ${params.A} ${itemWord(params.A, params.item.plural)}. Some ${itemWord(params.B, params.item.plural)} went missing and now ${params.nameA} has ${params.result} ${itemWord(params.result, params.item.plural)}. How many ${itemWord(params.B, params.item.plural)} went missing?`,
    (params: any) => `There were ${params.A} ${itemWord(params.A, params.item.plural)} ${pick(params.item.containerPhrases)}. Some were ${params.action ? (params.action.phrase === 'ate' ? 'eaten' : params.action.phrase === 'used' ? 'used' : params.action.phrase === 'lost' ? 'lost' : params.action.phrase === 'sold' ? 'sold' : 'taken') : 'taken'} and ${params.result} ${itemWord(params.result, params.item.plural)} remained. How many were ${params.action ? (params.action.phrase === 'ate' ? 'eaten' : params.action.phrase === 'used' ? 'used' : params.action.phrase === 'lost' ? 'lost' : params.action.phrase === 'sold' ? 'sold' : 'taken') : 'taken'}?`,
    (params: any) => `${params.nameA} started with ${params.A} ${itemWord(params.A, params.item.plural)}. At the end of the day, ${params.nameA} had ${params.result} ${itemWord(params.result, params.item.plural)}. How many ${itemWord(params.B, params.item.plural)} were used during the day?`
  ]
};

// Parameter generation and validation
function buildParams(category: WordSubCategory, difficulty: Difficulty) {
  const {minA, maxA} = getNumberRange(difficulty);
  const {nameA, nameB, item, action} = getUniqueItemContext(category);
  
  let A: number, B: number, result: number, answer: number;
  
  switch (category) {
    case "takeaway":
    case "remaining":
      A = randInt(minA, maxA);
      B = randInt(1, A - 1);
      result = A - B;
      answer = result;
      break;
      
    case "compare_more":
    case "compare_fewer":
      A = randInt(minA, maxA);
      B = randInt(1, A - 1);
      result = A - B;
      answer = result;
      break;
      
    case "missing_start":
      result = randInt(1, maxA - minA);
      B = randInt(1, minA);
      A = result + B;
      answer = A;
      break;
      
    case "went_away":
      A = randInt(minA, maxA);
      result = randInt(1, A - 1);
      B = A - result;
      answer = B;
      break;
      
    default:
      throw new Error(`Unknown category: ${category}`);
  }
  
  return {
    nameA,
    nameB,
    item,
    action,
    A,
    B,
    result,
    answer,
    category,
    difficulty
  };
}

function generateText(category: WordSubCategory, params: any): string {
  const templates = TEMPLATES[category];
  const template = pick(templates);
  return template(params);
}

function validateTextSemantics(text: string, item: Item): boolean {
  const forbiddenCombos = [
    { pattern: /pencils? were eaten/i, reason: "pencils cannot be eaten" },
    { pattern: /erasers? were eaten/i, reason: "erasers cannot be eaten" },
    { pattern: /crayons? were eaten/i, reason: "crayons cannot be eaten" },
    { pattern: /markers? were eaten/i, reason: "markers cannot be eaten" },
    { pattern: /stickers? were eaten/i, reason: "stickers cannot be eaten" },
    { pattern: /toys? were eaten/i, reason: "toys cannot be eaten" },
    { pattern: /books? were eaten/i, reason: "books cannot be eaten" },
    { pattern: /coins? were eaten/i, reason: "coins cannot be eaten" },
    { pattern: /dollars? were eaten/i, reason: "money cannot be eaten" },
    { pattern: /marbles? were eaten/i, reason: "marbles cannot be eaten" },
    { pattern: /blocks? were eaten/i, reason: "blocks cannot be eaten" },
    { pattern: /cards? were eaten/i, reason: "cards cannot be eaten" },
    { pattern: /points? were eaten/i, reason: "points cannot be eaten" },
    { pattern: /oranges? for art class/i, reason: "food not used for art" },
    { pattern: /apples? for art class/i, reason: "food not used for art" },
    { pattern: /cookies? for art class/i, reason: "food not used for art" },
    { pattern: /\d+ [a-z]+s ([a-z])/i, check: (match: string) => {
      const parts = match.match(/(\d+) ([a-z]+s) /);
      return parts && parts[1] === "1" && parts[2].endsWith("s");
    }, reason: "singular form needed for count 1" }
  ];
  
  for (const combo of forbiddenCombos) {
    if (combo.pattern.test(text)) {
      if (combo.check) {
        const match = text.match(combo.pattern);
        if (match && combo.check(match[0])) {
          return false;
        }
      } else {
        return false;
      }
    }
  }
  
  return true;
}

function validate(problem: WordSubProblem): boolean {
  const {meta, answer, category, text} = problem;
  
  // Basic validation
  if (!Number.isInteger(answer) || answer < 0) return false;
  if (!Number.isInteger(meta.A) || !Number.isInteger(meta.B) || !Number.isInteger(meta.result)) return false;
  if (meta.A < 0 || meta.B < 0 || meta.result < 0) return false;
  
  // Text validation
  if (!text.endsWith('?')) return false;
  
  const item = ITEMS.find(i => i.plural === meta.item);
  if (!item) return false;
  
  if (!validateTextSemantics(text, item)) return false;
  
  // Category-specific validation
  switch (category) {
    case "takeaway":
    case "remaining":
      return meta.A > meta.B && meta.result === meta.A - meta.B && answer === meta.result;
      
    case "compare_more":
    case "compare_fewer":
      return meta.A > meta.B && meta.result === meta.A - meta.B && answer === meta.result;
      
    case "missing_start":
      return meta.A === meta.result + meta.B && answer === meta.A;
      
    case "went_away":
      return meta.A > meta.result && meta.B === meta.A - meta.result && answer === meta.B;
      
    default:
      return false;
  }
}

export function generateWordSubProblem(difficulty: Difficulty): WordSubProblem {
  const categories: WordSubCategory[] = [
    "takeaway", "compare_more", "compare_fewer", 
    "remaining", "missing_start", "went_away"
  ];
  
  let attempts = 0;
  const maxAttempts = 50;
  
  while (attempts < maxAttempts) {
    try {
      const category = pick(categories);
      const params = buildParams(category, difficulty);
      const text = generateText(category, params);
      
      const problem: WordSubProblem = {
        id: uid(),
        kind: "word",
        category,
        difficulty,
        text,
        answer: params.answer,
        meta: {
          nameA: params.nameA,
          nameB: params.nameB,
          item: params.item.plural,
          A: params.A,
          B: params.B,
          result: params.result
        }
      };
      
      if (validate(problem)) {
        return problem;
      }
    } catch (error) {
      // Continue to next attempt
    }
    
    attempts++;
  }
  
  throw new Error(`Failed to generate valid word problem after ${maxAttempts} attempts`);
}

export function __selfTest(n: number = 2000): void {
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];
  
  for (let i = 0; i < n; i++) {
    const difficulty = pick(difficulties);
    const problem = generateWordSubProblem(difficulty);
    
    // Test forbidden phrases
    const forbiddenPatterns = [
      /pencils? were eaten/i,
      /erasers? were eaten/i,
      /crayons? were eaten/i,
      /toys? were eaten/i,
      /books? were eaten/i,
      /coins? were eaten/i,
      /marbles? were eaten/i,
      /oranges? for art class/i,
      /apples? for art class/i,
      /1 [a-z]+s /i
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(problem.text)) {
        throw new Error(`Forbidden phrase found: "${problem.text}"`);
      }
    }
    
    // Test question format
    if (!problem.text.endsWith('?')) {
      throw new Error(`Text must end with ?: "${problem.text}"`);
    }
    
    // Test arithmetic
    const expected = (() => {
      switch (problem.category) {
        case "takeaway":
        case "remaining":
        case "compare_more":
        case "compare_fewer":
          return problem.meta.A - problem.meta.B;
        case "missing_start":
          return problem.meta.result + problem.meta.B;
        case "went_away":
          return problem.meta.A - problem.meta.result;
        default:
          throw new Error(`Unknown category: ${problem.category}`);
      }
    })();
    
    if (problem.answer !== expected) {
      throw new Error(`Answer mismatch: got ${problem.answer}, expected ${expected} for "${problem.text}"`);
    }
  }
  
  console.log(`Self-test passed: ${n} problems generated successfully`);
}