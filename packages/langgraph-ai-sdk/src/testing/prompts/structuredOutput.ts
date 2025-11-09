import { z } from "zod";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { renderPrompt } from './renderPrompt';

export interface StructuredOutputProps {
  schema: z.ZodSchema;
  tag?: string;
}

export const structuredOutputPrompt = async ({ schema, tag = "structured-output" }: StructuredOutputProps): Promise<string> => {
  const parser = StructuredOutputParser.fromZodSchema(schema);
  return renderPrompt(`
    <${tag}>
      ${parser.getFormatInstructions()}
    </${tag}>
  `);
};