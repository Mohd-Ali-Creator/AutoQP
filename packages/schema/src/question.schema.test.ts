import { describe, it, expect } from "vitest";
import {
  questionSchema,
  mcqQuestionSchema,
  numericalQuestionSchema,
  longAnswerQuestionSchema,
  stagingQuestionSchema,
  paperQuestionSchema,
  parseQuestion,
  parseStagingQuestion,
  difficultySchema,
  userRoleSchema,
  stagingSourceSchema,
  paperStatusSchema,
} from "./question.schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE = {
  id: "00000000-0000-0000-0000-000000000001",
  subjectId: "00000000-0000-0000-0000-000000000002",
  topicId: "00000000-0000-0000-0000-000000000003",
  difficulty: "medium" as const,
  marks: 4,
  text: "What is the time complexity of Dijkstra's algorithm using a min-heap?",
  imageRefs: [],
};

const VALID_MCQ = {
  ...BASE,
  type: "mcq" as const,
  typeData: {
    options: [
      { id: "a", text: "O(V²)" },
      { id: "b", text: "O((V + E) log V)" },
      { id: "c", text: "O(E log V)" },
      { id: "d", text: "O(V log E)" },
    ],
    correctOptionId: "b",
  },
};

const VALID_NUMERICAL = {
  ...BASE,
  type: "numerical" as const,
  typeData: { expectedValue: 42, tolerance: 0.5 },
};

const VALID_LONG_ANSWER = {
  ...BASE,
  type: "long_answer" as const,
  typeData: { solution: "Dijkstra's algorithm runs in O((V + E) log V) …" },
};

// ─── Enum schemas ─────────────────────────────────────────────────────────────

describe("enum schemas", () => {
  it("difficultySchema accepts valid values", () => {
    expect(difficultySchema.parse("easy")).toBe("easy");
    expect(difficultySchema.parse("medium")).toBe("medium");
    expect(difficultySchema.parse("hard")).toBe("hard");
  });

  it("difficultySchema rejects invalid values", () => {
    expect(() => difficultySchema.parse("extreme")).toThrow();
  });

  it("userRoleSchema accepts instructor and admin", () => {
    expect(userRoleSchema.parse("instructor")).toBe("instructor");
    expect(userRoleSchema.parse("admin")).toBe("admin");
  });

  it("stagingSourceSchema accepts all three sources", () => {
    expect(stagingSourceSchema.parse("ai_generated")).toBe("ai_generated");
    expect(stagingSourceSchema.parse("ocr_extracted")).toBe("ocr_extracted");
    expect(stagingSourceSchema.parse("manual")).toBe("manual");
  });

  it("paperStatusSchema accepts draft, compiled, archived", () => {
    expect(paperStatusSchema.parse("draft")).toBe("draft");
    expect(paperStatusSchema.parse("compiled")).toBe("compiled");
    expect(paperStatusSchema.parse("archived")).toBe("archived");
  });
});

// ─── MCQ question ─────────────────────────────────────────────────────────────

describe("mcqQuestionSchema", () => {
  it("parses a valid MCQ question", () => {
    const result = mcqQuestionSchema.parse(VALID_MCQ);
    expect(result.type).toBe("mcq");
    expect(result.typeData.correctOptionId).toBe("b");
  });

  it("rejects MCQ with fewer than 2 options", () => {
    const bad = {
      ...VALID_MCQ,
      typeData: { options: [{ id: "a", text: "Only one" }], correctOptionId: "a" },
    };
    expect(() => mcqQuestionSchema.parse(bad)).toThrow(/at least two options/);
  });

  it("rejects MCQ where correctOptionId does not match any option id", () => {
    const bad = {
      ...VALID_MCQ,
      typeData: { ...VALID_MCQ.typeData, correctOptionId: "z" },
    };
    expect(() => mcqQuestionSchema.parse(bad)).toThrow(
      /correctOptionId must match/
    );
  });

  it("rejects empty question text", () => {
    expect(() =>
      mcqQuestionSchema.parse({ ...VALID_MCQ, text: "" })
    ).toThrow(/cannot be empty/);
  });

  it("rejects non-positive marks", () => {
    expect(() =>
      mcqQuestionSchema.parse({ ...VALID_MCQ, marks: 0 })
    ).toThrow();
    expect(() =>
      mcqQuestionSchema.parse({ ...VALID_MCQ, marks: -2 })
    ).toThrow();
  });

  it("accepts topicId as null", () => {
    const result = mcqQuestionSchema.parse({ ...VALID_MCQ, topicId: null });
    expect(result.topicId).toBeNull();
  });
});

// ─── Numerical question ───────────────────────────────────────────────────────

describe("numericalQuestionSchema", () => {
  it("parses a valid numerical question", () => {
    const result = numericalQuestionSchema.parse(VALID_NUMERICAL);
    expect(result.typeData.expectedValue).toBe(42);
    expect(result.typeData.tolerance).toBe(0.5);
  });

  it("parses without tolerance (optional)", () => {
    const result = numericalQuestionSchema.parse({
      ...VALID_NUMERICAL,
      typeData: { expectedValue: 9.81 },
    });
    expect(result.typeData.tolerance).toBeUndefined();
  });

  it("rejects negative tolerance", () => {
    expect(() =>
      numericalQuestionSchema.parse({
        ...VALID_NUMERICAL,
        typeData: { expectedValue: 1, tolerance: -0.1 },
      })
    ).toThrow();
  });
});

