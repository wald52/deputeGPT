export function extractAnswerFromOutput(out) {
  let answer = '';

  if (out && Array.isArray(out) && out.length > 0) {
    const generatedText = out[0]?.generated_text;

    if (generatedText) {
      if (Array.isArray(generatedText)) {
        answer = generatedText[generatedText.length - 1]?.content || '';
      } else if (typeof generatedText === 'string') {
        answer = generatedText;
      } else if (generatedText.content) {
        answer = generatedText.content;
      }
    }
  }

  if (!answer && out && Array.isArray(out?.choices) && out.choices.length > 0) {
    const firstChoice = out.choices[0];
    const messageContent = firstChoice?.message?.content;

    if (typeof messageContent === 'string') {
      answer = messageContent;
    } else if (Array.isArray(messageContent)) {
      answer = messageContent
        .map(part => (typeof part === 'string' ? part : part?.text || ''))
        .filter(Boolean)
        .join(' ')
        .trim();
    } else if (typeof firstChoice?.text === 'string') {
      answer = firstChoice.text;
    }
  }

  return answer;
}

export function sanitizeGeneratedAnswer(rawAnswer, systemPrompt = '', question = '') {
  if (!rawAnswer || typeof rawAnswer !== 'string') {
    return '';
  }

  let answer = rawAnswer;

  answer = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think>[\s\S]*$/gi, ' ')
    .replace(/<\/think>/gi, ' ');

  answer = answer
    .replaceAll('<|im_start|>', '')
    .replaceAll('<|im_end|>', '')
    .replaceAll('<s>', '')
    .replaceAll('</s>', '')
    .replaceAll('<think>', '')
    .replaceAll('</think>', '')
    .trim();

  if (systemPrompt) {
    answer = answer.replace(new RegExp(systemPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }

  if (question) {
    answer = answer.replace(new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }

  answer = answer
    .replace(/^(system|assistant|user)\s*/gi, '')
    .replace(/^\s*<tool_call>[\s\S]*$/gi, '')
    .trim();

  return answer;
}
