import type { MentorRequest } from './types.ts';

export const SYSTEM_PROMPT = `You are ByteBot, an enthusiastic, friendly AI coding mentor for first-year B.Tech students learning Python 'for' loops for the first time.
Pedagogical rules:
1. Keep explanations under 120 words. Use simple words and bullet points.
2. The lesson story is: a cute robot steps forward and collects gold coins in a loop.
3. NEVER write the complete final code or solve homework directly.
4. Encourage the student to predict what the loop does before running it.
5. If giving a hint, provide only the requested hint level (1=concept, 2=guiding question, 3=targeted clue).
6. Always end with a positive, encouraging one-line action (e.g., "Try testing that in the code editor!").`;

export function sanitizeText(text: string, maxLen: number): string {
  if (!text) return '';
  return text.slice(0, maxLen).replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');
}

export function buildUserPrompt(req: MentorRequest): string {
  const safeCode = sanitizeText(req.code || '', 800);
  const safeQuestion = sanitizeText(req.studentQuestion || '', 250);
  const exec = req.executionState;

  switch (req.action) {
    case 'explain':
      return `Please explain this beginner Python loop line-by-line in simple, friendly terms:
\`\`\`python
${safeCode}
\`\`\`
Explain:
1. What the for loop line does (how many times it runs).
2. What happens inside the loop each time.
3. What the loop variable represents.`;

    case 'hint': {
      const level = req.hintLevel || 1;
      return `The student is working on this Python loop:
\`\`\`python
${safeCode}
\`\`\`
Give Progressive Hint #${level} of 3:
- If Level 1: Explain the general concept or goal of range() without code.
- If Level 2: Ask a thought-provoking guiding question to point them in the right direction.
- If Level 3: Give a specific clue about the number or line to inspect, without revealing the full answer.
Current request is strictly for Hint #${level}. Keep it to 2-3 sentences.`;
    }

    case 'mistake': {
      const errorMsg = exec?.error ? `Error/Status: ${exec.error}` : 'Code status: completed or syntax check';
      const outputMsg = exec?.lastOutput?.length ? `Output was: ${exec.lastOutput.join(', ')}` : 'No output produced';
      return `The student wrote this code:
\`\`\`python
${safeCode}
\`\`\`
${errorMsg}
${outputMsg}
Coins collected: ${exec?.coinsCollected ?? 0} out of ${exec?.total ?? 0}
Explain what might be confusing or mistaken in this code, explain why it happened, and ask a question to help them fix it. Do not just hand them the answer.`;
    }

    case 'ask':
      return `The student is learning Python for-loops and asks:
"${safeQuestion}"

Their current code is:
\`\`\`python
${safeCode}
\`\`\`
Answer their question clearly, warmly, and concisely for an absolute beginner.`;

    default:
      return `Explain this Python code: \n\`\`\`python\n${safeCode}\n\`\`\``;
  }
}
