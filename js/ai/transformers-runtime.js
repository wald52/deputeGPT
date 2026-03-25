const TRANSFORMERS_CHANNELS = {
  stable: {
    url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1',
    label: 'transformers.js 3.8.1'
  },
  next: {
    url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-next.7',
    label: 'transformers.js 4.0.0-next.7'
  }
};

export function createTransformersRuntimeManager() {
  const state = {
    transformers: null,
    pipeline: null,
    env: null,
    AutoTokenizer: null,
    Qwen3ForCausalLM: null,
    Qwen35ForConditionalGeneration: null,
    activeRuntimeChannel: null
  };

  const runtimePromises = new Map();
  const runtimeModules = new Map();

  function applyRuntime(runtimeModule, channel) {
    state.transformers = runtimeModule;
    state.activeRuntimeChannel = channel;
    state.pipeline = runtimeModule.pipeline;
    state.env = runtimeModule.env;
    state.AutoTokenizer = runtimeModule.AutoTokenizer || null;
    state.Qwen3ForCausalLM = runtimeModule.Qwen3ForCausalLM || null;
    state.Qwen35ForConditionalGeneration =
      runtimeModule.Qwen3_5ForConditionalGeneration ||
      runtimeModule.Qwen3_5MoeForConditionalGeneration ||
      runtimeModule.Qwen3_5OmniMoeForConditionalGeneration ||
      null;

    state.env.allowLocalModels = false;
    state.env.useBrowserCache = true;
    state.env.allowRemoteModels = true;
    state.env.backends.onnx.wasm.proxy = false;

    if (self.crossOriginIsolated) {
      state.env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 2, 4);
    } else {
      state.env.backends.onnx.wasm.numThreads = 1;
    }

    if (state.env.backends.onnx && state.env.backends.onnx.webgpu) {
      state.env.backends.onnx.webgpu.device = 'webgpu';
    }
  }

  async function loadRuntime(channel = 'stable') {
    if (state.transformers && state.activeRuntimeChannel === channel) {
      return state.transformers;
    }

    if (runtimeModules.has(channel)) {
      const runtimeModule = runtimeModules.get(channel);
      applyRuntime(runtimeModule, channel);
      return runtimeModule;
    }

    if (runtimePromises.has(channel)) {
      const runtimeModule = await runtimePromises.get(channel);
      applyRuntime(runtimeModule, channel);
      return runtimeModule;
    }

    const runtimePromise = (async () => {
      const channelConfig = TRANSFORMERS_CHANNELS[channel] || TRANSFORMERS_CHANNELS.stable;
      let runtimeModule;

      try {
        runtimeModule = await import(channelConfig.url);
        console.debug(`✅ ${channelConfig.label} charge depuis le CDN.`);
      } catch (cdnError) {
        if (channel !== 'stable') {
          throw new Error(`Impossible de charger ${channelConfig.label}: ${cdnError.message}`);
        }

        console.warn(`⚠️ Impossible de charger ${channelConfig.label} depuis le CDN, fallback local.`, cdnError);
        runtimeModule = await import('../transformers.min.js');
      }

      runtimeModules.set(channel, runtimeModule);
      return runtimeModule;
    })();

    runtimePromises.set(channel, runtimePromise);

    try {
      const runtimeModule = await runtimePromise;
      applyRuntime(runtimeModule, channel);
      return runtimeModule;
    } catch (error) {
      runtimePromises.delete(channel);
      throw error;
    }
  }

  return {
    state,
    loadRuntime
  };
}

export function createGeneratorAdapter(runtime) {
  const adapter = async (messages, options) => runtime.invoke(messages, options);
  adapter.dispose = runtime.dispose;
  return adapter;
}
