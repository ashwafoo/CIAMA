// OpenCV.js Loader (No changes from previous version)
const OPENCV_CDNS = [
  "https://docs.opencv.org/4.9.0/opencv.js",
  "https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.9.0/opencv.js",
  "https://unpkg.com/opencv.js@4.9.0/opencv.js"
];
let currentCDNIndex = 0;
function loadOpenCV() {
   return new Promise((resolve, reject) => {
     if (typeof cv !== 'undefined' && cv.onRuntimeInitialized) {
       console.log("OpenCV already loaded.");
       resolve();
       return;
     }
     const script = document.createElement("script");
     script.type = "text/javascript";
     let timedOut = false;
     const timeout = setTimeout(() => {
       timedOut = true;
       script.onerror(new Error(`Timeout loading ${script.src}`));
     }, 15000);
     script.src = OPENCV_CDNS[currentCDNIndex];
     script.async = true;
     script.onload = () => {
       if (timedOut) return;
       clearTimeout(timeout);
       console.log(`OpenCV.js loaded successfully from ${script.src}`);
       cv.onRuntimeInitialized = () => {
           console.log("OpenCV runtime initialized.");
           resolve();
       };
     };
     script.onerror = (error) => {
       clearTimeout(timeout);
       console.error(`Failed to load OpenCV from ${script.src}.`, error);
       // Attempt to remove the failed script tag
       try {
        document.body.removeChild(script);
       } catch (e) {
        // ignore if already removed or element not found
       }
       currentCDNIndex++;
       if (currentCDNIndex < OPENCV_CDNS.length) {
         console.log(`Trying next CDN: ${OPENCV_CDNS[currentCDNIndex]}`);
         loadOpenCV().then(resolve).catch(reject);
       } else {
         reject(new Error("Failed to load OpenCV.js from all available sources."));
       }
     };
     document.body.appendChild(script);
   });
}

/*****************
 * Camera Application Class
 *****************/
class CameraApp {
  handleKeyDown(event) {
    // 入力欄やボタンにフォーカスがある場合は無効化
    const tag = document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement.isContentEditable) return;

