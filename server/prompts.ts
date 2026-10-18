import type { MentorRequest } from './types.ts';

export const SYSTEM_PROMPT = `You are ByteBot, a warm and encouraging AI coding tutor for absolute beginners and first-year B.Tech students learning Python loops for the very first time.

STORY & ANALOGY RULES:
1. Analogy: ByteBot is a cute little robot walking on a starry path collecting gold coins.
2. The loop variable (like 'i') is the "Lap Counter" on ByteBot's chest. It always starts at 0.
3. The function 'range(N)' is the "Number Dispenser" handing out numbers: 0, 1, 2, ... up to N-1.
4. The colon ':' is the "Doorway" opening the instructions.
5. The 2-space indentation means "tucking this action inside ByteBot's backpack so it repeats every lap".
6. An "iteration" simply means "one complete lap or round through the loop".

TEACHING RULES:
- Use simple everyday English, short sentences, and friendly tone.
- Explain terms clearly whenever used (e.g. variable, range, iteration, syntax).
- Format responses cleanly with Markdown: bold (**text**), inline code (\`code\`), and bullet points (•).
- NEVER give away the full final solution or do homework directly.
- Always encourage testing in the editor and pressing Play.`;

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
      return `Please explain this Python loop line-by-line for an absolute beginner:
\`\`\`python
${safeCode}
\`\`\`
Structure your answer into 3 simple sections:
1. **The Loop Header**: What 'for', the variable name, 'range()', and the colon ':' do.
2. **Inside the Robot's Backpack**: What happens during each lap (body instructions).
3. **The Result**: Exactly how many coins ByteBot collects and how the chest counter changes.`;

    case 'hint': {
      const level = req.hintLevel || 1;
      return `The student is working on this Python loop:
\`\`\`python
${safeCode}
\`\`\`
Target/Current State: ${exec?.total ?? 'unspecified'} coins target, ${exec?.coinsCollected ?? 0} currently collected.

Provide Progressive Hint #${level} of 3:
- If Level 1: Story clue about how range() tells ByteBot how many laps to take.
- If Level 2: A guiding question asking them to compare range(N) with the coin target.
- If Level 3: A targeted clue pointing out the exact number to adjust, without writing the finished code.
Strictly output Hint #${level} only, in 2-3 friendly sentences.`;
    }

    case 'mistake': {
      const errorMsg = exec?.error ? `Interpreter error: ${exec.error}` : 'Code status: completed or check syntax';
      const outputMsg = exec?.lastOutput?.length ? `Actual output: ${exec.lastOutput.join(', ')}` : 'No output produced';
      return `The student's code is:
\`\`\`python
${safeCode}
\`\`\`
${errorMsg}
${outputMsg}
Coins collected: ${exec?.coinsCollected ?? 0} out of ${exec?.total ?? 0}.

Diagnose the issue for a beginner:
1. Point out where the confusion or mistake is (e.g., missing colon, wrong range count, missing indentation).
2. Explain *why* Python needs it in simple English.
3. Ask a friendly guiding question to help them fix it themselves.`;
    }

    case 'ask':
      return `The student is an absolute beginner learning Python loops and asks:
"${safeQuestion}"

Their current editor code is:
\`\`\`python
${safeCode}
\`\`\`
Answer in simple English with a clear analogy, explaining any technical terms used.`;

    default:
      return `Explain this beginner Python code: \n\`\`\`python\n${safeCode}\n\`\`\``;
  }
}
