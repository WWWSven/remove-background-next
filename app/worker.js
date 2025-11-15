import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers';

// Since we will download the model from the Hugging Face Hub, we can skip the local model check
env.allowLocalModels = false;

// Proxy the WASM backend to prevent the UI from freezing
env.backends.onnx.wasm.proxy = true;

// Use the Singleton pattern to enable lazy construction of the model and processor.
class PipelineSingleton {
    static modelName = 'briaai/RMBG-1.4';
    static model = null;
    static processor = null;

    static async getInstance(progress_callback = null) {
        if (!this.model || !this.processor) {
            // Load model and processor
            self.postMessage({
                status: 'initiate',
                message: 'Starting model download...'
            });

            // Track loading progress for model
            let modelLoaded = false;
            let processorLoaded = false;

            const modelProgressCallback = (progress) => {
                console.log('Model progress:', progress);
                if (progress_callback) progress_callback(progress);

                // Handle different progress types
                if (progress.status === 'progress' && progress.file) {
                    self.postMessage({
                        status: 'progress',
                        type: 'model',
                        file: progress.file,
                        progress: progress.progress,
                        loaded: progress.loaded,
                        total: progress.total,
                        message: `Downloading model file: ${progress.file} (${Math.round(progress.progress)}%)`
                    });
                } else {
                    // Forward any other progress information
                    self.postMessage({
                        status: 'progress',
                        type: 'model',
                        message: progress.message || `Model loading: ${progress.status}`,
                        ...progress
                    });
                }
            };

            const processorProgressCallback = (progress) => {
                console.log('Processor progress:', progress);
                if (progress_callback) progress_callback(progress);

                // Handle different progress types
                if (progress.status === 'progress' && progress.file) {
                    self.postMessage({
                        status: 'progress',
                        type: 'processor',
                        file: progress.file,
                        progress: progress.progress,
                        loaded: progress.loaded,
                        total: progress.total,
                        message: `Downloading processor file: ${progress.file} (${Math.round(progress.progress * 100)}%)`
                    });
                } else {
                    // Forward any other progress information
                    self.postMessage({
                        status: 'progress',
                        type: 'processor',
                        message: progress.message || `Processor loading: ${progress.status}`,
                        ...progress
                    });
                }
            };

            try {
                self.postMessage({
                    status: 'progress',
                    type: 'info',
                    message: 'Loading model...'
                });

                this.model = await AutoModel.from_pretrained(this.modelName, {
                    // Do not require config.json to be present in the repository
                    config: { model_type: 'custom' },
                    progress_callback: modelProgressCallback
                });

                modelLoaded = true;
                self.postMessage({
                    status: 'progress',
                    type: 'info',
                    message: 'Model loaded successfully! Loading processor...'
                });

                this.processor = await AutoProcessor.from_pretrained(this.modelName, {
                    // Do not require config.json to be present in the repository
                    config: {
                        do_normalize: true,
                        do_pad: false,
                        do_rescale: true,
                        do_resize: true,
                        image_mean: [0.5, 0.5, 0.5],
                        feature_extractor_type: "ImageFeatureExtractor",
                        image_std: [1, 1, 1],
                        resample: 2,
                        rescale_factor: 0.00392156862745098,
                        size: { width: 1024, height: 1024 },
                    },
                    progress_callback: processorProgressCallback
                });

                processorLoaded = true;
                self.postMessage({
                    status: 'progress',
                    type: 'info',
                    message: 'Processor loaded successfully! Ready to process images.'
                });

                self.postMessage({
                    status: 'ready',
                    message: 'Model and processor are ready!'
                });

            } catch (error) {
                self.postMessage({
                    status: 'error',
                    error: `Failed to load ${modelLoaded ? 'processor' : 'model'}: ${error.message}`
                });
                throw error;
            }
        }
        return { model: this.model, processor: this.processor };
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    try {
        // Handle different message types
        if (event.data.type === 'init') {
            // Initialize model and processor
            await PipelineSingleton.getInstance(x => {
                // Track model loading progress
                self.postMessage(x);
            });
        } else if (event.data.imageUrl) {
            // Process image
            console.log('Worker: Starting image processing');
            const { model, processor } = await PipelineSingleton.getInstance(x => {
                // Track model loading progress
                self.postMessage(x);
            });

            // Read image from data URL
            console.log('Worker: Loading image from URL');
            const image = await RawImage.fromURL(event.data.imageUrl);

            // Preprocess image
            console.log('Worker: Preprocessing image');
            const { pixel_values } = await processor(image);

            // Predict alpha matte
            console.log('Worker: Running model prediction');
            const { output } = await model({ input: pixel_values });

            // Resize mask back to original size
            console.log('Worker: Resizing mask');
            const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);

            // Create canvas to process the result
            const canvas = new OffscreenCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');

            // Draw original image to canvas
            const imgBitmap = await createImageBitmap(image.toCanvas());
            ctx.drawImage(imgBitmap, 0, 0);

            // Update alpha channel with the mask
            const pixelData = ctx.getImageData(0, 0, image.width, image.height);
            for (let i = 0; i < mask.data.length; ++i) {
                pixelData.data[4 * i + 3] = mask.data[i];
            }
            ctx.putImageData(pixelData, 0, 0);

            // Convert canvas to blob
            const blob = await canvas.convertToBlob();
            const arrayBuffer = await blob.arrayBuffer();

            // Send the result back to the main thread
            self.postMessage({
                status: 'complete',
                output: {
                    width: image.width,
                    height: image.height,
                    imageData: arrayBuffer
                },
            });
        }
    } catch (error) {
        self.postMessage({
            status: 'error',
            error: error.message
        });
    }
});