// ─── Long-answer question ─────────────────────────────────────────────────────

describe("longAnswerQuestionSchema", () => {
  it("parses a valid long-answer question", () => {
    const result = longAnswerQuestionSchema.parse(VALID_LONG_ANSWER);
    expect(result.typeData.solution).toContain("Dijkstra");
  });

  it("rejects empty solution", () => {
    expect(() =>
      longAnswerQuestionSchema.parse({
        ...VALID_LONG_ANSWER,
        typeData: { solution: "" },
      })
    ).toThrow();
  });
});

// ─── Discriminated union ──────────────────────────────────────────────────────

describe("questionSchema (discriminated union)", () => {
  it("routes mcq to the correct branch", () => {
    const q = questionSchema.parse(VALID_MCQ);
    expect(q.type).toBe("mcq");
  });

  it("routes numerical to the correct branch", () => {
    const q = questionSchema.parse(VALID_NUMERICAL);
    expect(q.type).toBe("numerical");
  });

  it("routes long_answer to the correct branch", () => {
    const q = questionSchema.parse(VALID_LONG_ANSWER);
    expect(q.type).toBe("long_answer");
  });

  it("rejects an unknown type", () => {
    expect(() =>
      questionSchema.parse({ ...BASE, type: "essay", typeData: {} })
    ).toThrow();
  });

  it("accepts optional audit fields when present", () => {
    const q = questionSchema.parse({
      ...VALID_MCQ,
      version: 3,
      createdBy: "00000000-0000-0000-0000-000000000099",
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    expect(q.version).toBe(3);
  });
});

// ─── parseQuestion helper ─────────────────────────────────────────────────────

describe("parseQuestion", () => {
  it("returns the parsed question on valid input", () => {
    expect(parseQuestion(VALID_MCQ).type).toBe("mcq");
  });

  it("throws ZodError on invalid input", () => {
    expect(() => parseQuestion({ type: "mcq" })).toThrow();
  });
});

// ─── stagingQuestionSchema ────────────────────────────────────────────────────

describe("stagingQuestionSchema", () => {
  it("accepts a minimal staging draft (most fields absent)", () => {
    const draft = {
      id: "00000000-0000-0000-0000-000000000010",
      subjectId: "00000000-0000-0000-0000-000000000002",
      source: "ai_generated" as const,
      createdBy: "00000000-0000-0000-0000-000000000099",
    };
    const result = parseStagingQuestion(draft);
    expect(result.source).toBe("ai_generated");
    expect(result.type).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
  });

  it("accepts a fully-populated staging draft", () => {
    const full = {
      id: "00000000-0000-0000-0000-000000000010",
      subjectId: "00000000-0000-0000-0000-000000000002",
      topicId: "00000000-0000-0000-0000-000000000003",
      type: "mcq",
      difficulty: "easy" as const,
      marks: 2,
      text: "Which sorting algorithm is stable?",
      imageRefs: [],
      typeData: { options: [], correctOptionId: "" },
      source: "manual" as const,
      confidenceScore: 0.95,
      createdBy: "00000000-0000-0000-0000-000000000099",
    };
    const result = parseStagingQuestion(full);
    expect(result.marks).toBe(2);
    expect(result.confidenceScore).toBe(0.95);
  });

  it("rejects a staging draft with an invalid source", () => {
    expect(() =>
      parseStagingQuestion({
        id: "00000000-0000-0000-0000-000000000010",
        subjectId: "00000000-0000-0000-0000-000000000002",
        source: "copy_paste",
        createdBy: "00000000-0000-0000-0000-000000000099",
      })
    ).toThrow();
  });
});

// ─── paperQuestionSchema ──────────────────────────────────────────────────────

describe("paperQuestionSchema", () => {
  it("accepts a valid paper question with a frozen snapshot", () => {
    const pq = {
      id: "00000000-0000-0000-0000-000000000020",
      paperId: "00000000-0000-0000-0000-000000000030",
      sectionId: "00000000-0000-0000-0000-000000000040",
      orderIndex: 0,
      marksUsed: 4,
      questionSnapshot: VALID_MCQ,
    };
    const result = paperQuestionSchema.parse(pq);
    expect(result.questionSnapshot.type).toBe("mcq");
  });

  it("rejects a paper question with an invalid snapshot", () => {
    const pq = {
      id: "00000000-0000-0000-0000-000000000020",
      paperId: "00000000-0000-0000-0000-000000000030",
      sectionId: "00000000-0000-0000-0000-000000000040",
      orderIndex: 0,
      marksUsed: 4,
      // snapshot is missing required fields — simulates a corrupt snapshot
      questionSnapshot: { type: "mcq", text: "incomplete" },
    };
    expect(() => paperQuestionSchema.parse(pq)).toThrow();
  });

  it("accepts null sourceQuestionId (original bank question was deleted)", () => {
    const pq = {
      id: "00000000-0000-0000-0000-000000000020",
      paperId: "00000000-0000-0000-0000-000000000030",
      sectionId: "00000000-0000-0000-0000-000000000040",
      orderIndex: 0,
      marksUsed: 4,
      sourceQuestionId: null,
      questionSnapshot: VALID_LONG_ANSWER,
    };
    const result = paperQuestionSchema.parse(pq);
    expect(result.sourceQuestionId).toBeNull();
  });
});
