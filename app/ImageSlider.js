'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Palette, Download, Loader2 } from 'lucide-react'

/**
 * Custom hook for slider drag functionality
 */
function useSliderDrag(containerRef, setSliderPosition) {
  const isDraggingRef = useRef(false)
  const containerRectRef = useRef(null)
  const sliderHandleRef = useRef(null)
  const dividerLineRef = useRef(null)
  const lastMouseXRef = useRef(0)
  const animationFrameRef = useRef(null)

  // Direct DOM manipulation for immediate slider position updates
  const updateSliderPosition = useCallback((percentage) => {
    if (!sliderHandleRef.current || !dividerLineRef.current) return

    // Update slider handle position
    sliderHandleRef.current.style.left = `${percentage}%`
    dividerLineRef.current.style.left = `${percentage}%`

    // Update clip paths for images
    const leftImage = containerRef.current?.querySelector('.left-image')
    const rightImage = containerRef.current?.querySelector('.right-image')

    if (leftImage) {
      leftImage.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`
    }
    if (rightImage) {
      rightImage.style.clipPath = `inset(0 0 0 ${percentage}%)`
    }
  }, [containerRef])

  // Native event handlers - defined as regular functions to avoid reference issues
  function handleMouseMove(e) {
    if (!isDraggingRef.current) return
    // Store the latest mouse position
    lastMouseXRef.current = e.clientX
  }

  function handleTouchMove(e) {
    if (!isDraggingRef.current) return
    // Store the latest touch position
    lastMouseXRef.current = e.touches[0].clientX
  }

  function handleMouseUp() {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''

    // Stop animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Remove native event listeners
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)

    // Update React state with final position
    const finalPercentage = parseFloat(sliderHandleRef.current?.style.left || '50')
    setSliderPosition(finalPercentage)
  }

  function handleTouchEnd() {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false

    // Stop animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Remove native event listeners
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleTouchEnd)

    // Update React state with final position
    const finalPercentage = parseFloat(sliderHandleRef.current?.style.left || '50')
    setSliderPosition(finalPercentage)
  }

  // Animation loop for smooth updates
  const updateSliderFromMousePosition = useCallback(() => {
    if (!isDraggingRef.current || !containerRectRef.current) return

    const x = lastMouseXRef.current - containerRectRef.current.left
    const percentage = Math.max(0, Math.min(100, (x / containerRectRef.current.width) * 100))

    // Update DOM immediately
    updateSliderPosition(percentage)

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(updateSliderFromMousePosition)
  }, [updateSliderPosition])

  // Mouse event handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()

    // Update container rect immediately
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect()
    }

    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Store initial mouse position
    lastMouseXRef.current = e.clientX

    // Add native event listeners for real-time response
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateSliderFromMousePosition)

    // Update position immediately on mouse down
    const x = e.clientX - containerRectRef.current.left
    const percentage = Math.max(0, Math.min(100, (x / containerRectRef.current.width) * 100))
    updateSliderPosition(percentage)
  }, [containerRef, updateSliderPosition, updateSliderFromMousePosition])

  const handleTouchStart = useCallback((e) => {
    e.preventDefault()

    // Update container rect immediately
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect()
    }

    isDraggingRef.current = true

    // Store initial touch position
    lastMouseXRef.current = e.touches[0].clientX

    // Add native event listeners for real-time response
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateSliderFromMousePosition)

    // Update position immediately on touch start
    const x = e.touches[0].clientX - containerRectRef.current.left
    const percentage = Math.max(0, Math.min(100, (x / containerRectRef.current.width) * 100))
    updateSliderPosition(percentage)
  }, [containerRef, updateSliderPosition, updateSliderFromMousePosition])

  return {
    handleMouseDown,
    handleTouchStart,
    sliderHandleRef,
    dividerLineRef
  }
}

/**
 * Image Layer Component
 */
function ImageLayer({
  imageSrc,
  altText,
  label,
  position = 'left',
  sliderPosition,
  backgroundColor = null
}) {
  const clipPath = position === 'left'
    ? `inset(0 ${100 - sliderPosition}% 0 0)`
    : `inset(0 0 0 ${sliderPosition}%)`

  // For processed image with background color, we need to composite it
  const [compositedImage, setCompositedImage] = useState(null)
  const imageRef = useRef(null)

  useEffect(() => {
    if (position === 'right' && backgroundColor && imageSrc) {
      // Create a composited image with background color
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        
        // Fill with background color
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw the image on top (with transparency)
        ctx.drawImage(img, 0, 0)
        
        setCompositedImage(canvas.toDataURL())
      }
      img.src = imageSrc
    } else {
      setCompositedImage(null)
    }
  }, [imageSrc, backgroundColor, position])

  const displaySrc = position === 'right' && compositedImage ? compositedImage : imageSrc

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        ref={imageRef}
        src={displaySrc}
        alt={altText}
        className={`w-full h-full object-contain no-hover-effect ${position === 'left' ? 'left-image' : 'right-image'}`}
        style={{ clipPath }}
      />
    </div>
  )
}

/**
 * Slider Handle Component
 */
function SliderHandle({
  sliderPosition,
  onMouseDown,
  onTouchStart,
  sliderHandleRef,
  dividerLineRef
}) {
  return (
    <>
      {/* Divider Line */}
      <div
        ref={dividerLineRef}
        className="absolute top-0 bottom-0 w-0.5 bg-white opacity-50 z-5 no-transition"
        style={{
          left: `${sliderPosition}%`,
          transform: 'translateX(-50%)'
        }}
      />

      {/* Slider Handle */}
      <div
        ref={sliderHandleRef}
        className="absolute top-0 bottom-0 w-1 bg-white cursor-col-resize z-10 shadow-lg no-transition"
        style={{
          left: `${sliderPosition}%`,
          transform: 'translateX(-50%)'
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-12 bg-white rounded-full shadow-lg border-2 border-gray-300 flex items-center justify-center">
          <div className="flex flex-col space-y-1">
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Background Color Picker Component
 */
function BackgroundColorPicker({ color, onChange }) {
  const presetColors = [
    '#ffffff', // White
    '#000000', // Black
    '#f0f0f0', // Light Gray
    '#808080', // Gray
    '#ff0000', // Red
    '#00ff00', // Green
    '#0000ff', // Blue
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
    '#ffa500', // Orange
    '#800080', // Purple
  ]

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Background Color
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Color Input */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Custom Color:</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="w-12 h-8 rounded border border-border cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background"
              placeholder="#ffffff"
            />
          </div>
        </div>

        {/* Preset Colors */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Preset Colors:</label>
          <div className="grid grid-cols-6 gap-2">
            {presetColors.map((presetColor) => (
              <button
                key={presetColor}
                type="button"
                onClick={() => onChange(presetColor)}
                className={`w-full h-8 rounded border-2 transition-all hover:scale-110 ${
                  color === presetColor ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                }`}
                style={{ backgroundColor: presetColor }}
                title={presetColor}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Main ImageSlider Component
 */
export default function ImageSlider({
  originalImage,
  processedImage,
  imageName,
  backgroundColor = '#ffffff',
  onBackgroundColorChange
}) {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [downloading, setDownloading] = useState(false)
  const containerRef = useRef(null)

  const {
    handleMouseDown,
    handleTouchStart,
    sliderHandleRef,
    dividerLineRef
  } = useSliderDrag(containerRef, setSliderPosition)

  // Download function
  const handleDownload = useCallback(async () => {
    if (!processedImage) return

    setDownloading(true)
    try {
      // Create an image element to load the processed image
      const img = new Image()
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = processedImage
      })

      // Create canvas
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      // Fill with background color
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw the processed image on top (with transparency)
      ctx.drawImage(img, 0, 0)

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create blob')
          setDownloading(false)
          return
        }

        // Create download link
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        
        // Generate filename
        const originalName = imageName || 'image'
        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
        const extension = originalName.match(/\.[^/.]+$/) ? originalName.match(/\.[^/.]+$/)[0] : '.png'
        link.download = `${nameWithoutExt}_no_bg${extension}`
        
        // Trigger download
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Clean up
        URL.revokeObjectURL(url)
        setDownloading(false)
      }, 'image/png')
    } catch (error) {
      console.error('Download error:', error)
      setDownloading(false)
    }
  }, [processedImage, backgroundColor, imageName])

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Slider Container */}
      <div
        ref={containerRef}
        className="relative w-full h-96 bg-gray-100 rounded-xl overflow-hidden shadow-lg border-2 border-gray-200"
      >
        {/* Original Image Layer */}
        <ImageLayer
          imageSrc={originalImage}
          altText="Original"
          label="Original"
          position="left"
          sliderPosition={sliderPosition}
        />

        {/* Processed Image Layer */}
        <ImageLayer
          imageSrc={processedImage}
          altText="Background removed"
          label="Background Removed"
          position="right"
          sliderPosition={sliderPosition}
          backgroundColor={backgroundColor}
        />

        {/* Slider Handle */}
        <SliderHandle
          sliderPosition={sliderPosition}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          sliderHandleRef={sliderHandleRef}
          dividerLineRef={dividerLineRef}
        />
      </div>

      {/* Download Button and Background Color Picker */}
      <div className="mt-4 space-y-4">
        {/* Download Button */}
        <Button
          onClick={handleDownload}
          disabled={downloading || !processedImage}
          className="w-full"
          size="lg"
        >
          {downloading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download Processed Image
            </>
          )}
        </Button>

        {/* Background Color Picker */}
        {onBackgroundColorChange && (
          <BackgroundColorPicker
            color={backgroundColor}
            onChange={onBackgroundColorChange}
          />
        )}
      </div>
    </div>
  )
}