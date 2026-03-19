import { generateMultiplicationPage } from './lib/generators/multiplicationGenerator';

test('test runner works', () => {
  const page = generateMultiplicationPage({ difficulty: 'easy', count: 3, seedKey: 'smoke' });
  expect(page.problems).toHaveLength(3);
});
