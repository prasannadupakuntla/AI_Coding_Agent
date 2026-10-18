import type { MentorRequest, AIProviderType } from './types.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.ts';

export interface AIProvider {
  name: string;
  type: AIProviderType;
  generate(req: MentorRequest, apiKey: string, timeoutMs?: number): Promise<string>;
}

/**
 * Google AI Studio (Gemini) Provider
 */
export class GoogleAIProvider implements AIProvider {
  name = 'Google AI Studio (Gemini 1.5 Flash)';
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
            maxOutputTokens: 350,
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
 */
export class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter (Free Tier)';
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
          max_tokens: 350,
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
 * Grounded in the editor code and execution state with beginner storytelling.
 */
export class OfflineFallbackProvider {
  static getResponse(req: MentorRequest): string {
    const code = (req.code || '').trim();
    const exec = req.executionState;

    // Handle empty code honestly
    if (!code) {
      return `### 🤖 ByteBot is Ready!
Your code editor is currently empty.
• Start by giving ByteBot a loop command:
\`\`\`python
for i in range(5):
  collect_coin()
\`\`\`
• **Why?** A \`for\` loop tells ByteBot how many laps to run!`;
    }

    // 1. EXPLAIN CODE
    if (req.action === 'explain') {
      const match = code.match(/for\s+(\w+)\s+in\s+range\((\d+)\)\s*:/);
      if (match) {
        const [, varName, countStr] = match;
        const count = parseInt(countStr, 10);
        const hasCoin = code.includes('collect_coin()');
        const hasPrint = code.includes('print(');

        return `### 🤖 ByteBot's Friendly Code Breakdown

1. **The Loop Header: \`for ${varName} in range(${count}):\`**
• **\`for\`**: The command telling Python to repeat an action.
• **\`${varName}\` (Loop Variable)**: The **Lap Counter Badge** on ByteBot's chest. It starts at \`0\` and increases by 1 on every lap.
• **\`range(${count})\` (Number Dispenser)**: Hands out ${count} numbers: \`0, 1, ... up to ${count > 0 ? count - 1 : 0}\`.
• **\`:\` (Colon)**: The **Doorway** that opens the instructions for the robot.

2. **Inside ByteBot's Backpack (The Loop Body):**
• Each indented line runs once per lap (each lap is called an **iteration**).
${hasCoin ? `• **\`collect_coin()\`**: ByteBot steps forward and picks up **1 gold coin** each lap.\n` : ''}${hasPrint ? `• **\`print(...)\`**: Displays the lap number on your screen.\n` : ''}
3. **The Result:**
• ByteBot will complete **${count} laps** and collect **${hasCoin ? count : 0} coins**.
• The chest counter \`${varName}\` will count: \`${Array.from({ length: Math.min(count, 5) }, (_, i) => i).join(', ')}${count > 5 ? '...' : ''}\`.

💡 *Press **▶ Play** to watch the robot make these exact steps!*`;
      }

      // If code doesn't match the valid loop pattern
      if (!code.includes(':')) {
        return `### ⚠️ Notice: Missing Colon!
Your loop is missing the colon \`:\` at the end of the first line.
• **What it means:** In Python, the colon \`:\` tells the computer: *"Open the door, here are the steps to repeat!"*
• **Fix:** Add a colon to the end of the line, like: \`for i in range(5):\``;
      }

      return `### 🤖 How a Python 'for' Loop Works
• **The Story**: Imagine ByteBot running laps around a track.
• **\`for i in range(N):\`**: Sets up $N$ laps.
• **The Variable \`i\`**: A tiny counter on ByteBot's chest displaying \`0, 1, 2, ... N-1\`.
• **Indentation**: Any line with 2 spaces belongs inside the robot's backpack and runs on every lap!`;
    }

    // 2. GIVE ME A HINT (Progressive)
    if (req.action === 'hint') {
      const level = req.hintLevel || 1;

      if (level === 1) {
        return `### 🧭 Hint 1 of 3: The Concept & Story
ByteBot needs to know how many laps to take around the coin track.
• The function **\`range(N)\`** is your **Lap Dispenser**.
• Whatever number you put inside the parentheses \`range(...)\` is how many times the loop will repeat!`;
      }

      if (level === 2) {
        return `### 🧭 Hint 2 of 3: Guiding Question
Look at the goal. If you want ByteBot to collect **3 coins**, and each lap collects **1 coin**:
• How many total laps does ByteBot need to run?
• What number should you place inside \`range(?)\`?`;
      }

      return `### 🧭 Hint 3 of 3: Targeted Clue
Replace the blank with the exact target number:
• Write **\`range(3)\`**!
• In Python, \`range(3)\` runs for \`i = 0\`, \`i = 1\`, and \`i = 2\` — that is exactly 3 laps and 3 coins!`;
    }

