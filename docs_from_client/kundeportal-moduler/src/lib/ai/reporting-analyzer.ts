import Anthropic from "@anthropic-ai/sdk";
import type { AiAnalysisResult, ProjectAnalysisContext } from "@/lib/types";
import { ANALYSE_SYSTEM_PROMPT, byggAnalysePrompt } from "./prompts";

// Modellstrengen settes via env slik at dere kan bytte til gjeldende modell
// uten kodeendring. Se docs.claude.com for aktuelle modellnavn.
const MODEL = process.env.REPORTING_AI_MODEL ?? "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tvinger strukturert output via tool use. Schemaet speiler AiAnalysisResult.
const analyseVerktøy: Anthropic.Tool = {
  name: "registrer_rapporteringskrav",
  description:
    "Registrer alle rapporteringskrav for prosjektet, strukturert og klart for lagring.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Kort oppsummering (2–4 setninger) av hva som ble funnet.",
      },
      requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string", enum: ["LAW", "NS_STANDARD", "CONTRACT"] },
            title: { type: "string" },
            description: { type: "string" },
            legalReference: { type: "string" },
            interval: {
              type: "string",
              enum: [
                "ONE_TIME", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY",
                "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "EVENT_BASED", "CUSTOM",
              ],
            },
            intervalDetail: { type: "string" },
            recipientInstance: { type: "string" },
            recipientName: { type: "string" },
            recipientEmail: { type: "string" },
            aiConfidence: { type: "number", minimum: 0, maximum: 1 },
            aiRationale: { type: "string" },
            dataFields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  sourceType: {
                    type: "string",
                    enum: [
                      "PORTAL_MACHINE", "PORTAL_AGREEMENT", "PORTAL_DOCUMENT",
                      "MANUAL_INPUT", "CALCULATED",
                    ],
                  },
                  sourceRef: { type: "string" },
                  availableInPortal: { type: "boolean" },
                  required: { type: "boolean" },
                  note: { type: "string" },
                },
                required: ["label", "sourceType", "availableInPortal", "required"],
              },
            },
          },
          required: [
            "source", "title", "description", "interval",
            "aiConfidence", "aiRationale", "dataFields",
          ],
        },
      },
    },
    required: ["summary", "requirements"],
  },
};

/**
 * Analyserer et prosjekts kontekst og returnerer strukturerte rapporteringskrav.
 * Kaster ved manglende tool-svar slik at API-ruten kan gi ryddig feilmelding.
 */
export async function analyserRapporteringskrav(
  ctx: ProjectAnalysisContext
): Promise<AiAnalysisResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: ANALYSE_SYSTEM_PROMPT,
    tools: [analyseVerktøy],
    tool_choice: { type: "tool", name: "registrer_rapporteringskrav" },
    messages: [{ role: "user", content: byggAnalysePrompt(ctx) }],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );

  if (!toolBlock) {
    throw new Error("AI returnerte ikke strukturert resultat.");
  }

  const result = toolBlock.input as AiAnalysisResult;

  // Lett normalisering: sørg for at arrays finnes.
  return {
    summary: result.summary ?? "",
    requirements: (result.requirements ?? []).map((r) => ({
      ...r,
      dataFields: r.dataFields ?? [],
    })),
  };
}
