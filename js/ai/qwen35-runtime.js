import { resolveGenerationOptions } from './generation-options.js';

// Runtime local pour la famille Qwen3.5 (architecture vision-langage).
// Contrairement a Qwen3, ces modeles ne se chargent ni via le pipeline
// `text-generation` ni via `Qwen3ForCausalLM` : transformers.js expose la
// classe dediee `Qwen3_5ForConditionalGeneration`. On l'utilise ici en mode
// texte seul (aucune image en entree), avec le meme gabarit de chat que Qwen3.
export async function createQwen35Runtime(
  modelConfig,
  updateProgress,
  {
    transformersRuntime,
    resolveThinkingModeFlag
  }
) {
  await transformersRuntime.loadRuntime('stable');

  if (!transformersRuntime.state.AutoTokenizer || !transformersRuntime.state.Qwen3_5ForConditionalGeneration) {
    throw new Error('Cette version stable de transformers.js ne fournit pas le support necessaire pour Qwen3.5.');
  }

  updateProgress(0.08, 'Chargement du tokenizer');

  let tokenizer;
  try {
    tokenizer = await transformersRuntime.state.AutoTokenizer.from_pretrained(modelConfig.path, {
      progress_callback: info => {
        if (info.status === 'progress') {
          updateProgress(0.08 + ((info.progress || 0) * 0.22), 'Chargement du tokenizer');
        }
      }
    });
  } catch (error) {
    throw new Error(`Impossible de charger le tokenizer Qwen3.5: ${error.message}`);
  }

  let model;
  try {
    model = await transformersRuntime.state.Qwen3_5ForConditionalGeneration.from_pretrained(modelConfig.path, {
      device: 'webgpu',
      dtype: modelConfig.dtype,
      progress_callback: info => {
        if (info.status === 'progress') {
          updateProgress(0.3 + ((info.progress || 0) * 0.7), 'Chargement du modele Qwen3.5');
        }
      }
    });
  } catch (error) {
    const errorDetail = error?.message || error?.toString?.() || JSON.stringify(error) || 'erreur inconnue';
    console.error('Erreur brute chargement Qwen3.5:', error);
    throw new Error(`Impossible de charger le modele Qwen3.5 (${modelConfig.selectedQuant?.name || modelConfig.selectedQuant?.id || 'quantization inconnue'}): ${errorDetail}`);
  }

  return {
    invoke: async (messages, options) => {
      const enableThinking = resolveThinkingModeFlag(modelConfig, options?.enable_thinking);
      const prompt = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        enable_thinking: enableThinking,
        tokenize: false
      });

      const inputs = await tokenizer(prompt, {
        add_special_tokens: false
      });
      const generationOptions = resolveGenerationOptions(
        modelConfig,
        { ...options, enable_thinking: enableThinking },
        { max_new_tokens: 320 }
      );

      const outputs = await model.generate({
        ...inputs,
        ...generationOptions
      });

      const promptLength = inputs.input_ids?.dims?.at(-1) ?? 0;
      const generatedTokens = outputs.slice(null, [promptLength, null]);
      const decoded = await tokenizer.batch_decode(generatedTokens, { skip_special_tokens: true });
      const answer = Array.isArray(decoded) ? decoded[0] : String(decoded || '');

      return [{
        generated_text: [
          ...messages,
          { role: 'assistant', content: answer }
        ]
      }];
    },
    dispose: async () => {
      if (typeof model.dispose === 'function') {
        await model.dispose();
      }
    }
  };
}
