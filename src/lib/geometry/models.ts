// src/lib/geometry/models.ts

export type GeometryYearLevel = 3;

export type GeometryTopic = 'geometry';

export type GeometrySubtopic = '2d-shapes' | 'angles' | 'symmetry';

export type GeometryDifficulty = 1 | 2 | 3;

export type GeometryProblemType = 'multiple-choice' | 'input';

export type GeometryShapeName = 'square' | 'rectangle' | 'triangle' | 'circle' | 'pentagon' | 'hexagon';

export type GeometryDiagramShapeType = GeometryShapeName | 'right-angle-corner' | 'angle-compare';

export type GeometrySymmetryLine = {
  orientation: 'vertical' | 'horizontal';
  // Normalized coordinates in [0,1] relative to diagram width/height.
  at: number;
};

export type GeometryDiagram = {
  shapeType: GeometryDiagramShapeType;
  width: number;
  height: number;
  symmetryLines?: GeometrySymmetryLine[];

  // Optional generic points (normalized) for consumer rendering.
  // Used for polygons/angles if needed later.
  points?: Array<{ x: number; y: number }>;

  // Small optional hint flags for consumer renderers.
  data?: Record<string, unknown>;
};

export interface GeometryOption {
  id: string;
  text: string;
}

export interface GeometryAnswer {
  // For MCQ we store the chosen option id; for input we store an integer string.
  kind: GeometryProblemType;
  value: string;
}

export interface GeometryMetadata {
  topic: GeometryTopic;
  subtopic: GeometrySubtopic;
  difficulty: GeometryDifficulty;
  yearLevel: GeometryYearLevel;

  // Helps avoid repeating the same pattern in a page.
  templateKey: string;
}

export interface GeometryProblem {
  id: string;
  questionText: string;
  diagram?: GeometryDiagram;
  type: GeometryProblemType;

  options?: GeometryOption[];
  correctAnswer: GeometryAnswer;
  explanation: string;
  marks: 1;

  metadata: GeometryMetadata;
}

export interface GeometryPage {
  seed: number;
  problems: GeometryProblem[];
}
