import { resolveGenerationOptions } from './generation-options.js';

// Runtime local pour la famille Gemma 4 (architecture multimodale texte+image+audio,
// chargee ici en mode texte seul). Comme Qwen3.5, ces modeles ne se chargent pas via
// le pipeline `text-generation` classique : on charge explicitement la classe indiquee
// par `modelConfig.modelClass` (par defaut `Gemma4ForConditionalGeneration`), avec un
// repli sur `AutoModelForCausalLM`.
//
// Particularite Gemma : le gabarit de chat ne supporte pas toujours le role `system`.
// On tente d'abord le gabarit tel quel ; en cas d'echec, on fusionne les messages
// `system` dans le premier tour `user` puis on reessaie.

function mergeSystemIntoFirstUser(messages) {
  const systemParts = messages
    .filter(message => message?.role === 'system')
    .map(message => message?.content)
    .filter(content => typeof content === 'string' && content.length > 0);

  if (systemParts.length === 0) {
    return messages;
  }

  const rest = messages.filter(message => message?.role !== 'system');
  const systemText = systemParts.join('\n\n');
  const firstUserIndex = rest.findIndex(message => message?.role === 'user');

  if (firstUserIndex === -1) {
    return [{ role: 'user', content: systemText }, ...rest];
  }

  const merged = rest.slice();
  const existingContent = merged[firstUserIndex].content;
  merged[firstUserIndex] = {
    ...merged[firstUserIndex],
    content: `${systemText}\n\n${existingContent ?? ''}`.trim()
  };
  return merged;
}

export async function createGemma4Runtime(
  modelConfig,
  updateProgress,
  {
    transformersRuntime,
    resolveThinkingModeFlag
  }
) {
  await transformersRuntime.loadRuntime('stable');

  const modelClassName = modelConfig.modelClass || 'Gemma4ForConditionalGeneration';
  const ModelClass = transformersRuntime.state[modelClassName]
    || transformersRuntime.state.Gemma4ForConditionalGeneration
    || transformersRuntime.state.AutoModelForCausalLM;

  if (!transformersRuntime.state.AutoTokenizer || !ModelClass) {
    throw new Error(`Cette version stable de transformers.js ne fournit pas la classe ${modelClassName} necessaire pour Gemma 4.`);
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
    throw new Error(`Impossible de charger le tokenizer Gemma 4: ${error.message}`);
  }

  let model;
  try {
    model = await ModelClass.from_pretrained(modelConfig.path, {
      device: 'webgpu',
      dtype: modelConfig.dtype,
      progress_callback: info => {
        if (info.status === 'progress') {
          updateProgress(0.3 + ((info.progress || 0) * 0.7), 'Chargement du modele Gemma 4');
        }
      }
    });
  } catch (error) {
    const errorDetail = error?.message || error?.toString?.() || JSON.stringify(error) || 'erreur inconnue';
    console.error('Erreur brute chargement Gemma 4:', error);
    throw new Error(`Impossible de charger le modele Gemma 4 (${modelConfig.selectedQuant?.name || modelConfig.selectedQuant?.id || 'quantization inconnue'}): ${errorDetail}`);
  }

  function buildPrompt(messages, enableThinking) {
    const templateOptions = {
      add_generation_prompt: true,
      enable_thinking: enableThinking,
      tokenize: false
    };
    try {
      return tokenizer.apply_chat_template(messages, templateOptions);
    } catch (templateError) {
      // Le gabarit Gemma refuse parfois le role `system` : on le fusionne dans le
      // premier tour utilisateur avant de reessayer.
      return tokenizer.apply_chat_template(mergeSystemIntoFirstUser(messages), templateOptions);
    }
  }

  return {
    invoke: async (messages, options) => {
      const enableThinking = resolveThinkingModeFlag(modelConfig, options?.enable_thinking);
      const prompt = buildPrompt(messages, enableThinking);

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
