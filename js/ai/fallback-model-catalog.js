export const FALLBACK_MODEL_CATALOG = {
  schemaVersion: 1,
  remote_providers: [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      mode: 'remote',
      status: 'experimental',
      default: false,
      requires_api_key: true,
      api_base_url: 'https://openrouter.ai/api/v1',
      notes: 'Backend distant optionnel. La cle API est fournie par l utilisateur et ne doit jamais etre committee.',
      models: [
        {
          id: 'openrouter-free-auto',
          name: 'OpenRouter Free Auto',
          provider_model_id: 'openrouter/free',
          status: 'experimental',
          default: true,
          supports_thinking: false,
          notes: 'Routeur automatique vers un modele gratuit compatible sur OpenRouter. Quotas et disponibilites variables cote service distant.',
          non_thinking: {
            temperature: 0.2,
            top_p: 0.9
          }
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
      id: 'qwen35-0.8b',
      name: 'Qwen3.5 0.8B',
      family: 'Qwen3.5',
      status: 'experimental',
      default: false,
      path: 'onnx-community/Qwen3.5-0.8B-ONNX',
      runtime: 'qwen3_5_low_level',
      task: 'text-generation',
      estimated_download_mb: 617,
      notes: 'Mode experimental. Texte seul via tokenizer + classes bas niveau de transformers.js@next.',
      non_thinking: {
        temperature: 1,
        top_p: 1,
        top_k: 20,
        min_p: 0,
        presence_penalty: 2,
        repetition_penalty: 1
      },
      thinking: {
        temperature: 1,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
        repetition_penalty: 1
      },
      quantizations: [
        {
          id: 'q4f16',
          name: 'Q4F16 (exp)',
          estimated_download_mb: 617,
          dtype_map: {
            embed_tokens: 'q4f16',
            vision_encoder: 'q4f16',
            decoder_model_merged: 'q4f16'
          },
          default: true
        },
        {
          id: 'q4',
          name: 'Q4 (exp)',
          estimated_download_mb: 684,
          dtype_map: {
            embed_tokens: 'q4',
            vision_encoder: 'q4',
            decoder_model_merged: 'q4'
          }
        },
        {
          id: 'quantized',
          name: 'Quantized (exp)',
          estimated_download_mb: 1231,
          dtype_map: {
            embed_tokens: 'quantized',
            vision_encoder: 'quantized',
            decoder_model_merged: 'quantized'
          }
        },
        {
          id: 'fp16',
          name: 'FP16 (exp)',
          estimated_download_mb: 2117,
          dtype_map: {
            embed_tokens: 'fp16',
            vision_encoder: 'fp16',
            decoder_model_merged: 'fp16'
          }
        }
      ]
    },
    {
      id: 'qwen35-2b',
      name: 'Qwen3.5 2B',
      family: 'Qwen3.5',
      status: 'experimental',
      default: false,
      path: 'onnx-community/Qwen3.5-2B-ONNX',
      runtime: 'qwen3_5_low_level',
      task: 'text-generation',
      estimated_download_mb: 1509,
      notes: 'Tres lourd. Texte seul, experimental, reserve aux utilisateurs avances.',
      non_thinking: {
        temperature: 1,
        top_p: 1,
        top_k: 20,
        min_p: 0,
        presence_penalty: 2,
        repetition_penalty: 1
      },
      thinking: {
        temperature: 1,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
        repetition_penalty: 1
      },
      quantizations: [
        {
          id: 'q4f16',
          name: 'Q4F16 (exp)',
          estimated_download_mb: 1509,
          dtype_map: {
            embed_tokens: 'q4f16',
            vision_encoder: 'q4f16',
            decoder_model_merged: 'q4f16'
          },
          default: true
        },
        {
          id: 'q4',
          name: 'Q4 (exp)',
          estimated_download_mb: 1673,
          dtype_map: {
            embed_tokens: 'q4',
            vision_encoder: 'q4',
            decoder_model_merged: 'q4'
          }
        },
        {
          id: 'quantized',
          name: 'Quantized (exp)',
          estimated_download_mb: 3014,
          dtype_map: {
            embed_tokens: 'quantized',
            vision_encoder: 'quantized',
            decoder_model_merged: 'quantized'
          }
        },
        {
          id: 'fp16',
          name: 'FP16 (exp)',
          estimated_download_mb: 5198,
          dtype_map: {
            embed_tokens: 'fp16',
            vision_encoder: 'fp16',
            decoder_model_merged: 'fp16'
          }
        }
      ]
    },
    {
      id: 'qwen35-4b',
      name: 'Qwen3.5 4B',
      family: 'Qwen3.5',
      status: 'experimental',
      default: false,
      path: 'onnx-community/Qwen3.5-4B-ONNX',
      runtime: 'qwen3_5_low_level',
      task: 'text-generation',
      estimated_download_mb: 2863,
      notes: 'Extremement lourd. Texte seul, experimental, a reserver aux machines solides.',
      non_thinking: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
        repetition_penalty: 1
      },
      thinking: {
        temperature: 1,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
        repetition_penalty: 1
      },
      quantizations: [
        {
          id: 'q4f16',
          name: 'Q4F16 (exp)',
          estimated_download_mb: 2863,
          dtype_map: {
            embed_tokens: 'q4f16',
            vision_encoder: 'q4f16',
            decoder_model_merged: 'q4f16'
          },
          default: true
        },
        {
          id: 'q4',
          name: 'Q4 (exp)',
          estimated_download_mb: 3175,
          dtype_map: {
            embed_tokens: 'q4',
            vision_encoder: 'q4',
            decoder_model_merged: 'q4'
          }
        },
        {
          id: 'quantized',
          name: 'Quantized (exp)',
          estimated_download_mb: 5722,
          dtype_map: {
            embed_tokens: 'quantized',
            vision_encoder: 'quantized',
            decoder_model_merged: 'quantized'
          }
        },
        {
          id: 'fp16',
          name: 'FP16 (exp)',
          estimated_download_mb: 9879,
          dtype_map: {
            embed_tokens: 'fp16',
            vision_encoder: 'fp16',
            decoder_model_merged: 'fp16'
          }
        }
      ]
    }
  ]
};
