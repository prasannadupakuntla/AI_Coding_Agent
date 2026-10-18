import type { MentorRequest, AIProviderType } from './types.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.ts';

export interface AIProvider {
  name: string;
  type: AIProviderType;
  generate(req: MentorRequest, apiKey: string, timeoutMs?: number): Promise<string>;
}

/**
 * Google AI Studio (Gemini) Provider
 * Uses Gemini REST API with minimal token generation config.
 */
export class GoogleAIProvider implements AIProvider {
  name = 'Google AI Studio (Gemini)';
  type: AIProviderType = 'google';
  private model: string;

  constructor(model = process.env.AI_MODEL || 'gemini-1.5-flash') {
    this.model = model;
  }

  async generate(req: MentorRequest, apiKey: string, timeoutMs = 10000): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
    const userPrompt = buildUserPrompt(req);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
          },
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const msg = (errorData as { error?: { message?: string } })?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`Google AI Studio error: ${msg}`);
      }

      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Google AI returned an empty response.');
      }
      return text.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * OpenRouter Provider
 * Uses OpenRouter Chat Completions REST API.
 */
export class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter';
  type: AIProviderType = 'openrouter';
  private model: string;

  constructor(model = process.env.AI_MODEL || 'google/gemini-2.0-flash-exp:free') {
    this.model = model;
  }

  async generate(req: MentorRequest, apiKey: string, timeoutMs = 10000): Promise<string> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const userPrompt = buildUserPrompt(req);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'ByteBot AI Coding Agent',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const msg = (errorData as { error?: { message?: string } })?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`OpenRouter error: ${msg}`);
      }

      const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('OpenRouter returned an empty response.');
      }
      return text.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Offline Fallback Provider
 * Ensures the app and mentor always give high-value, educational assistance
 * even when no API key is configured or when offline.
 */
export class OfflineFallbackProvider {
  static getResponse(req: MentorRequest): string {
    const code = req.code.trim();

    if (req.action === 'explain') {
      const match = code.match(/for\s+(\w+)\s+in\s+range\((\d+)\)/);
      if (match) {
        const [, v, n] = match;
        return `🤖 **ByteBot's Code Breakdown:**
• **Line 1 (\`for ${v} in range(${n}):\`)**: Starts a repeating loop. The variable \`${v}\` starts at 0 and goes up to ${Number(n) - 1} (total ${n} turns).
• **Inside the loop**: Every indented line runs once per turn. If it calls \`collect_coin()\`, the robot takes a step and grabs 1 coin.
• **Result**: The loop will run exactly **${n} times** and collect **${n} coins**!

💡 *Try changing \`range(${n})\` to a different number to see the robot move!*`;
      }
      return `🤖 **How For Loops Work:**
• \`for i in range(N):\`: Repeats everything indented underneath it $N$ times.
• The variable \`i\` takes values 0, 1, 2, ... up to $N-1$.
• Try pressing **▶ Play** or **⏭ Step** to watch \`i\` change on each step!`;
    }

    if (req.action === 'hint') {
      const level = req.hintLevel || 1;
      if (level === 1) {
        return `🧭 **Hint 1 (Concept):** 
In Python, \`range(N)\` controls how many times the loop repeats. Notice that counting starts at 0, not 1!`;
      }
      if (level === 2) {
        return `🧭 **Hint 2 (Guiding Question):** 
Look at the challenge goal. If the challenge asks for 3 coins, how many times does the loop body need to repeat?`;
      }
      return `🧭 **Hint 3 (Specific Clue):** 
Replace the blank with the exact target number: \`range(3)\` will run the loop 3 times for \`i = 0, 1, 2\`!`;
    }

    if (req.action === 'mistake') {
      if (!code.includes('for')) {
        return `🔍 **Mistake Found:** Missing loop declaration!
A Python for loop must start with: \`for <variable> in range(N):\`. Don't forget the colon \`:\` at the end of the line!`;
      }
      if (!code.includes(':')) {
        return `🔍 **Mistake Found:** Syntax error!
Python requires a colon \`:\` at the end of the \`for\` loop line. Example: \`for i in range(5):\``;
      }
      if (req.executionState?.error) {
        return `🔍 **Execution Issue:**
The interpreter noticed: *"${req.executionState.error}"*. Check your syntax and make sure all lines inside the loop are indented.`;
      }
      return `🔍 **Code Inspection:**
Your loop syntax looks valid! Check the coin counter: if you collected fewer or more coins than you wanted, check the number inside \`range(N)\`.`;
    }

    // Default 'ask'
    return `🤖 **ByteBot Answer:**
In Python, \`for i in range(N)\` is a counter loop. It tells the computer: "Do the following tasks $N$ times, and keep track of which turn we're on using the variable $i$."
Each turn is called an **iteration**.

*(Note: Connect a free Google AI Studio or OpenRouter key in Settings for live AI answers!)*`;
  }
}

/**
 * Factory to get configured or requested provider.
 */
export function getProvider(requestedType?: AIProviderType): AIProvider {
  const type = requestedType || (process.env.AI_PROVIDER as AIProviderType) || 'google';
  if (type === 'openrouter') {
    return new OpenRouterProvider();
  }
  return new GoogleAIProvider();
}