    // 3. FIND MY MISTAKE
    if (req.action === 'mistake') {
      if (!code.startsWith('for')) {
        return `### 🔍 Mistake Found: Missing 'for' Keyword
Python doesn't know you want to repeat actions yet!
• **Fix**: Start your code with \`for i in range(N):\`.
• **Why?** \`for\` is the magic keyword that turns on ByteBot's repetition engine.`;
      }

      if (!code.includes(':')) {
        return `### 🔍 Mistake Found: Missing Colon (\`:\`)
Python stopped because line 1 is missing a colon \`:\` at the end!
• **Example**: Write \`for i in range(5):\` instead of \`for i in range(5)\`.
• **Why?** The colon tells Python that the instructions inside the loop are about to begin.`;
      }

      if (code.includes('range()')) {
        return `### 🔍 Mistake Found: Empty range()
The number dispenser \`range()\` is empty!
• **Fix**: Put a number inside, like \`range(3)\` or \`range(5)\`.
• **Why?** ByteBot needs to know how many laps to run!`;
      }

      const matchNum = code.match(/range\((\d+)\)/);
      if (matchNum) {
        const n = parseInt(matchNum[1], 10);
        if (n > 20) {
          return `### 🔍 Mistake Found: Number Too Large
You entered \`range(${n})\`.
• ByteBot's coin track only has space for **20 coins**!
• Try a number between \`1\` and \`10\` so you can see all the coins clearly.`;
        }
        if (n === 0) {
          return `### 🔍 Notice: range(0) Means Zero Laps!
You wrote \`range(0)\`.
• Because the count is 0, the loop ends immediately without taking a single step or collecting any coins!
• If you want coins, change \`0\` to a positive number like \`3\` or \`5\`.`;
        }
      }

      if (exec?.error) {
        return `### 🔍 Interpreter Error Detected
The robot reported: **"${exec.error}"**
• Make sure every instruction inside the loop is indented with 2 spaces!
• Supported commands in this lesson: \`collect_coin()\` and \`print(i)\`.`;
      }

      return `### 🔍 Code Inspection: All Good!
Your Python syntax is valid!
• ByteBot is ready to run. Press **▶ Play** to watch the coins get collected, or **⏭ Step** to observe line-by-line!`;
    }

    // 4. ASK AI (Knowledge base & analogies)
    const q = (req.studentQuestion || '').toLowerCase();

    if (q.includes('stop at 4') || q.includes('start at 0') || q.includes('why 0') || q.includes('why does range')) {
      return `### 🤖 Why Does \`range(5)\` Stop at 4?
Great question! This confuses almost every beginner at first.

• **In computer science, counting starts at \`0\`**, not \`1\`.
• When you ask for 5 numbers, Python dispenses:
  1. \`0\` (first)
  2. \`1\` (second)
  3. \`2\` (third)
  4. \`3\` (fourth)
  5. \`4\` (fifth)
• Count them up on your fingers: that is **5 numbers total**!
• So \`range(N)\` gives you $N$ turns, starting from $0$ up to $N - 1$.`;
    }

    if (q.includes('what is i') || q.includes('letter') || q.includes('variable') || q.includes('what does i') || q.includes("what is 'i'") || q.includes('what is "i"')) {
      return `### 🤖 What is the Letter \`i\`?
Think of \`i\` as a **Lap Counter Badge** on ByteBot's chest!

• \`i\` stands for **"index"** or **"iteration"**.
• On lap 1, the badge shows: \`i = 0\`.
• On lap 2, the badge updates to: \`i = 1\`.
• You can even rename it! \`for lap in range(5):\` works identically. \`i\` is just the friendly convention programmers use.`;
    }

    if (q.includes('iteration') || q.includes('what is an iteration')) {
      return `### 🤖 What Does "Iteration" Mean?
**Iteration** is just a fancy computer science word for:
> **"One complete lap through the loop."**

If your loop runs 5 times:
• Round 1 is the 1st iteration (\`i = 0\`).
• Round 5 is the 5th iteration (\`i = 4\`).
Each time ByteBot takes a step and grabs a coin, that is one iteration!`;
    }

    if (q.includes('indent') || q.includes('space') || q.includes('indentation')) {
      return `### 🤖 Why Does Indentation (Spacing) Matter?
In Python, **spaces are the robot's backpack!**

• Lines with 2 spaces indented under \`for\` belong **inside the loop**:
\`\`\`python
for i in range(3):
  collect_coin()  # <-- Inside! Repeats 3 times
print("Done")     # <-- Outside! Runs only once at the end
\`\`\`
• Without indentation, Python doesn't know which lines to repeat!`;
    }

    // Default friendly answer
    return `### 🤖 ByteBot Tutor
In Python, a **\`for\` loop** lets you repeat actions without copy-pasting code!
• **\`for i in range(5):\`**: Tells the robot to do 5 laps.
• **\`collect_coin()\`**: The action to repeat each lap.
• **Predict**: Before pressing **▶ Play**, try guessing what number will appear on ByteBot's chest at each step!

*(💡 Tip: You can configure a free Google AI Studio or OpenRouter key in Settings for unlimited live AI conversations!)*`;
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
