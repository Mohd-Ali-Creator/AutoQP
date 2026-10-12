import { describe, it, expect } from "vitest";
import {
  snakeToCamel,
  camelToSnake,
  toCamelCase,
  toSnakeCase,
  toCamelCaseRows,
} from "./transform";

describe("transform helpers", () => {
  describe("string conversions", () => {
    it("converts snake_case to camelCase", () => {
      expect(snakeToCamel("subject_id")).toBe("subjectId");
      expect(snakeToCamel("created_at")).toBe("createdAt");
      expect(snakeToCamel("source_question_id")).toBe("sourceQuestionId");
      expect(snakeToCamel("type_data")).toBe("typeData");
    });

    it("converts camelCase to snake_case", () => {
      expect(camelToSnake("subjectId")).toBe("subject_id");
      expect(camelToSnake("createdAt")).toBe("created_at");
      expect(camelToSnake("sourceQuestionId")).toBe("source_question_id");
      expect(camelToSnake("typeData")).toBe("type_data");
    });
  });

  describe("toCamelCase", () => {
    it("transforms top-level snake_case keys to camelCase while preserving JSONB internals", () => {
      const dbRow = {
        id: "123",
        subject_id: "sub-1",
        difficulty: "medium",
        marks: 5,
        type_data: {
          options: [{ id: "opt-1", text: "Choice A" }],
          correctOptionId: "opt-1",
        },
        image_refs: ["path/to/img1.png"],
      };

      const result = toCamelCase<{
        id: string;
        subjectId: string;
        difficulty: string;
        marks: number;
        typeData: {
          options: { id: string; text: string }[];
          correctOptionId: string;
        };
        imageRefs: string[];
      }>(dbRow);

      expect(result).toEqual({
        id: "123",
        subjectId: "sub-1",
        difficulty: "medium",
        marks: 5,
        typeData: {
          options: [{ id: "opt-1", text: "Choice A" }],
          correctOptionId: "opt-1",
        },
        imageRefs: ["path/to/img1.png"],
      });
      // Verifies nested typeData keys (correctOptionId) were NOT altered
      expect(result?.typeData.correctOptionId).toBe("opt-1");
    });

    it("handles null or undefined gracefully", () => {
      expect(toCamelCase(null)).toBeNull();
      expect(toCamelCase(undefined)).toBeNull();
    });
  });

  describe("toSnakeCase", () => {
    it("transforms top-level camelCase keys to snake_case while preserving JSONB internals", () => {
      const appRecord = {
        id: "123",
        subjectId: "sub-1",
        marks: 5,
        typeData: {
          options: [{ id: "opt-1", text: "Choice A" }],
          correctOptionId: "opt-1",
        },
      };

      const result = toSnakeCase(appRecord);
      expect(result).toEqual({
        id: "123",
        subject_id: "sub-1",
        marks: 5,
        type_data: {
          options: [{ id: "opt-1", text: "Choice A" }],
          correctOptionId: "opt-1",
        },
      });
    });
  });

  describe("toCamelCaseRows", () => {
    it("transforms an array of rows", () => {
      const rows = [
        { subject_id: "1", name: "CS101" },
        { subject_id: "2", name: "CS301" },
      ];
      const result = toCamelCaseRows(rows);
      expect(result).toEqual([
        { subjectId: "1", name: "CS101" },
        { subjectId: "2", name: "CS301" },
      ]);
    });
  });
});