    if (this.shortcutToggle.checked) { // ショートカットが有効な場合のみ
        if (event.code === "Space") {
          event.preventDefault();
          if (!this.captureBtn.disabled) this.handleCaptureClick();
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (!this.saveBtn.disabled) this.saveImage();
        }
    }
  }

  constructor() {
    // DOM Elements
    this.videoElement = document.getElementById("video");
    this.liveCanvas = document.getElementById("liveCanvas");
    this.liveCtx = this.liveCanvas.getContext("2d", { willReadFrequently: true });
    this.processedCanvas = document.getElementById("processedCanvas");
    this.processedCtx = this.processedCanvas.getContext("2d");
    this.cameraSelect = document.getElementById("cameraSelect");
    this.captureBtn = document.getElementById("captureBtn");
    this.saveBtn = document.getElementById("saveBtn");
    this.toggleRectCheckbox = document.getElementById("toggleRect");
    this.errorElement = document.getElementById("error");
    this.rectSizeSelector = document.getElementById("rectSizeSelector");
    this.invertMaskCheckbox = document.getElementById("invertMask");
    this.loadConfigBtn = document.getElementById("loadConfigBtn");
    this.configFileInput = document.getElementById("configFileInput");
    this.resetConfigBtn = document.getElementById("resetConfigBtn");
    this.exportConfigBtn = document.getElementById("exportConfigBtn");
    this.shortcutToggle = document.getElementById("shortcutToggle");
    this.loadImageBtn = document.getElementById("loadImageBtn");
    this.imageFileInput = document.getElementById("imageFileInput");
    this.imageTransformControls = document.getElementById("imageTransformControls"); // Added

    // Sliders and their value displays
    this.hsvSliders = ["hueLow", "hueHigh", "satLow", "satHigh", "valLow", "valHigh"];
    this.hsvValues = {};

    // State
    this.currentStream = null;
    this.photoCaptured = false;
    this.liveRequestId = null;
    this.capturedImageData = null;
    this.isProcessing = false;
    this.invertMask = false; // Added

    // Modified: Rectangle ROI State (initial values from the default active button)
    const initialRectButton = this.rectSizeSelector.querySelector('.rect-size-btn.active');
    this.selectedRectWidth = parseInt(initialRectButton?.dataset.width || "400", 10);
    this.selectedRectHeight = parseInt(initialRectButton?.dataset.height || "200", 10);

    // Default HSV values
    this.defaultHSV = {
      hueLow: 0,
      hueHigh: 10,
      satLow: 100,
      satHigh: 255,
      valLow: 100,
      valHigh: 255
    };

    // Image Transform State
    this.imageTransform = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      lastOffsetX: 0,
      lastOffsetY: 0,
      loadedImg: null
    };

    // Bind methods
    this.startCamera = this.startCamera.bind(this);
    this.handleCaptureClick = this.handleCaptureClick.bind(this);
    this.saveImage = this.saveImage.bind(this);
    this.applyHSVFilter = this.applyHSVFilter.bind(this);
    this.liveLoop = this.liveLoop.bind(this);
    this.updateSliderValue = this.updateSliderValue.bind(this);
    this.toggleRectDisplay = this.toggleRectDisplay.bind(this);
    this.handleRectSizeChange = this.handleRectSizeChange.bind(this);
    this.handleInvertMaskChange = this.handleInvertMaskChange.bind(this);
    this.handleLoadConfigClick = this.handleLoadConfigClick.bind(this);
    this.handleConfigFileChange = this.handleConfigFileChange.bind(this);
    this.handleResetConfigClick = this.handleResetConfigClick.bind(this);
    this.handleExportConfigClick = this.handleExportConfigClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleLoadImageBtnClick = this.handleLoadImageBtnClick.bind(this);
    this.handleImageFileChange = this.handleImageFileChange.bind(this);
    this.handleCanvasWheel = this.handleCanvasWheel.bind(this);
    this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
    this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
    this.handleCanvasMouseUp = this.handleCanvasMouseUp.bind(this);
    this.handleResetImageTransform = this.handleResetImageTransform.bind(this);
  }

  // --- Initialization ---
  async init() {
    this.showError("");
    try {
      await this.loadCameraDevices();
      this.initUI();
      await this.startCamera();
      // グローバルにキーダウンイベントリスナーを追加（ショートカット有効/無効はinitUI内で制御）
      window.addEventListener("keydown", this.handleKeyDown);
    } catch (err) {
      this.showError(`Initialization failed: ${err.message}`);
      console.error(err);
      this.captureBtn.disabled = true;
    }
  }

  initUI() {
    this.captureBtn.addEventListener("click", this.handleCaptureClick);
    this.saveBtn.addEventListener("click", this.saveImage);
    this.cameraSelect.addEventListener("change", this.startCamera);
    this.toggleRectCheckbox.addEventListener("change", this.toggleRectDisplay);

    // Initialize sliders
    this.hsvSliders.forEach(id => {
      const slider = document.getElementById(id);
      const span = document.getElementById(id + "Val");
      if (slider && span) {
        this.hsvValues[id] = parseInt(slider.value, 10);
        span.textContent = slider.value;
        slider.addEventListener("input", () => this.updateSliderValue(id, slider.value));
      }
    });

    // Initialize rectangle size buttons
    this.rectSizeSelector.querySelectorAll('.rect-size-btn').forEach(button => {
        button.addEventListener('click', this.handleRectSizeChange);
    });

    // Initialize invert mask checkbox
    this.invertMaskCheckbox.addEventListener("change", this.handleInvertMaskChange);

    //  設定ファイル読込ボタン
    this.loadConfigBtn.addEventListener("click", this.handleLoadConfigClick);
    this.configFileInput.addEventListener("change", this.handleConfigFileChange);

    // リセット・エクスポートボタン
    this.resetConfigBtn.addEventListener("click", this.handleResetConfigClick);
    this.exportConfigBtn.addEventListener("click", this.handleExportConfigClick);

    // ショートカットON/OFF (イベントリスナーの追加/削除はinitで実施、ここではチェックボックス変更時のハンドリングは不要)
    // this.shortcutToggle.addEventListener("change", ...)は削除

    // 画像読込ボタン
    this.loadImageBtn.addEventListener("click", this.handleLoadImageBtnClick);
    this.imageFileInput.addEventListener("change", this.handleImageFileChange);

    // 画像操作用ボタン追加
    if (this.imageTransformControls && !this.imageTransformControls.innerHTML) { // Check if empty
      this.imageTransformControls.innerHTML = `
        <button id="zoomInBtn" type="button">拡大</button>
        <button id="zoomOutBtn" type="button">縮小</button>
        <button id="resetTransformBtn" type="button">リセット</button>
        <span style="font-size:0.95em;color:#888;">※画像上でドラッグ移動・ホイール拡大縮小も可</span>
      `;
      // Add event listeners only if buttons were just added
      document.getElementById("zoomInBtn").addEventListener("click", () => this.zoomImage(1.2));
      document.getElementById("zoomOutBtn").addEventListener("click", () => this.zoomImage(1/1.2));
      document.getElementById("resetTransformBtn").addEventListener("click", this.handleResetImageTransform);
    }

    // Canvasイベント
    this.liveCanvas.addEventListener("wheel", this.handleCanvasWheel, { passive: false });
    this.liveCanvas.addEventListener("mousedown", this.handleCanvasMouseDown);
    window.addEventListener("mousemove", this.handleCanvasMouseMove); // Use window to capture mouse move outside canvas
    window.addEventListener("mouseup", this.handleCanvasMouseUp); // Use window to capture mouse up outside canvas
  }

  // --- Camera Handling ---
  // loadCameraDevices, startCamera, stopCameraStream, adjustCanvasSizes (No changes needed here)
  async loadCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      this.cameraSelect.innerHTML = ""; // Clear existing options

      if (videoDevices.length === 0) {
        throw new Error("No camera devices found.");
      }

      // スマホかどうか判定
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      // カメラの facingMode 情報を取得
      let rearCameraIndex = -1;
      let frontCameraIndex = -1;

      videoDevices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        // ラベルが取得できない場合は推測
        let label = device.label || `Camera ${index + 1}`;
        if (isMobile) {
          // ラベルに "back" や "rear" が含まれていればリアカメラ
          if (/back|rear|environment/i.test(label)) {
            rearCameraIndex = index;
          }
          // ラベルに "front" や "user" が含まれていればフロントカメラ
          if (/front|user/i.test(label)) {
            frontCameraIndex = index;
          }
        }
        option.text = label;
        this.cameraSelect.appendChild(option);
      });

      // スマホの場合はリアカメラをデフォルト選択
      if (isMobile && rearCameraIndex !== -1) {
        this.cameraSelect.selectedIndex = rearCameraIndex;
      } else {
        this.cameraSelect.selectedIndex = 0;
      }
    } catch (err) {
      throw new Error(`Failed to enumerate devices: ${err.message}`);
    }
  }

  async startCamera() {
    this.imageTransform.loadedImg = null; // Reset loaded image state
    this.imageTransformControls.style.display = "none"; // Hide image controls

    if (this.currentStream) {
      this.stopCameraStream(); // Stop existing stream before starting a new one
    }
    if (this.liveRequestId) {
        cancelAnimationFrame(this.liveRequestId);
        this.liveRequestId = null;
    }

    // スマホの場合は facingMode でリア/フロントを指定
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    let selectedDeviceId = this.cameraSelect.value;
    let constraints = {
      video: {},
      audio: false
    };

    if (isMobile) {
      // 選択肢のラベルからfront/backを判別し、facingModeのみ指定
      const selectedOption = this.cameraSelect.options[this.cameraSelect.selectedIndex];
      const label = selectedOption ? selectedOption.text.toLowerCase() : "";
      if (/back|rear|environment/.test(label)) {
        constraints.video = { facingMode: { exact: "environment" } };
      } else if (/front|user/.test(label)) {
        constraints.video = { facingMode: { exact: "user" } };
      } else {
        constraints.video = true; // fallback
      }
    } else {
      // PCはdeviceIdのみ指定
      constraints.video = { deviceId: { exact: selectedDeviceId } };
    }

    try {
      this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.currentStream;
      await new Promise((resolve) => {
          this.videoElement.onloadedmetadata = () => {
              this.videoElement.play().then(resolve).catch(e => {
                 console.error("Error playing video:", e);
                 this.showError(`カメラの再生に失敗: ${e.message}`);
              });
          };
      });

      this.adjustCanvasSizes(); // Adjust canvas sizes based on video dimensions
      this.switchToLiveView(); // Switch to live view and start loop
      this.captureBtn.disabled = false;

    } catch (err) {
      this.showError(`Failed to start camera: ${err.message}. Please check permissions.`);
      console.error(err);
      this.captureBtn.disabled = true;
    }
  }

  stopCameraStream() {
      if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
          this.currentStream = null;
          this.videoElement.srcObject = null;
          console.log("Camera stream stopped.");
      }
      if (this.liveRequestId) {
        cancelAnimationFrame(this.liveRequestId);
        this.liveRequestId = null;
        console.log("Live loop stopped.");
      }
  }

  adjustCanvasSizes() {
      // Ensure video metadata is loaded before getting dimensions
      const setSizes = () => {
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        if (videoWidth > 0 && videoHeight > 0) {
            this.liveCanvas.width = videoWidth;
            this.liveCanvas.height = videoHeight;
            this.processedCanvas.width = videoWidth;
            this.processedCanvas.height = videoHeight;
            console.log(`Canvas size set to: ${videoWidth}x${videoHeight}`);
            // If photo was captured, re-apply filter with potentially new canvas size
            if (this.photoCaptured && this.capturedImageData) {
                 this.applyHSVFilter();
            }
        } else {
            console.warn("Video dimensions not available yet for canvas sizing.");
        }
      };

      if (this.videoElement.readyState >= this.videoElement.HAVE_METADATA) {
          setSizes();
      } else {
          // Use a temporary event listener if metadata not loaded yet
          const onMetadataLoaded = () => {
              this.videoElement.removeEventListener('loadedmetadata', onMetadataLoaded);
              setSizes();
          };
          this.videoElement.addEventListener('loadedmetadata', onMetadataLoaded);
      }
  }


  // --- View Switching ---
  switchToLiveView() {
    this.processedCanvas.style.display = "none";
    this.liveCanvas.style.display = "block";
    this.photoCaptured = false;
    this.capturedImageData = null;
    this.captureBtn.textContent = "写真を撮影";
    this.saveBtn.disabled = true;
    this.imageTransformControls.style.display = "none"; // Hide img controls
    if (this.videoElement.paused && this.currentStream) {
        this.videoElement.play().catch(e => console.error("Error resuming video:", e));
    }
    if (!this.liveRequestId && this.currentStream) {
        console.log("Starting live loop...");
        this.liveLoop();
    }
  }

  switchToProcessedView() {
    if (this.liveRequestId) {
        cancelAnimationFrame(this.liveRequestId);
        this.liveRequestId = null;
        console.log("Live loop stopped for processed view.");
    }
    this.liveCanvas.style.display = "none";
    this.processedCanvas.style.display = "block";
    if (this.currentStream) { // Pause video only if it's from camera stream
      this.videoElement.pause();
    }
    this.photoCaptured = true;
    this.captureBtn.textContent = "再撮影";
    this.saveBtn.disabled = false;
    if (this.imageTransform.loadedImg) { // Show controls if it was a loaded image
      this.imageTransformControls.style.display = "block";
    } else {
      this.imageTransformControls.style.display = "none";
    }
  }

  // --- Core Logic ---
  liveLoop() {
    if (!this.currentStream || this.videoElement.paused || this.videoElement.readyState < this.videoElement.HAVE_ENOUGH_DATA) {
      // If stream stopped or paused externally, don't reschedule
      if (this.currentStream) {
        this.liveRequestId = requestAnimationFrame(this.liveLoop);
      } else {
          console.log("Live loop stopping: No active stream.");
      }
      return;
    }

    // Ensure canvas context is valid before drawing
    if (this.liveCtx && this.liveCanvas.width > 0 && this.liveCanvas.height > 0) {
        this.liveCtx.drawImage(this.videoElement, 0, 0, this.liveCanvas.width, this.liveCanvas.height);

        if (this.toggleRectCheckbox.checked) {
          // Modified: Use selected rect size for drawing
          this.drawRectangle(this.liveCtx, this.liveCanvas.width, this.liveCanvas.height);
        }
    } else {
        console.warn("Live canvas context or dimensions invalid, skipping draw.");
    }

    this.liveRequestId = requestAnimationFrame(this.liveLoop);
  }

  handleCaptureClick() {
    if (this.isProcessing) return;

    // Case 1: Loaded image is being manipulated on liveCanvas -> Finalize
    if (this.imageTransform.loadedImg && !this.photoCaptured) {
      // Finalize the current view of liveCanvas as the captured image
      this.capturedImageData = this.liveCtx.getImageData(0, 0, this.liveCanvas.width, this.liveCanvas.height);
      this.switchToProcessedView(); // Switch to processed view
      this.applyHSVFilter(); // Apply filter to the finalized image
      return;
    }

    // Case 2: Camera live view or already processed view -> Capture/Recapture
    if (!this.photoCaptured) {
        if (!this.currentStream) { // If it's a loaded image scenario but somehow ended here
            this.showError("画像を読み込んで操作してください。");
            return;
        }
      this.capturePhoto(); // Capture from camera
    } else {
      this.recapturePhoto(); // Go back to live view (camera or image manipulation)
    }
  }

  capturePhoto() {
    if (!this.currentStream || this.videoElement.readyState < this.videoElement.HAVE_ENOUGH_DATA) {
        this.showError("カメラの準備ができていません。");
        return;
    }
    // Ensure canvas sizes match video dimensions right before capture
    if (this.liveCanvas.width !== this.videoElement.videoWidth || this.liveCanvas.height !== this.videoElement.videoHeight) {
        this.adjustCanvasSizes(); // Adjust if needed
    }

    // Draw current video frame onto liveCanvas first
    this.liveCtx.drawImage(this.videoElement, 0, 0, this.liveCanvas.width, this.liveCanvas.height);
    // Get ImageData from liveCanvas
    this.capturedImageData = this.liveCtx.getImageData(0, 0, this.liveCanvas.width, this.liveCanvas.height);

    this.switchToProcessedView();
    this.applyHSVFilter();
  }

  recapturePhoto() {
    // If it was a loaded image, go back to manipulating it on liveCanvas
    if (this.imageTransform.loadedImg) {
      this.photoCaptured = false; // Set back to manipulation mode
      this.liveCanvas.style.display = "block";
      this.processedCanvas.style.display = "none";
      this.imageTransformControls.style.display = "block"; // Show controls again
      this.saveBtn.disabled = true; // Disable save until finalized again
      this.captureBtn.textContent = "写真を撮影"; // Change button text back
      this.drawTransformedImage(); // Redraw the image for manipulation
    } else {
        // If it was from camera, just switch back to live camera view
        this.startCamera(); // Restart camera to ensure fresh stream and live loop
    }
  }

  // --- OpenCV Processing ---
  applyHSVFilter() {
    if (!this.photoCaptured || !this.capturedImageData || typeof cv === 'undefined' || this.isProcessing) {
      console.log("Skipping HSV filter application.", {photoCaptured: this.photoCaptured, capturedImageData: !!this.capturedImageData, cv: typeof cv, isProcessing: this.isProcessing});
      return;
    }
    if (this.capturedImageData.width === 0 || this.capturedImageData.height === 0) {
        this.showError("処理する画像データが無効です (0x0)。");
        return;
    }

    this.isProcessing = true;
    this.saveBtn.disabled = true; // Disable save during processing
    console.log("Applying HSV filter...");

    // Use setTimeout to allow UI update (e.g., disable button) before heavy processing
    setTimeout(() => {
        let src = null, bgr = null, hsv = null, mask = null, lower = null, upper = null;
        let maskColor = null, finalResult = null, finalRGBA = null, roiMask = null;

        try {
            console.time("OpenCV Processing"); // Start timer
            src = cv.matFromImageData(this.capturedImageData);
            if (src.empty()) {
                throw new Error("cv.matFromImageData created an empty Mat.");
            }
            console.log(`Source Mat created: ${src.cols}x${src.rows}, type: ${src.type()}`);

            bgr = new cv.Mat();
            cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
            hsv = new cv.Mat();
            cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);

            const hsvRange = {
                low: [this.hsvValues.hueLow, this.hsvValues.satLow, this.hsvValues.valLow, 0],
                high: [this.hsvValues.hueHigh, this.hsvValues.satHigh, this.hsvValues.valHigh, 255]
            };
            lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), hsvRange.low);
            upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), hsvRange.high);

            mask = new cv.Mat();
            cv.inRange(hsv, lower, upper, mask);

            if (this.invertMask) {
              cv.bitwise_not(mask, mask);
            }

            maskColor = new cv.Mat();
            // Ensure maskColor has 3 channels (BGR) to match finalResult
            cv.cvtColor(mask, maskColor, cv.COLOR_GRAY2BGR);

            finalResult = new cv.Mat();
            // Use addWeighted to blend the original BGR image with the mask color
            // src: original BGR image, alpha: weight (1.0 for full original)
            // maskColor: BGR mask (white where mask is set), beta: weight (e.g., 0.7 for 70% opacity)
            // gamma: scalar added (0.0)
            cv.addWeighted(bgr, 1.0, maskColor, 0.7, 0.0, finalResult);


            let percentage = 0;
            let percentageText = "N/A"; // Default text if rect not shown

            if (this.toggleRectCheckbox.checked) {
                const w = finalResult.cols; // Use finalResult dimensions
                const h = finalResult.rows;
                const targetRectWidth = this.selectedRectWidth;
                const targetRectHeight = this.selectedRectHeight;

                // Ensure rect coordinates are within image bounds
                const rectX = Math.max(0, Math.floor((w - targetRectWidth) / 2));
                const rectY = Math.max(0, Math.floor((h - targetRectHeight) / 2));
                // Adjust width/height if calculated rect goes out of bounds
                const rectW = Math.min(targetRectWidth, w - rectX);
                const rectH = Math.min(targetRectHeight, h - rectY);

                let redColor = new cv.Scalar(0, 0, 255); // BGR for red
                if (rectW > 0 && rectH > 0) {
                  // Draw rectangle on the finalResult (BGR)
                  cv.rectangle(finalResult, new cv.Point(rectX, rectY), new cv.Point(rectX + rectW, rectY + rectH), redColor, 3);

                  // Calculate percentage based on the original mask within the ROI
                  let roiRect = new cv.Rect(rectX, rectY, rectW, rectH);
                  roiMask = mask.roi(roiRect); // Use the original mask (before coloring/blending)
                  let totalArea = rectW * rectH;

                  // Count non-zero pixels (matching pixels if not inverted, non-matching if inverted)
                  let matchingPixels = cv.countNonZero(roiMask);
                  // Always calculate based on matching pixels relative to total area
                  percentage = totalArea > 0 ? (matchingPixels / totalArea) * 100 : 0;
                  percentageText = `${percentage.toFixed(1)}%`;
                  console.log(`ROI Area: ${totalArea}, Matching Pixels: ${matchingPixels}, Percentage: ${percentageText}`);

                } else {
                    console.warn("Rectangle dimensions are invalid (<=0). Cannot calculate percentage.");
                    percentageText = "Invalid Rect";
                }
            }

            // Convert final BGR result to RGBA for display on canvas
            finalRGBA = new cv.Mat();
            cv.cvtColor(finalResult, finalRGBA, cv.COLOR_BGR2RGBA);

            // Add percentage text to the final RGBA image
            if (this.toggleRectCheckbox.checked) {
                 let textPos = new cv.Point(finalRGBA.cols - 200, finalRGBA.rows - 20); // Adjust position as needed
                 let blueTextColor = new cv.Scalar(0, 0, 255, 255); // RGBA for Blue
                 cv.putText(finalRGBA, `Area: ${percentageText}`, textPos, cv.FONT_HERSHEY_SIMPLEX, 0.8, blueTextColor, 2);
            }

            // Ensure processedCanvas size matches the final image
            this.processedCanvas.width = finalRGBA.cols;
            this.processedCanvas.height = finalRGBA.rows;
            cv.imshow(this.processedCanvas, finalRGBA);
            console.log("Processed image shown on canvas.");

        } catch (e) {
            this.showError(`Image processing error: ${e.message}`);
            console.error("OpenCV Error:", e);
        } finally {
            // Clean up OpenCV Mats
            if (src) src.delete();
            if (bgr) bgr.delete();
            if (hsv) hsv.delete();
            if (mask) mask.delete();
            if (lower) lower.delete();
            if (upper) upper.delete();
            if (maskColor) maskColor.delete();
            if (finalResult) finalResult.delete();
            if (finalRGBA) finalRGBA.delete();
            if (roiMask) roiMask.delete(); // Ensure ROI mask is deleted
            console.timeEnd("OpenCV Processing"); // End timer

            this.isProcessing = false;
            if (this.photoCaptured) { // Re-enable save only if still in processed view
              this.saveBtn.disabled = false;
            }
            console.log("HSV filter application finished.");
        }
    }, 10); // Small timeout
  }


  updateSliderValue(id, value) {
    const numericValue = parseInt(value, 10);
    this.hsvValues[id] = numericValue;
    const span = document.getElementById(id + "Val");
    if (span) {
      span.textContent = numericValue;
    }
    // Apply filter immediately only if a photo has been captured and is displayed
    if (this.photoCaptured && this.processedCanvas.style.display === 'block') {
      this.applyHSVFilter();
    }
  }

  toggleRectDisplay() {
    // Redraw live view or re-apply filter depending on the current state
    if (this.photoCaptured && this.processedCanvas.style.display === 'block') {
      // If showing processed image, re-apply filter to add/remove rect and percentage
      this.applyHSVFilter();
    } else if (!this.photoCaptured && this.liveCanvas.style.display === 'block') {
       // If showing live view (camera or loaded image manipulation), need to redraw the frame
       if (this.imageTransform.loadedImg) {
           this.drawTransformedImage(); // Redraw loaded image with/without rect
       } else {
           // For live camera, the loop will handle it, but draw once immediately
           if (this.liveCtx && this.currentStream && !this.videoElement.paused) {
               this.liveCtx.drawImage(this.videoElement, 0, 0, this.liveCanvas.width, this.liveCanvas.height);
               if (this.toggleRectCheckbox.checked) {
                   this.drawRectangle(this.liveCtx, this.liveCanvas.width, this.liveCanvas.height);
               }
           }
       }
    }
  }

  handleRectSizeChange(event) {
    const targetButton = event.target.closest('.rect-size-btn');
    if (!targetButton || targetButton.classList.contains('active')) {
        return;
    }

    this.selectedRectWidth = parseInt(targetButton.dataset.width, 10);
    this.selectedRectHeight = parseInt(targetButton.dataset.height, 10);
    console.log(`Rectangle size changed to: ${this.selectedRectWidth}x${this.selectedRectHeight}`);

    // Update active button class
    this.rectSizeSelector.querySelectorAll('.rect-size-btn').forEach(button => {
        button.classList.remove('active');
    });
    targetButton.classList.add('active');

    // Re-apply filter or redraw based on current view
    this.toggleRectDisplay();
  }


  drawRectangle(context, canvasWidth, canvasHeight) {
    if (!context) return; // Add guard clause
    context.strokeStyle = "red";
    context.lineWidth = 3;
    const targetRectWidth = this.selectedRectWidth;
    const targetRectHeight = this.selectedRectHeight;

    // Calculate centered coordinates
    const rectX = Math.max(0, (canvasWidth - targetRectWidth) / 2);
    const rectY = Math.max(0, (canvasHeight - targetRectHeight) / 2);
    // Calculate actual width/height, ensuring they don't exceed canvas bounds from center
    const rectW = Math.min(targetRectWidth, canvasWidth - 2 * rectX);
    const rectH = Math.min(targetRectHeight, canvasHeight - 2 * rectY);

    if (rectW > 0 && rectH > 0) {
        // Save context state before changing transform/styles
        context.save();
        // Ensure drawing happens in standard coordinate system (no transforms applied)
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.strokeRect(rectX, rectY, rectW, rectH);
        // Restore previous context state
        context.restore();
    } else {
        console.warn("Rectangle dimensions are invalid, not drawing.", {rectX, rectY, rectW, rectH});
    }
  }

  handleInvertMaskChange() {
    this.invertMask = this.invertMaskCheckbox.checked;
    if (this.photoCaptured && this.processedCanvas.style.display === 'block') {
      this.applyHSVFilter();
    }
  }

  handleLoadConfigClick() {
    this.configFileInput.value = ""; // Reset file input
    this.configFileInput.click();
  }

  handleConfigFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        // Validate essential keys
        const keys = ["hueLow", "hueHigh", "satLow", "satHigh", "valLow", "valHigh"];
        let valid = true;
        keys.forEach(k => {
          if (typeof config[k] !== "number" || config[k] < 0 || config[k] > (k.startsWith("hue") ? 179 : 255)) {
            console.error(`Invalid value for ${k} in config: ${config[k]}`);
            valid = false;
          }
        });
        if (!valid) throw new Error("設定ファイルの値が無効です。");

        // Update UI and internal values
        keys.forEach(k => {
          const slider = document.getElementById(k);
          if (slider) {
            slider.value = config[k];
            this.hsvValues[k] = config[k];
            const span = document.getElementById(k + "Val");
            if (span) span.textContent = config[k];
          }
        });
        // Update invert mask state and UI
        if (typeof config.invertMask === "boolean") {
          this.invertMask = config.invertMask;
          this.invertMaskCheckbox.checked = config.invertMask;
        }
        // Re-apply filter if processed view is active
        if (this.photoCaptured && this.processedCanvas.style.display === 'block') {
           this.applyHSVFilter();
        }
        this.showError("設定ファイルを読み込みました。", true); // Show temporary success message
      } catch (err) {
        this.showError("設定ファイル読込エラー: " + err.message);
        console.error("Config load error:", err);
      }
    };
    reader.onerror = () => {
      this.showError("設定ファイルの読込に失敗しました。");
    };
    reader.readAsText(file, "utf-8");
  }

  handleResetConfigClick() {
    const keys = ["hueLow", "hueHigh", "satLow", "satHigh", "valLow", "valHigh"];
    keys.forEach(k => {
      const slider = document.getElementById(k);
      if (slider) {
        slider.value = this.defaultHSV[k];
        this.hsvValues[k] = this.defaultHSV[k];
        const span = document.getElementById(k + "Val");
        if (span) span.textContent = this.defaultHSV[k];
      }
    });
     // Reset invert mask as well
    this.invertMask = false;
    this.invertMaskCheckbox.checked = false;

    if (this.photoCaptured && this.processedCanvas.style.display === 'block') {
       this.applyHSVFilter();
    }
    this.showError("HSVフィルター設定をリセットしました。", true);
  }

  async handleExportConfigClick() {
    const keys = ["hueLow", "hueHigh", "satLow", "satHigh", "valLow", "valHigh"];
    const config = {};
    keys.forEach(k => config[k] = this.hsvValues[k]);
    config.invertMask = this.invertMask;

    const jsonStr = JSON.stringify(config, null, 2); // Pretty print JSON
    const defaultFileName = "hsv_config.json";

    // Use File System Access API if available
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'JSONファイル',
            accept: {'application/json': ['.json']}
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        this.showError("設定ファイルを保存しました。", true);
      } catch (e) {
        // Ignore AbortError if user cancels dialog
        if (e.name !== "AbortError") {
            this.showError("設定ファイルの保存に失敗しました: " + e.message);
            console.error("File save error:", e);
        }
      }
    } else {
      // Fallback to traditional download link
      try {
          const blob = new Blob([jsonStr], {type: "application/json"});
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = defaultFileName;
          document.body.appendChild(a); // Required for Firefox
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showError("設定ファイルをダウンロードしました。", true);
      } catch (e) {
          this.showError("設定ファイルのダウンロードに失敗しました: " + e.message);
          console.error("Fallback download error:", e);
      }
    }
  }


  handleLoadImageBtnClick() {
    this.imageFileInput.value = ""; // Reset file input
    this.imageFileInput.click();
  }

  handleImageFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        if (file) this.showError("画像ファイルを選択してください。");
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        // Stop camera stream and live loop if running
        this.stopCameraStream();

        // Reset transform state
        this.imageTransform.scale = 1;
        this.imageTransform.offsetX = 0;
        this.imageTransform.offsetY = 0;
        this.imageTransform.lastOffsetX = 0;
        this.imageTransform.lastOffsetY = 0;
        this.imageTransform.loadedImg = img;

        // Set canvas sizes based on the image
        this.liveCanvas.width = img.naturalWidth;
        this.liveCanvas.height = img.naturalHeight;
        this.processedCanvas.width = img.naturalWidth;
        this.processedCanvas.height = img.naturalHeight;

        // Switch to liveCanvas for manipulation
        this.liveCanvas.style.display = "block";
        this.processedCanvas.style.display = "none";
        this.imageTransformControls.style.display = "block"; // Show transform controls

        // Draw initial image
        this.drawTransformedImage();

        // Set state for image manipulation
        this.photoCaptured = false; // Not finalized yet
        this.captureBtn.textContent = "この画像で決定"; // Change button text
        this.captureBtn.disabled = false; // Enable capture button
        this.saveBtn.disabled = true; // Disable save until finalized

        this.showError("画像を読み込みました。調整後「この画像で決定」を押してください。", true);
      };
      img.onerror = () => {
        this.showError("画像の読み込みに失敗しました。");
      };
      img.src = e.target.result; // Read file as Data URL
    };
    reader.onerror = () => {
      this.showError("画像ファイルの読込に失敗しました。");
    };
    reader.readAsDataURL(file);
  }


  zoomImage(factor) {
    if (!this.imageTransform.loadedImg || this.photoCaptured) return; // Only zoom in manipulation mode
    const prevScale = this.imageTransform.scale;
    const newScale = Math.max(0.1, Math.min(10, this.imageTransform.scale * factor)); // Clamp scale
    const scaleRatio = newScale / prevScale;

    // Zoom towards canvas center
    const cx = this.liveCanvas.width / 2;
    const cy = this.liveCanvas.height / 2;
    this.imageTransform.offsetX = (this.imageTransform.offsetX - cx) * scaleRatio + cx;
    this.imageTransform.offsetY = (this.imageTransform.offsetY - cy) * scaleRatio + cy;
    this.imageTransform.scale = newScale;

    this.drawTransformedImage();
  }

  handleCanvasWheel(e) {
    if (!this.imageTransform.loadedImg || this.photoCaptured) return; // Only zoom in manipulation mode
    e.preventDefault(); // Prevent page scroll
    const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1); // Zoom factor
    const prevScale = this.imageTransform.scale;
    const newScale = Math.max(0.1, Math.min(10, this.imageTransform.scale * factor)); // Clamp scale
    const scaleRatio = newScale / prevScale;

    // Zoom towards mouse position
    const rect = this.liveCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    this.imageTransform.offsetX = (this.imageTransform.offsetX - mx) * scaleRatio + mx;
    this.imageTransform.offsetY = (this.imageTransform.offsetY - my) * scaleRatio + my;
    this.imageTransform.scale = newScale;

    this.drawTransformedImage();
  }

  handleCanvasMouseDown(e) {
    // Allow dragging only when an image is loaded and not yet finalized (captured)
    if (!this.imageTransform.loadedImg || this.photoCaptured) return;
    // Check if the click is on the canvas itself
    if (e.target === this.liveCanvas) {
        this.imageTransform.dragging = true;
        this.imageTransform.dragStartX = e.clientX;
        this.imageTransform.dragStartY = e.clientY;
        // Store the offset at the start of the drag
        this.imageTransform.lastOffsetX = this.imageTransform.offsetX;
        this.imageTransform.lastOffsetY = this.imageTransform.offsetY;
        this.liveCanvas.style.cursor = 'grabbing'; // Change cursor
    }
  }

  handleCanvasMouseMove(e) {
    // Only move if dragging is active
    if (!this.imageTransform.loadedImg || !this.imageTransform.dragging) return;
    const dx = e.clientX - this.imageTransform.dragStartX;
    const dy = e.clientY - this.imageTransform.dragStartY;
    // Calculate new offset based on the start offset and drag distance
    this.imageTransform.offsetX = this.imageTransform.lastOffsetX + dx;
    this.imageTransform.offsetY = this.imageTransform.lastOffsetY + dy;
    this.drawTransformedImage(); // Redraw with new offset
  }

  handleCanvasMouseUp(e) {
    // Stop dragging regardless of where mouse is released
    if (this.imageTransform.dragging) {
        this.imageTransform.dragging = false;
        this.liveCanvas.style.cursor = 'grab'; // Change cursor back
    }
  }

  handleResetImageTransform() {
    if (!this.imageTransform.loadedImg || this.photoCaptured) return; // Only reset in manipulation mode
    this.imageTransform.scale = 1;
    this.imageTransform.offsetX = 0;
    this.imageTransform.offsetY = 0;
    this.drawTransformedImage();
  }

  drawTransformedImage() {
    const img = this.imageTransform.loadedImg;
    if (!img || !this.liveCtx) return; // Check if image and context are valid

    const ctx = this.liveCtx;
    const canvasWidth = this.liveCanvas.width;
    const canvasHeight = this.liveCanvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Save default state
    ctx.save();

    // Apply transformations (scale and translate)
    // Translate first to the offset, then scale around the new origin (top-left of image)
    ctx.translate(this.imageTransform.offsetX, this.imageTransform.offsetY);
    ctx.scale(this.imageTransform.scale, this.imageTransform.scale);

    // Draw the image at (0,0) in the transformed coordinate space
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    // Restore default state (removes transformations)
    ctx.restore();

    // Draw the fixed red rectangle on top, without transformations
    if (this.toggleRectCheckbox.checked) {
      this.drawRectangle(ctx, canvasWidth, canvasHeight);
    }

     // Update the capturedImageData with the current transformed view
     // This is important if the user clicks "Capture" after transforming
     try {
       this.capturedImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
     } catch (e) {
       console.error("Failed to get ImageData after transform:", e);
       this.showError("画像の描画中にエラーが発生しました。");
     }
  }


  saveImage() {
    if (!this.photoCaptured || !this.processedCanvas || this.isProcessing) {
      this.showError("保存できる処理済み画像がありません。");
      return;
    }

    // Create timestamp
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`; // Use underscores for filename safety
    const defaultName = `processed_${iso}`;
    let imageName = prompt("保存する画像の名前を入力してください（拡張子は自動で付きます）", defaultName);
    if (!imageName || imageName.trim() === '') {
        console.log("Save cancelled by user.");
        return; // User cancelled or entered empty name
    }
    imageName = imageName.trim().replace(/\s+/g, '_'); // Sanitize filename

    try {
      // --- Save Processed Image ---
      const procLink = document.createElement("a");
      procLink.href = this.processedCanvas.toDataURL("image/png"); // Get data URL from processed canvas
      procLink.download = `${imageName}_processed.png`;
      procLink.click();
      console.log(`Processed image saved as ${procLink.download}`);

      // --- Save Original Image (before HSV filter, but potentially after transforms) ---
      if (this.capturedImageData) {
          const origCanvas = document.createElement('canvas');
          origCanvas.width = this.capturedImageData.width;
          origCanvas.height = this.capturedImageData.height;
          origCanvas.getContext('2d').putImageData(this.capturedImageData, 0, 0);

          const origLink = document.createElement("a");
          origLink.href = origCanvas.toDataURL("image/png");
          origLink.download = `${imageName}_original.png`;
          origLink.click();
          console.log(`Original image saved as ${origLink.download}`);
      } else {
          console.warn("Original capturedImageData not available for saving.");
      }


      // --- Calculate Percentage and Save CSV ---
      let percentage = 0;
      let percentageText = "N/A";
      let csvRectW = "N/A";
      let csvRectH = "N/A";

      if (this.toggleRectCheckbox.checked && typeof cv !== 'undefined' && this.capturedImageData) {
        let src = null, bgr = null, hsv = null, mask = null, lower = null, upper = null, roiMask = null;
        try {
          const w = this.capturedImageData.width;
          const h = this.capturedImageData.height;
          csvRectW = Math.min(this.selectedRectWidth, w); // Use actual potential rect size
          csvRectH = Math.min(this.selectedRectHeight, h);
          const rectX = Math.max(0, Math.floor((w - csvRectW) / 2));
          const rectY = Math.max(0, Math.floor((h - csvRectH) / 2));

          if (csvRectW > 0 && csvRectH > 0) {
              src = cv.matFromImageData(this.capturedImageData);
              bgr = new cv.Mat();
              cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
              hsv = new cv.Mat();
              cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
              lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
                this.hsvValues.hueLow, this.hsvValues.satLow, this.hsvValues.valLow, 0
              ]);
              upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
                this.hsvValues.hueHigh, this.hsvValues.satHigh, this.hsvValues.valHigh, 255
              ]);
              mask = new cv.Mat();
              cv.inRange(hsv, lower, upper, mask);
              if (this.invertMask) {
                cv.bitwise_not(mask, mask);
              }
              let roiRect = new cv.Rect(rectX, rectY, csvRectW, csvRectH);
              roiMask = mask.roi(roiRect);
              let totalArea = csvRectW * csvRectH;
              let matchingPixels = cv.countNonZero(roiMask);
              percentage = totalArea > 0 ? (matchingPixels / totalArea) * 100 : 0;
              percentageText = percentage.toFixed(1); // Keep as number string
          }
        } finally {
            // Clean up OpenCV Mats used for CSV calculation
            if (src) src.delete();
            if (bgr) bgr.delete();
            if (hsv) hsv.delete();
            if (mask) mask.delete();
            if (lower) lower.delete();
            if (upper) upper.delete();
            if (roiMask) roiMask.delete();
        }
      } else if (this.toggleRectCheckbox.checked) {
          console.warn("Cannot calculate percentage for CSV: OpenCV not available or no captured image data.");
          csvRectW = this.selectedRectWidth; // Still record intended size
          csvRectH = this.selectedRectHeight;
      }


      // CSV Headers and Row
      const csvHeaders = [
        "ファイル名", "撮影日時", "HueLow", "HueHigh", "SatLow", "SatHigh", "ValLow", "ValHigh",
        "矩形表示", "矩形幅(px)", "矩形高さ(px)", "面積割合(%)", "マスク反転"
      ];
      const csvRow = [
        `"${imageName}"`, // Enclose filename in quotes
        `"${iso.replace('T', ' ')}"` , // Enclose timestamp, replace T
        this.hsvValues.hueLow, this.hsvValues.hueHigh,
        this.hsvValues.satLow, this.hsvValues.satHigh,
        this.hsvValues.valLow, this.hsvValues.valHigh,
        this.toggleRectCheckbox.checked ? "Yes" : "No",
        csvRectW,
        csvRectH,
        percentageText, // Use calculated percentage or N/A
        this.invertMask ? "Yes" : "No"
      ];

      // Create CSV content ensuring proper quoting/escaping if needed (simple join here)
      const csvContent = [csvHeaders.join(','), csvRow.join(',')].join('\r\n');
      const csvBlob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" }); // Add BOM for Excel
      const csvLink = document.createElement("a");
      csvLink.href = URL.createObjectURL(csvBlob);
      csvLink.download = `${imageName}_info.csv`;
      csvLink.click();
      URL.revokeObjectURL(csvLink.href); // Clean up blob URL
      console.log(`Info CSV saved as ${csvLink.download}`);

      this.showError("画像とCSV情報を保存しました。", true);

    } catch (e) {
      this.showError(`画像またはCSVの保存に失敗しました: ${e.message}`);
      console.error("Save error:", e);
    }
  }


  showError(msg, temporary = false) {
      if (msg) {
        this.errorElement.textContent = msg;
        this.errorElement.style.display = "block";
        // If temporary, hide after a delay
        if (temporary) {
            setTimeout(() => {
                // Only hide if the message hasn't changed
                if (this.errorElement.textContent === msg) {
                    this.errorElement.style.display = "none";
                    this.errorElement.textContent = "";
                }
            }, 3000); // Hide after 3 seconds
        }
      } else {
        // Clear error immediately if msg is empty
        this.errorElement.style.display = "none";
        this.errorElement.textContent = "";
      }
    }
}

// --- Main Execution ---
async function main() {
    const loadingMessage = document.createElement('p');
    loadingMessage.id = 'loadingMessage'; // Give it an ID for easier removal
    loadingMessage.textContent = 'OpenCV.js をロード中...';
    document.querySelector('.container').appendChild(loadingMessage);
    const errorElement = document.getElementById("error");

    try {
        console.log("Attempting to load OpenCV...");
        await loadOpenCV();
        console.log("OpenCV loaded. Initializing application...");
        loadingMessage.textContent = 'OpenCV.js の初期化完了。アプリケーションを起動します...';
        const app = new CameraApp();
        await app.init(); // Initialize UI and camera
        console.log("Application initialized.");
        // Remove loading message only after successful app init
        loadingMessage.remove();
    } catch (error) {
        console.error("Failed to initialize the application:", error);
        // Ensure loading message is removed on error too
        const existingLoadingMsg = document.getElementById('loadingMessage');
        if (existingLoadingMsg) existingLoadingMsg.remove();

        const errorMsg = `致命的なエラー: ${error.message}. アプリケーションを開始できません。ページをリロードしてみてください。`;
        if (errorElement) {
            errorElement.textContent = errorMsg;
            errorElement.style.display = 'block';
        } else {
            alert(errorMsg); // Fallback if error element not found
        }
        // Disable core buttons on fatal error
        try {
             document.getElementById('captureBtn').disabled = true;
             document.getElementById('saveBtn').disabled = true;
             document.getElementById('loadImageBtn').disabled = true;
        } catch(e) {
            // Ignore if elements don't exist
        }
    }
}

// Wait for DOM content to be loaded before running main
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    // DOM already loaded
    main();
}