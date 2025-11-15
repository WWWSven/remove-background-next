'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { workerPool } from './worker-pool'
import ImageSlider from './ImageSlider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Upload, Image as ImageIcon, CheckCircle2, Loader2, X, Zap, Sparkles, FileImage } from 'lucide-react'

export default function Home() {

  // Keep track of the processing result and the model loading status.
  const [ready, setReady] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [progress, setProgress] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showModelReady, setShowModelReady] = useState(false);
  const [workerPoolStats, setWorkerPoolStats] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [initProgress, setInitProgress] = useState(null); // Model initialization progress

  // Create a ref to store the latest processImage function
  const processImageRef = useRef(null);

  // We use the `useEffect` hook to set up the worker pool as soon as the `App` component is mounted.
  useEffect(() => {
    // Initialize worker pool with progress callback
    workerPool.initialize((progressData) => {
      // Handle initialization progress
      setInitProgress(progressData);
    });

    // Monitor worker pool status
    const checkWorkerPoolStatus = () => {
      const stats = workerPool.getStats();
      setWorkerPoolStats(stats);

      // Check if any worker is ready
      if (stats.readyWorkers > 0 && !ready) {
        setReady(true);
        setShowModelReady(true);
        // Clear init progress when ready
        setInitProgress(null);
      } else if (stats.readyWorkers === 0 && ready) {
        setReady(false);
      }
    };

    // Check status initially and then periodically
    checkWorkerPoolStatus();
    const interval = setInterval(checkWorkerPoolStatus, 1000);

    // Define a cleanup function for when the component is unmounted.
    return () => {
      clearInterval(interval);
      // Note: We don't terminate the worker pool here as it's a singleton
      // that should persist across component remounts
    };
  }, [ready]);

  // Auto-hide model ready message after 2 seconds
  useEffect(() => {
    if (showModelReady) {
      const timer = setTimeout(() => {
        setShowModelReady(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showModelReady]);

  const processImage = useCallback(async (imageUrl, imageId = null) => {
    if (!ready) {
      console.warn('Worker pool not ready yet');
      return;
    }

    setProcessing(true);

    try {
      const result = await workerPool.processImage(imageUrl, (progress) => {
        // Handle progress updates
        console.log('Processing progress:', progress);
        setProgress(progress);
      });

      // Update the processed status for the image
      if (imageId) {
        setUploadedImages(prev => {
          return prev.map(img =>
            img.id === imageId
              ? {
                  ...img,
                  processed: true,
                  processedUrl: URL.createObjectURL(new Blob([result.output.imageData])),
                  processedResult: result.output
                }
              : img
          );
        });
      }

      return result;
    } catch (error) {
      console.error('Image processing error:', error);
      setProgress({ message: `Error: ${error.message}`, type: 'error' });
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [ready]);

  // Update the processImage ref whenever processImage changes
  useEffect(() => {
    processImageRef.current = processImage;
  }, [processImage]);

  const handleFileUpload = useCallback((event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) {
      return;
    }

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = {
          id: Date.now() + Math.random(),
          url: e.target.result,
          name: file.name,
          size: file.size,
          processed: false
        };
        setUploadedImages(prev => [...prev, imageData]);
        // 不再自动设置selectedImage，初始时不显示预览
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImageSelect = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const handleRemoveImage = useCallback((imageId, event) => {
    event.stopPropagation();
    setUploadedImages(prev => prev.filter(img => img.id !== imageId));
    if (selectedImage && selectedImage.id === imageId) {
      setSelectedImage(uploadedImages.length > 1 ? uploadedImages[0] : null);
    }
  }, [selectedImage, uploadedImages]);

  const handleProcessImage = useCallback(async () => {
    if (selectedImage && ready && !selectedImage.processed) {
      try {
        await processImage(selectedImage.url, selectedImage.id);
      } catch (error) {
        console.error('Failed to process image:', error);
      }
    }
  }, [selectedImage, ready, processImage]);

  const handleProcessAll = useCallback(async () => {
    if (uploadedImages.length > 0 && ready && !batchProcessing) {
      const unprocessedImages = uploadedImages.filter(img => !img.processed);
      if (unprocessedImages.length === 0) {
        // All images are already processed
        return;
      }

      setBatchProcessing(true);
      setBatchProgress({ current: 0, total: unprocessedImages.length });

      try {
        // Process all images concurrently
        const processingPromises = unprocessedImages.map(async (image, index) => {
          try {
            await processImage(image.url, image.id);

            // Update batch progress
            setBatchProgress(prev => ({
              current: prev.current + 1,
              total: prev.total
            }));
          } catch (error) {
            console.error(`Failed to process image ${image.name}:`, error);
            // Continue processing other images even if one fails
          }
        });

        // Wait for all processing to complete
        await Promise.allSettled(processingPromises);

      } catch (error) {
        console.error('Batch processing error:', error);
      } finally {
        setBatchProcessing(false);
        setBatchProgress({ current: 0, total: 0 });
      }
    }
  }, [uploadedImages, ready, processImage, batchProcessing]);

  const handleExampleClick = useCallback(() => {
    if (uploadedImages.length > 0) {
      // Process all images
      handleProcessAll();
    } else {
      // Add example image
      const exampleUrl = 'https://images.pexels.com/photos/5965592/pexels-photo-5965592.jpeg?auto=compress&cs=tinysrgb&w=1024';
      const exampleImage = {
        id: 'example',
        url: exampleUrl,
        name: 'Example Image',
        size: 0,
        processed: false
      };
      setUploadedImages(prev => [...prev, exampleImage]);
      // 不再自动设置selectedImage，初始时不显示预览
    }
  }, [uploadedImages, handleProcessAll]);


  // Helper function to format bytes
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <main className="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen p-6">
      {/* Model Download Progress Banner */}
      {initProgress && !ready && (
        <div className="max-w-7xl mx-auto mb-6">
          <Card className="border-primary/50 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-base">
                      {initProgress.message || 'Downloading AI Model...'}
                    </CardTitle>
                    {initProgress.progress !== undefined && (
                      <span className="text-sm text-muted-foreground">
                        {Math.round(initProgress.progress)}%
                      </span>
                    )}
                  </div>
                  {initProgress.progress !== undefined && (
                    <Progress 
                      value={Math.round(initProgress.progress)} 
                      className="h-2"
                    />
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {initProgress.file && (
                      <span className="truncate flex-1">
                        File: {initProgress.file}
                      </span>
                    )}
                    {initProgress.loaded && initProgress.total && (
                      <span>
                        {formatBytes(initProgress.loaded)} / {formatBytes(initProgress.total)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-[calc(100vh-3rem)]">
        {/* Left Sidebar - Upload Section */}
        <Card className="lg:w-80 flex flex-col">
          <CardHeader>
            <CardTitle>Upload Images</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 min-h-0">

            {/* Upload Area */}
            <div className="space-y-4">
              <div className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center hover:border-primary/50 transition-colors bg-primary/5">
                <label className="cursor-pointer block">
                  <div className="text-primary mb-2">
                    <Upload className="w-12 h-12 mx-auto" />
                  </div>
                  <span className="text-primary font-medium">Click to upload</span>
                  <span className="text-muted-foreground block text-sm mt-1">or drag and drop</span>
                  <span className="text-muted-foreground/70 text-xs block mt-1">PNG, JPG, JPEG up to 10MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                    disabled={!ready || processing}
                  />
                </label>
              </div>

              <Button
                onClick={handleExampleClick}
                disabled={!ready || processing || batchProcessing}
                className="w-full"
                variant="default"
                size="lg"
              >
                {batchProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {uploadedImages.length > 0 ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Process All
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Use Example Image
                      </>
                    )}
                  </>
                )}
              </Button>
            </div>

            {/* Thumbnail Section */}
            {uploadedImages.length > 0 && (
              <div className="mt-6 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Images</h3>
                  <Badge variant="secondary" className="text-xs">
                    {uploadedImages.length}
                  </Badge>
                </div>
                <div className="flex-1 overflow-y-auto p-1 pr-2 min-h-0">
                  <div className="flex flex-col gap-2">
                    {uploadedImages.map((image) => (
                      <Card
                        key={image.id}
                        onClick={() => handleImageSelect(image)}
                        className={`relative cursor-pointer transition-all hover:shadow-md group ${
                          selectedImage?.id === image.id
                            ? 'border-primary shadow-md ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50'
                        } ${image.processed ? 'border-green-500/50' : ''}`}
                      >
                        <div className="relative h-32 overflow-hidden rounded-t-lg bg-muted flex items-center justify-center">
                          <img
                            src={image.url}
                            alt={image.name}
                            className="w-full h-full object-contain transition-transform group-hover:scale-105"
                          />
                          {processing && selectedImage?.id === image.id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-6 w-6 text-white animate-spin" />
                                <span className="text-xs text-white font-medium">Processing...</span>
                              </div>
                            </div>
                          )}
                          <Button
                            onClick={(e) => handleRemoveImage(image.id, e)}
                            variant="destructive"
                            size="icon-sm"
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <CardContent className="p-1.5">
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-medium truncate mb-0.5" title={image.name}>
                                {image.name}
                              </p>
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <FileImage className="h-2.5 w-2.5" />
                                <span>{formatBytes(image.size)}</span>
                              </div>
                            </div>
                          </div>
                          {image.processed && (
                            <Badge variant="outline" className="mt-1 text-[9px] w-full justify-center border-green-500/50 text-green-700 dark:text-green-400 py-0.5">
                              <CheckCircle2 className="h-2 w-2 mr-0.5" />
                              Processed
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Batch Processing Progress */}
            {batchProcessing && batchProgress.total > 0 && (
              <div className="mt-6">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle className="flex items-center justify-between">
                    Batch Processing
                    <span className="text-xs font-normal">
                      {batchProgress.current} / {batchProgress.total}
                    </span>
                  </AlertTitle>
                  <AlertDescription>
                    <Progress 
                      value={Math.round((batchProgress.current / batchProgress.total) * 100)} 
                      className="mt-2"
                    />
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Model Status */}
            {ready !== null && (
              <div className="mt-6 space-y-3">
                {!ready && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Loading AI Model...</AlertTitle>
                    {progress && (
                      <AlertDescription>
                        <div className="text-xs mb-2">
                          {progress.message || 'Downloading model files...'}
                        </div>
                        {progress.progress !== undefined && (
                          <Progress 
                            value={Math.round(progress.progress)} 
                            className="mb-2"
                          />
                        )}
                        {progress.file && (
                          <div className="text-xs truncate">
                            File: {progress.file}
                          </div>
                        )}
                        {progress.loaded && progress.total && (
                          <div className="text-xs">
                            {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                          </div>
                        )}
                      </AlertDescription>
                    )}
                  </Alert>
                )}

                {showModelReady && (
                  <>
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-700" />
                      <AlertTitle className="text-green-700">Model Ready</AlertTitle>
                    </Alert>

                    {/* Worker Pool Stats */}
                    {workerPoolStats && (
                      <Alert>
                        <Zap className="h-4 w-4" />
                        <AlertTitle>Concurrent Processing</AlertTitle>
                        <AlertDescription>
                          <div className="text-xs space-y-1 mt-2">
                            <div>Workers: {workerPoolStats.readyWorkers}/{workerPoolStats.totalWorkers} ready</div>
                            <div>Active: {workerPoolStats.activeTasks} tasks</div>
                            <div>Queued: {workerPoolStats.queuedTasks} tasks</div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content Area */}
        <Card className="flex-1 flex flex-col">
          <CardContent className="flex-1 flex flex-col">
            {selectedImage ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="relative w-full">
                  {/* Always show ImageSlider when processed image is available */}
                  {selectedImage?.processedUrl ? (
                    <ImageSlider
                      originalImage={selectedImage.url}
                      processedImage={selectedImage.processedUrl}
                      imageName={selectedImage.name}
                      backgroundColor={backgroundColor}
                      onBackgroundColorChange={setBackgroundColor}
                    />
                  ) : (
                    <div className="flex flex-col items-center">
                      {/* Original Image */}
                      <Card className="mb-6 w-full max-w-md">
                        <CardHeader>
                          <CardTitle className="text-sm">Original</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="border-2 rounded-xl overflow-hidden shadow-md flex justify-center">
                            <img
                              src={selectedImage.url}
                              alt="Original"
                              className="max-h-64 object-contain"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Process Button */}
                      {!selectedImage.processed && (
                        <Button
                          onClick={handleProcessImage}
                          disabled={!ready || processing}
                          className="w-full max-w-md"
                          size="lg"
                        >
                          {processing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            'Remove Background'
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-muted-foreground mb-4">
                  <ImageIcon className="w-24 h-24 mx-auto" />
                </div>
                <CardTitle className="text-xl mb-2">No Image Selected</CardTitle>
                <CardDescription>Upload images to get started</CardDescription>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
