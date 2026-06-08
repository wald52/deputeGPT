export const FALLBACK_MODEL_CATALOG = {
  schemaVersion: 1,
  remote_providers: [
    {
      id: 'online',
      name: 'IA en ligne',
      mode: 'remote',
      status: 'stable',
      default: true,
      requires_api_key: false,
      live_catalog: false,
      api_base_url: '',
      turnstile_site_key: '',
      notes: 'Service distant multi-fournisseurs via Cloudflare Worker et AI Gateway. Configurez api_base_url avant usage.',
      models: [
        {
          id: 'online/default',
          name: 'multi-fournisseurs',
          providerModelId: 'dynamic/deputegpt-analysis',
          providerLabel: 'Cloudflare AI Gateway',
          providerGroup: 'online',
          pricing: {
            prompt: 0,
            completion: 0
          },
          isFree: true,
          priceStatus: 'free',
          supportedParameters: ['temperature', 'top_p', 'max_tokens'],
          defaultParameters: {
            temperature: 0.2,
            top_p: 0.9
          },
          contextLength: 18000,
          maxCompletionTokens: 512,
          status: 'stable',
          notes: 'Route dynamique Google -> OpenRouter -> Groq -> Cerebras -> Workers AI, avec fallback gere cote Cloudflare.'
        }
      ]
    }
  ],
  models: [
    {
      id: 'qwen3-0.6b',
      name: 'Qwen3 0.6B',
      family: 'Qwen3',
      status: 'stable',
      default: true,
      path: 'onnx-community/Qwen3-0.6B-ONNX',
      runtime: 'qwen3_low_level',
      task: 'text-generation',
      estimated_download_mb: 570,
      notes: 'Profil recommande pour demarrer. WebGPU + Transformers.js.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0
      },
      thinking: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0
      },
      quantizations: [
        { id: 'q4f16', name: 'Q4F16', dtype: 'q4f16', estimated_download_mb: 570, default: true },
        { id: 'q4', name: 'Q4', dtype: 'q4', estimated_download_mb: 919 },
        { id: 'fp16', name: 'FP16', dtype: 'fp16', estimated_download_mb: 1200 }
      ]
    },
    {
      id: 'qwen3-1.7b',
      name: 'Qwen3 1.7B',
      family: 'Qwen3',
      status: 'stable',
      default: false,
      path: 'onnx-community/Qwen3-1.7B-ONNX',
      runtime: 'qwen3_low_level',
      task: 'text-generation',
      estimated_download_mb: 1430,
      notes: 'Plus robuste que 0.6B, mais nettement plus lourd.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0
      },
      thinking: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0
      },
      quantizations: [
        { id: 'q4f16', name: 'Q4F16', dtype: 'q4f16', estimated_download_mb: 1430, default: true },
        { id: 'q4', name: 'Q4', dtype: 'q4', estimated_download_mb: 2170 },
        { id: 'fp16', name: 'FP16', dtype: 'fp16', estimated_download_mb: 3490 }
      ]
    },
    {
      id: 'qwen3-4b',
      name: 'Qwen3 4B',
      family: 'Qwen3',
      status: 'stable',
      default: false,
      path: 'onnx-community/Qwen3-4B-ONNX',
      runtime: 'qwen3_low_level',
      task: 'text-generation',
      estimated_download_mb: 2930,
      notes: 'Profil lourd, reserve aux machines solides.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0
      },
      thinking: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0
      },
      quantizations: [
        { id: 'q4f16', name: 'Q4F16', dtype: 'q4f16', estimated_download_mb: 2930, default: true },
        { id: 'fp16', name: 'FP16', dtype: 'fp16', estimated_download_mb: 7980 }
      ]
    },
    {
      id: 'qwen3.5-0.8b',
      name: 'Qwen3.5 0.8B',
      family: 'Qwen3.5',
      status: 'experimental',
      default: false,
      path: 'onnx-community/Qwen3.5-0.8B-ONNX',
      runtime: 'qwen35_low_level',
      task: 'text-generation',
      estimated_download_mb: 950,
      notes: 'Experimental. Architecture vision-langage chargee en mode texte (Qwen3_5ForConditionalGeneration). Plus lourd/lent que Qwen3 sur WebGPU. Tailles estimatives a confirmer.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0
      },
      thinking: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0
      },
      quantizations: [
        { id: 'q4f16', name: 'Q4F16', dtype: 'q4f16', estimated_download_mb: 950, default: true },
        { id: 'q4', name: 'Q4', dtype: 'q4', estimated_download_mb: 1300 },
        { id: 'fp16', name: 'FP16', dtype: 'fp16', estimated_download_mb: 1700 }
      ]
    },
    {
      id: 'qwen3.5-4b',
      name: 'Qwen3.5 4B',
      family: 'Qwen3.5',
      status: 'experimental',
      default: false,
      path: 'onnx-community/Qwen3.5-4B-ONNX',
      runtime: 'qwen35_low_level',
      task: 'text-generation',
      estimated_download_mb: 3300,
      notes: 'Experimental, profil lourd. Architecture vision-langage chargee en mode texte (Qwen3_5ForConditionalGeneration). Plus lent que Qwen3 4B sur WebGPU. Tailles estimatives a confirmer.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0
      },
      thinking: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0
      },
      quantizations: [
        { id: 'q4f16', name: 'Q4F16', dtype: 'q4f16', estimated_download_mb: 3300, default: true },
        { id: 'fp16', name: 'FP16', dtype: 'fp16', estimated_download_mb: 8500 }
      ]
    }
  ]
};
