export async function createPipelineRuntime(modelConfig, updateProgress, { transformersRuntime }) {
  await transformersRuntime.loadRuntime('stable');

  const chatPipeline = await transformersRuntime.state.pipeline(modelConfig.task || 'text-generation', modelConfig.path, {
    device: 'webgpu',
    dtype: modelConfig.dtype,
    progress_callback: info => {
      if (info.status === 'progress') {
        updateProgress(info.progress || 0, 'Chargement du modele');
      }
    }
  });

  return {
    invoke: async (messages, options) => chatPipeline(messages, options),
    dispose: async () => {
      if (typeof chatPipeline.dispose === 'function') {
        await chatPipeline.dispose();
      }
    }
  };
}
